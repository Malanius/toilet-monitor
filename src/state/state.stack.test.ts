import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';

import { EVENT_SOURCE } from '@/contracts/events';

import { StateStack } from './state.stack';
import { describe, expect, test } from 'bun:test';

const synth = (appEnv: string) =>
  Template.fromStack(new StateStack(new App(), 'state', { appName: 'toilet-monitor', appEnv }));

describe('StateStack', () => {
  const template = synth('dev');

  test('table streams new images', () => {
    template.hasResourceProperties('AWS::DynamoDB::GlobalTable', {
      KeySchema: [
        { AttributeName: 'pk', KeyType: 'HASH' },
        { AttributeName: 'sk', KeyType: 'RANGE' },
      ],
      StreamSpecification: { StreamViewType: 'NEW_IMAGE' },
    });
  });

  test('bus is named per env and archives app events', () => {
    template.hasResourceProperties('AWS::Events::EventBus', { Name: 'toilet-monitor-dev' });
    template.hasResourceProperties('AWS::Events::Archive', {
      EventPattern: { source: [EVENT_SOURCE] },
      RetentionDays: 30,
    });
  });

  test('pipe forwards only STATE inserts and modifications', () => {
    const pipes = template.findResources('AWS::Pipes::Pipe');
    const [pipe] = Object.values(pipes);
    const [filter] = pipe?.Properties.SourceParameters.FilterCriteria.Filters ?? [];

    expect(JSON.parse(filter.Pattern)).toEqual({
      eventName: ['INSERT', 'MODIFY'],
      dynamodb: { Keys: { sk: { S: ['STATE'] } } },
    });
  });

  test('pipe maps the new image to the event contract', () => {
    template.hasResourceProperties('AWS::Pipes::Pipe', {
      SourceParameters: {
        DynamoDBStreamParameters: {
          StartingPosition: 'LATEST',
          MaximumRetryAttempts: 5,
          DeadLetterConfig: { Arn: Match.anyValue() },
        },
      },
      TargetParameters: {
        EventBridgeEventBusParameters: {
          Source: EVENT_SOURCE,
          DetailType: '$.dynamodb.NewImage.changeType.S',
          Time: '$.dynamodb.NewImage.changedAt.S',
        },
        InputTemplate: Match.stringLikeRegexp('"toiletId": ?<\\$\\.dynamodb\\.NewImage\\.toiletId\\.S>'),
      },
    });
  });
});

describe('StateStack in prod', () => {
  const template = synth('prod');

  test('table is protected and retained', () => {
    template.hasResource('AWS::DynamoDB::GlobalTable', {
      DeletionPolicy: 'Retain',
      Properties: Match.objectLike({
        Replicas: [Match.objectLike({ DeletionProtectionEnabled: true })],
      }),
    });
  });

  test('archive keeps events indefinitely', () => {
    template.hasResourceProperties('AWS::Events::Archive', { RetentionDays: 0 });
  });
});
