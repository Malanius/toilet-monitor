import { Logger } from '@aws-lambda-powertools/logger';
import { injectLambdaContext } from '@aws-lambda-powertools/logger/middleware';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { captureLambdaHandler } from '@aws-lambda-powertools/tracer/middleware';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import middy from '@middy/core';
import { z } from 'zod';

import { logErrors } from '@/common/lambda/log-errors';
import { toiletIdFromThingName } from '@/contracts/topics';

import { DoorReport } from './messages';
import { StaleRevisionError, StatusRepository } from './status-repository';
import { planStateWrites, statusFromDoor } from './transitions';

const env = z.object({ APP_NAME: z.string(), APP_ENV: z.string(), TABLE_NAME: z.string() }).parse(process.env);
const app = { appName: env.APP_NAME, appEnv: env.APP_ENV };

const tracer = new Tracer();
const logger = new Logger();
const repository = new StatusRepository(tracer.captureAWSv3Client(new DynamoDBClient({})), env.TABLE_NAME);

const MAX_ATTEMPTS = 3;

const lambdaHandler = async (event: unknown): Promise<void> => {
  // Invalid reports throw, so they end up in the async failure DLQ for inspection
  const report = DoorReport.parse(event);

  const toiletId = toiletIdFromThingName(app, report.thingName);
  if (!toiletId) {
    throw new Error(`Thing '${report.thingName}' doesn't belong to ${app.appName}/${app.appEnv}`);
  }
  logger.appendKeys({ toiletId });

  const observedAt = new Date(report.receivedAt).toISOString();
  const observation = { toiletId, status: statusFromDoor(report.door), connectivity: 'online', observedAt } as const;

  const fresh = await repository.touchDevice({
    toiletId,
    lastSeenAt: observedAt,
    lastWakeReason: report.reason,
    batteryMv: report.batteryMv,
  });
  if (!fresh) {
    logger.info('Newer report already recorded, skipping', { observedAt });
    return;
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const current = await repository.getState(toiletId);
    const writes = planStateWrites(current, observation);
    try {
      for (const item of writes) {
        await repository.putState(item);
        logger.info('State changed', {
          changeType: item.changeType,
          status: item.status,
          connectivity: item.connectivity,
        });
      }
      if (writes.length === 0) {
        logger.debug('No state change', { status: observation.status });
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

export const handler = middy(lambdaHandler)
  .use(captureLambdaHandler(tracer))
  .use(injectLambdaContext(logger, { clearState: true }))
  .use(logErrors(logger));
