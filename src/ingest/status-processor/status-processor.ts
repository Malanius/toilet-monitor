import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import type { ITableV2 } from 'aws-cdk-lib/aws-dynamodb';
import { SqsDestination } from 'aws-cdk-lib/aws-lambda-destinations';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Queue, QueueEncryption } from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';

import type { AppInfo } from '@/common/app-info';
import { commonFunctionEnvironment } from '@/common/lambda/common-env';
import { commonFunctionProps } from '@/common/lambda/common-props';

import { StatusFunction } from './status-function';

export interface StatusProcessorProps extends AppInfo {
  table: ITableV2;
}

/** Turns device reports into STATE/DEVICE writes. Invoked asynchronously, failures go to the DLQ. */
export class StatusProcessor extends Construct {
  readonly function: StatusFunction;
  readonly deadLetterQueue: Queue;

  constructor(scope: Construct, id: string, props: StatusProcessorProps) {
    super(scope, id);

    const { appName, appEnv, table } = props;

    this.deadLetterQueue = new Queue(this, 'DeadLetterQueue', {
      encryption: QueueEncryption.SQS_MANAGED,
      enforceSSL: true,
      retentionPeriod: Duration.days(14),
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
      },
    });

    this.function.configureAsyncInvoke({
      retryAttempts: 2,
      maxEventAge: Duration.hours(1),
      onFailure: new SqsDestination(this.deadLetterQueue),
    });

    // Only what StatusRepository uses
    table.grant(this.function, 'dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem');
  }
}
