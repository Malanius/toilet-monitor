import { Logger } from '@aws-lambda-powertools/logger';
import { injectLambdaContext } from '@aws-lambda-powertools/logger/middleware';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { captureLambdaHandler } from '@aws-lambda-powertools/tracer/middleware';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { SchedulerClient } from '@aws-sdk/client-scheduler';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import middy from '@middy/core';
import type { Context } from 'aws-lambda';
import { z } from 'zod';

import { logErrors } from '@/common/lambda/log-errors';
import type { StateItem } from '@/contracts/status-item';
import { toiletIdFromThingName } from '@/contracts/topics';

import { decideOnTimeout, offlineAt } from './liveness';
import { armLivenessTimer, type LivenessTimers } from './liveness-timer';
import { type DoorReport, type LivenessTimeout, ProcessorEvent } from './messages';
import { getDevice, getState, putState, StaleRevisionError, type StatusTable, touchDevice } from './status-repository';
import { type Observation, planStateWrites, statusFromDoor } from './transitions';

const env = z
  .object({
    APP_NAME: z.string(),
    APP_ENV: z.string(),
    TABLE_NAME: z.string(),
    SCHEDULE_GROUP_NAME: z.string(),
    SCHEDULER_ROLE_ARN: z.string(),
    DEAD_LETTER_QUEUE_ARN: z.string(),
    OFFLINE_AFTER_SECONDS: z.coerce.number().int().positive(),
  })
  .parse(process.env);
const app = { appName: env.APP_NAME, appEnv: env.APP_ENV };

const tracer = new Tracer();
const logger = new Logger();
const table: StatusTable = {
  db: DynamoDBDocumentClient.from(tracer.captureAWSv3Client(new DynamoDBClient({})), {
    marshallOptions: { removeUndefinedValues: true },
  }),
  tableName: env.TABLE_NAME,
};
const scheduler = tracer.captureAWSv3Client(new SchedulerClient({}));

/** The timers invoke the function back by the unqualified ARN it was invoked with. */
const livenessTimers = (context: Context): LivenessTimers => ({
  scheduler,
  groupName: env.SCHEDULE_GROUP_NAME,
  roleArn: env.SCHEDULER_ROLE_ARN,
  deadLetterQueueArn: env.DEAD_LETTER_QUEUE_ARN,
  functionArn: context.invokedFunctionArn,
});

const MAX_ATTEMPTS = 3;

/** Applies an observation to the STATE item, retrying when another invocation wrote it meanwhile. */
const applyObservation = async (
  toiletId: string,
  observe: (current: StateItem | undefined) => Observation | undefined
) => {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const current = await getState(table, toiletId);
    const observation = observe(current);
    const writes = observation ? planStateWrites(current, observation) : [];
    try {
      for (const item of writes) {
        await putState(table, item);
        logger.info('State changed', {
          changeType: item.changeType,
          status: item.status,
          connectivity: item.connectivity,
        });
      }
      if (writes.length === 0) {
        logger.debug('No state change', { observation });
      }
      return;
    } catch (error) {
      if (!(error instanceof StaleRevisionError) || attempt === MAX_ATTEMPTS) {
        throw error;
      }
      logger.warn('Concurrent state write, retrying', { attempt });
    }
  }
};

const handleDoorReport = async (report: DoorReport, timers: LivenessTimers) => {
  const toiletId = toiletIdFromThingName(app, report.thingName);
  if (!toiletId) {
    throw new Error(`Thing '${report.thingName}' doesn't belong to ${app.appName}/${app.appEnv}`);
  }
  logger.appendKeys({ toiletId });

  const observedAt = new Date(report.receivedAt).toISOString();
  const fresh = await touchDevice(table, {
    toiletId,
    lastSeenAt: observedAt,
    lastWakeReason: report.reason,
    batteryMv: report.batteryMv,
  });
  if (!fresh) {
    logger.info('Newer report already recorded, skipping', { observedAt });
    return;
  }

  await applyObservation(toiletId, () => ({
    toiletId,
    status: statusFromDoor(report.door),
    connectivity: 'online',
    observedAt,
  }));

  const deadline = offlineAt(observedAt, env.OFFLINE_AFTER_SECONDS);
  await armLivenessTimer(timers, toiletId, deadline);
  logger.debug('Offline timer armed', { at: deadline.toISOString() });
};

const handleLivenessTimeout = async (timeout: LivenessTimeout, timers: LivenessTimers) => {
  const { toiletId } = timeout;
  logger.appendKeys({ toiletId });

  const device = await getDevice(table, toiletId);
  if (!device) {
    logger.warn('Timer fired for a toilet never seen, ignoring');
    return;
  }

  const decision = decideOnTimeout(device.lastSeenAt, env.OFFLINE_AFTER_SECONDS, new Date());
  if (decision.action === 'rearm') {
    await armLivenessTimer(timers, toiletId, decision.at);
    logger.info('Timer fired early, device was seen since, re-armed', { at: decision.at.toISOString() });
    return;
  }

  await applyObservation(toiletId, (current) =>
    // Nothing to go offline from without a state, the next report creates it
    current
      ? {
          toiletId,
          status: current.status,
          connectivity: 'offline',
          observedAt: decision.offlineAt.toISOString(),
        }
      : undefined
  );
};

const lambdaHandler = async (event: unknown, context: Context): Promise<void> => {
  // Invalid events throw, so they end up in the async failure DLQ for inspection
  const parsed = ProcessorEvent.parse(event);
  const timers = livenessTimers(context);

  switch (parsed.kind) {
    case 'doorReport':
      return handleDoorReport(parsed, timers);
    case 'livenessTimeout':
      return handleLivenessTimeout(parsed, timers);
  }
};

export const handler = middy(lambdaHandler)
  .use(captureLambdaHandler(tracer))
  .use(injectLambdaContext(logger, { clearState: true }))
  .use(logErrors(logger));
