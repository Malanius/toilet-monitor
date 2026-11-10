import { App, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { EventBus } from 'aws-cdk-lib/aws-events';

import { ConsumersStack } from './consumers.stack';
import { describe, test } from 'bun:test';

const synth = (appEnv = 'dev') => {
  const app = new App();
  const bus = new EventBus(new Stack(app, 'state'), 'Bus');
  return Template.fromStack(new ConsumersStack(app, 'consumers', { appName: 'toilet-monitor', appEnv, bus }));
};

describe('ConsumersStack', () => {
  const template = synth();

  test('status events from the bus go to the log group', () => {
    template.hasResourceProperties('AWS::Events::Rule', {
      EventBusName: Match.anyValue(),
      EventPattern: { source: ['toilet-monitor'] },
      Targets: [Match.objectLike({ Arn: Match.anyValue() })],
    });
    template.hasResourceProperties('AWS::Logs::LogGroup', {
      LogGroupName: '/aws/events/toilet-monitor/dev/status-events',
      RetentionInDays: 7,
    });
  });

  test('prod keeps the log longer', () => {
    synth('prod').hasResourceProperties('AWS::Logs::LogGroup', { RetentionInDays: 30 });
  });
});
