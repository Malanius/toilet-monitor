import { LambdaFunctionAction, SqsQueueAction } from '@aws-cdk/aws-iot-actions-alpha';
import { IotSql, TopicRule } from '@aws-cdk/aws-iot-alpha';
import { Duration } from 'aws-cdk-lib';
import type { IFunction } from 'aws-cdk-lib/aws-lambda';
import { Queue, QueueEncryption } from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';

import type { AppInfo } from '@/common/app-info';
import { DOOR_TOPIC_THING_SEGMENT, doorTopic } from '@/contracts/topics';

export interface DoorTopicRuleProps extends AppInfo {
  handler: IFunction;
}

/** Routes door reports from all devices to the status processor. */
export class DoorTopicRule extends Construct {
  readonly rule: TopicRule;
  readonly errorQueue: Queue;

  constructor(scope: Construct, id: string, props: DoorTopicRuleProps) {
    super(scope, id);

    const { appName, appEnv, handler } = props;

    // Receives the payload plus error details when the rule can't invoke the Lambda
    this.errorQueue = new Queue(this, 'ErrorQueue', {
      encryption: QueueEncryption.SQS_MANAGED,
      enforceSSL: true,
      retentionPeriod: Duration.days(14),
    });

    const sql = [
      'SELECT door, reason, batteryMv,',
      `topic(${DOOR_TOPIC_THING_SEGMENT}) AS thingName,`,
      'timestamp() AS receivedAt',
      `FROM '${doorTopic(props, '+')}'`,
    ].join(' ');

    this.rule = new TopicRule(this, 'Rule', {
      // Only alphanumerics and underscores are allowed
      topicRuleName: `${appName}_${appEnv}_door`.replace(/[^a-zA-Z0-9_]/g, '_'),
      description: 'Door reports -> status processor',
      sql: IotSql.fromStringAsVer20160323(sql),
      actions: [new LambdaFunctionAction(handler)],
      errorAction: new SqsQueueAction(this.errorQueue, { useBase64: false }),
    });
  }
}
