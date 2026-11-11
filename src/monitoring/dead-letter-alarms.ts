import { Duration } from 'aws-cdk-lib';
import { Alarm, ComparisonOperator, TreatMissingData } from 'aws-cdk-lib/aws-cloudwatch';
import { SnsAction } from 'aws-cdk-lib/aws-cloudwatch-actions';
import { Topic } from 'aws-cdk-lib/aws-sns';
import type { IQueue } from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';

import type { AppInfo } from '@/common/app-info';

export interface DeadLetterAlarmsProps extends AppInfo {
  /** Queues holding failed messages, by a short name used in the alarm name. */
  deadLetterQueues: Record<string, IQueue>;
}

/** Alarms as soon as any message lands in a dead letter queue, notifying the alarm topic. */
export class DeadLetterAlarms extends Construct {
  constructor(scope: Construct, id: string, props: DeadLetterAlarmsProps) {
    super(scope, id);

    const { appName, appEnv, deadLetterQueues } = props;

    // Subscribe to it (e.g. by email) outside CloudFormation
    const topic = new Topic(this, 'Topic', { topicName: `${appName}-${appEnv}-alarms` });
    const action = new SnsAction(topic);

    for (const [name, queue] of Object.entries(deadLetterQueues)) {
      const alarm = new Alarm(this, `${name}-alarm`, {
        alarmName: `${appName}-${appEnv}-${name}-dead-letters`,
        alarmDescription: `Messages failed and landed in the ${name} dead letter queue`,
        metric: queue.metricApproximateNumberOfMessagesVisible({
          period: Duration.minutes(5),
          statistic: 'Maximum',
        }),
        threshold: 1,
        comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        evaluationPeriods: 1,
        treatMissingData: TreatMissingData.NOT_BREACHING,
      });
      alarm.addAlarmAction(action);
      alarm.addOkAction(action);
    }
  }
}
