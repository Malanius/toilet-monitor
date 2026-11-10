import {
  ConflictException,
  CreateScheduleCommand,
  type CreateScheduleCommandInput,
  ResourceNotFoundException,
  type SchedulerClient,
  UpdateScheduleCommand,
} from '@aws-sdk/client-scheduler';

import { atExpression, livenessScheduleName } from './liveness';
import type { LivenessTimeout } from './messages';

/** Where the per-toilet offline timers live and how they invoke the status processor back. */
export interface LivenessTimers {
  scheduler: SchedulerClient;
  groupName: string;
  roleArn: string;
  deadLetterQueueArn: string;
  /** The status processor, invoked with a `LivenessTimeout`. */
  functionArn: string;
}

/** Creates the toilet's one-time offline timer or moves it to `at`. */
export const armLivenessTimer = async (timers: LivenessTimers, toiletId: string, at: Date): Promise<void> => {
  const { scheduler, groupName, roleArn, deadLetterQueueArn, functionArn } = timers;
  const input: LivenessTimeout = { kind: 'livenessTimeout', toiletId };
  const schedule: CreateScheduleCommandInput = {
    Name: livenessScheduleName(toiletId),
    GroupName: groupName,
    ScheduleExpression: atExpression(at),
    FlexibleTimeWindow: { Mode: 'OFF' },
    ActionAfterCompletion: 'DELETE',
    Target: {
      Arn: functionArn,
      RoleArn: roleArn,
      Input: JSON.stringify(input),
      DeadLetterConfig: { Arn: deadLetterQueueArn },
    },
  };

  try {
    await scheduler.send(new UpdateScheduleCommand(schedule));
  } catch (error) {
    if (!(error instanceof ResourceNotFoundException)) throw error;
    try {
      await scheduler.send(new CreateScheduleCommand(schedule));
    } catch (createError) {
      // Created concurrently by another report of the same toilet
      if (!(createError instanceof ConflictException)) throw createError;
      await scheduler.send(new UpdateScheduleCommand(schedule));
    }
  }
};
