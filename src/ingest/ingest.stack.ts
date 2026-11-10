import { type Duration, Stack, type StackProps } from 'aws-cdk-lib';
import type { ITableV2 } from 'aws-cdk-lib/aws-dynamodb';
import type { IScheduleGroup } from 'aws-cdk-lib/aws-scheduler';
import type { Construct } from 'constructs';

import type { AppInfo } from '@/common/app-info';

import { DoorTopicRule } from './door-topic-rule';
import { StatusProcessor } from './status-processor/status-processor';

export interface IngestStackProps extends StackProps, AppInfo {
  table: ITableV2;
  scheduleGroup: IScheduleGroup;
  /** Silence after which a toilet is marked offline. */
  offlineAfter: Duration;
}

/** Stateless processing of device reports into status state. */
export class IngestStack extends Stack {
  constructor(scope: Construct, id: string, props: IngestStackProps) {
    super(scope, id, props);

    const statusProcessor = new StatusProcessor(this, 'StatusProcessor', props);
    new DoorTopicRule(this, 'DoorTopicRule', {
      ...props,
      handler: statusProcessor.function,
    });
  }
}
