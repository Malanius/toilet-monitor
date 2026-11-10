import {
  CloudwatchLogsLogDestination,
  DynamicInput,
  Filter,
  FilterPattern,
  IncludeExecutionData,
  InputTransformation,
  LogLevel,
  Pipe,
} from '@aws-cdk/aws-pipes-alpha';
import { DynamoDBSource, DynamoDBStartingPosition } from '@aws-cdk/aws-pipes-sources-alpha';
import { EventBridgeTarget } from '@aws-cdk/aws-pipes-targets-alpha';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import type { ITableV2 } from 'aws-cdk-lib/aws-dynamodb';
import type { IEventBus } from 'aws-cdk-lib/aws-events';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Queue, QueueEncryption } from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';

import { type AppInfo, isProd } from '@/common/app-info';
import { EVENT_SOURCE, type StatusEventDetail } from '@/contracts/events';
import { ItemType, type StateItem } from '@/contracts/status-item';

export interface StatusEventsPipeProps extends AppInfo {
  table: ITableV2;
  bus: IEventBus;
}

const newImage = (attribute: keyof StateItem) => `$.dynamodb.NewImage.${attribute}.S`;
const fromNewImage = (attribute: keyof StateItem) => DynamicInput.fromEventPath(newImage(attribute));

/**
 * Turns STATE item changes from the table stream into status events on the bus.
 * DEVICE items (telemetry) and deletions are filtered out.
 */
export class StatusEventsPipe extends Construct {
  constructor(scope: Construct, id: string, props: StatusEventsPipeProps) {
    super(scope, id);

    const { appName, appEnv, table, bus } = props;
    const prod = isProd(props);

    const deadLetterQueue = new Queue(this, 'DeadLetterQueue', {
      encryption: QueueEncryption.SQS_MANAGED,
      enforceSSL: true,
      retentionPeriod: Duration.days(14),
    });

    const logGroup = new LogGroup(this, 'LogGroup', {
      logGroupName: `/${appName}/${appEnv}/status-events-pipe`,
      retention: RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // Typed against the contract, so a schema change breaks the build here
    const detail = {
      version: 1,
      toiletId: fromNewImage('toiletId'),
      status: fromNewImage('status'),
      connectivity: fromNewImage('connectivity'),
      changedAt: fromNewImage('changedAt'),
      previous: {
        status: fromNewImage('previousStatus'),
        connectivity: fromNewImage('previousConnectivity'),
        changedAt: fromNewImage('previousChangedAt'),
      },
    } satisfies Record<keyof StatusEventDetail, unknown>;

    new Pipe(this, 'Pipe', {
      description: 'Status table STATE changes -> status events',
      source: new DynamoDBSource(table, {
        startingPosition: DynamoDBStartingPosition.LATEST,
        deadLetterTarget: deadLetterQueue,
        maximumRetryAttempts: 5,
      }),
      filter: new Filter([
        FilterPattern.fromObject({
          eventName: ['INSERT', 'MODIFY'],
          dynamodb: { Keys: { sk: { S: [ItemType.State] } } },
        }),
      ]),
      target: new EventBridgeTarget(bus, {
        source: EVENT_SOURCE,
        // Dynamic paths read the original stream record, not the transformed input
        detailType: newImage('changeType'),
        time: newImage('changedAt'),
        inputTransformation: InputTransformation.fromObject(detail),
      }),
      logDestinations: [new CloudwatchLogsLogDestination(logGroup)],
      logLevel: prod ? LogLevel.ERROR : LogLevel.INFO,
      logIncludeExecutionData: prod ? undefined : [IncludeExecutionData.ALL],
    });
  }
}
