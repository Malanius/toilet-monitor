import { App, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { Queue } from 'aws-cdk-lib/aws-sqs';

import { AppStage } from '@/app.stage';
import { HEARTBEAT_INTERVAL_CONTEXT_KEY } from '@/common/liveness';

import { MonitoringStack } from './monitoring.stack';
import { describe, expect, test } from 'bun:test';

describe('MonitoringStack', () => {
  const app = new App();
  const queues = new Stack(app, 'queues');
  const template = Template.fromStack(
    new MonitoringStack(app, 'monitoring', {
      appName: 'toilet-monitor',
      appEnv: 'prod',
      deadLetterQueues: { first: new Queue(queues, 'First'), second: new Queue(queues, 'Second') },
    })
  );

  test('every dead letter queue alarms on its first message and notifies the topic', () => {
    template.resourceCountIs('AWS::CloudWatch::Alarm', 2);
    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmName: 'toilet-monitor-prod-first-dead-letters',
      MetricName: 'ApproximateNumberOfMessagesVisible',
      Statistic: 'Maximum',
      Threshold: 1,
      ComparisonOperator: 'GreaterThanOrEqualToThreshold',
      TreatMissingData: 'notBreaching',
      AlarmActions: [{ Ref: Match.stringLikeRegexp('Topic') }],
      OKActions: [{ Ref: Match.stringLikeRegexp('Topic') }],
    });
    template.hasResourceProperties('AWS::SNS::Topic', { TopicName: 'toilet-monitor-prod-alarms' });
  });
});

describe('AppStage', () => {
  const stackNames = (appEnv: string) => {
    const app = new App({ context: { [HEARTBEAT_INTERVAL_CONTEXT_KEY]: 360 } });
    const stage = new AppStage(app, appEnv, { appName: 'toilet-monitor', appEnv, env: { region: 'eu-west-1' } });
    return stage.node.children.filter((child) => child instanceof Stack).map((stack) => (stack as Stack).stackName);
  };

  test('only prod gets the monitoring stack', () => {
    expect(stackNames('prod')).toContain('toilet-monitor-prod-monitoring');
    expect(stackNames('dev')).not.toContain('toilet-monitor-dev-monitoring');
  });
});
