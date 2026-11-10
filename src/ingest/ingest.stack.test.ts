import { App, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { AttributeType, TableV2 } from 'aws-cdk-lib/aws-dynamodb';

import { IngestStack } from './ingest.stack';
import { describe, expect, test } from 'bun:test';

const synth = () => {
  const app = new App();
  const tableStack = new Stack(app, 'tables');
  const table = new TableV2(tableStack, 'Table', { partitionKey: { name: 'pk', type: AttributeType.STRING } });
  return Template.fromStack(new IngestStack(app, 'ingest', { appName: 'toilet-monitor', appEnv: 'dev', table }));
};

describe('IngestStack', () => {
  const template = synth();

  test('door rule reads all door topics of the env and adds identity and receive time', () => {
    template.hasResourceProperties('AWS::IoT::TopicRule', {
      RuleName: 'toilet_monitor_dev_door',
      TopicRulePayload: {
        AwsIotSqlVersion: '2016-03-23',
        Sql: "SELECT door, reason, batteryMv, topic(4) AS thingName, timestamp() AS receivedAt FROM 'toilet-monitor/dev/toilets/+/door'",
        Actions: [{ Lambda: { FunctionArn: Match.anyValue() } }],
        ErrorAction: { Sqs: Match.objectLike({ QueueUrl: Match.anyValue() }) },
      },
    });
  });

  test('IoT may invoke the status processor', () => {
    template.hasResourceProperties('AWS::Lambda::Permission', {
      Action: 'lambda:InvokeFunction',
      Principal: 'iot.amazonaws.com',
    });
  });

  test('status processor failures go to its DLQ after two retries', () => {
    template.hasResourceProperties('AWS::Lambda::EventInvokeConfig', {
      MaximumRetryAttempts: 2,
      DestinationConfig: { OnFailure: { Destination: Match.anyValue() } },
    });
  });

  test('status processor may only read and write single items', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({ Action: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem'] }),
        ]),
      },
    });
  });

  test('status processor knows its table and env', () => {
    const [fn] = Object.values(template.findResources('AWS::Lambda::Function'));

    expect(fn?.Properties.Environment.Variables).toMatchObject({
      APP_NAME: 'toilet-monitor',
      APP_ENV: 'dev',
      TABLE_NAME: expect.anything(),
      NODE_OPTIONS: '--enable-source-maps',
    });
  });
});
