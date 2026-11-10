import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import type { ITableV2 } from 'aws-cdk-lib/aws-dynamodb';
import { Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { SqsDestination } from 'aws-cdk-lib/aws-lambda-destinations';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import type { IScheduleGroup } from 'aws-cdk-lib/aws-scheduler';
import { Queue, QueueEncryption } from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';

import type { AppInfo } from '@/common/app-info';
import { commonFunctionEnvironment } from '@/common/lambda/common-env';
import { commonFunctionProps } from '@/common/lambda/common-props';

import { StatusFunction } from './status-function';

export interface StatusProcessorProps extends AppInfo {
  table: ITableV2;
  scheduleGroup: IScheduleGroup;
  offlineAfter: Duration;
}

/**
 * Turns device reports into STATE/DEVICE writes and keeps a per-toilet offline timer in EventBridge Scheduler,
 * which invokes it back when a toilet stays silent. Invoked asynchronously, failures go to the DLQ.
 */
export class StatusProcessor extends Construct {
  readonly function: StatusFunction;

  constructor(scope: Construct, id: string, props: StatusProcessorProps) {
    super(scope, id);

    const { appName, appEnv, table, scheduleGroup, offlineAfter } = props;

    const deadLetterQueue = new Queue(this, 'DeadLetterQueue', {
      encryption: QueueEncryption.SQS_MANAGED,
      enforceSSL: true,
      retentionPeriod: Duration.days(14),
    });

    // Role the offline timers invoke the function with
    const schedulerRole = new Role(this, 'SchedulerRole', {
      assumedBy: new ServicePrincipal('scheduler.amazonaws.com'),
    });

    const logGroup = new LogGroup(this, 'LogGroup', {
      logGroupName: `/${appName}/${appEnv}/status-processor`,
      retention: RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.function = new StatusFunction(this, 'Function', {
      ...commonFunctionProps,
      memorySize: 256,
      timeout: Duration.seconds(10),
      logGroup,
      environment: {
        ...commonFunctionEnvironment(props, 'status-processor'),
        TABLE_NAME: table.tableName,
        SCHEDULE_GROUP_NAME: scheduleGroup.scheduleGroupName,
        SCHEDULER_ROLE_ARN: schedulerRole.roleArn,
        DEAD_LETTER_QUEUE_ARN: deadLetterQueue.queueArn,
        OFFLINE_AFTER_SECONDS: `${offlineAfter.toSeconds()}`,
      },
    });

    this.function.configureAsyncInvoke({
      retryAttempts: 2,
      maxEventAge: Duration.hours(1),
      onFailure: new SqsDestination(deadLetterQueue),
    });

    // Only what StatusRepository uses
    table.grant(this.function, 'dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem');

    // Offline timers: the function moves them, they invoke it back. Scheduler invokes asynchronously, so the
    // retries and DLQ above apply, the DLQ on the schedule only catches failures to invoke at all.
    scheduleGroup.grantWriteSchedules(this.function);
    schedulerRole.grantPassRole(this.function.grantPrincipal);
    this.function.grantInvoke(schedulerRole);
    deadLetterQueue.grantSendMessages(schedulerRole);
  }
}
