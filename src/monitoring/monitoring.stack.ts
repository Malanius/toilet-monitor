import { Stack, type StackProps } from 'aws-cdk-lib';
import type { IQueue } from 'aws-cdk-lib/aws-sqs';
import type { Construct } from 'constructs';

import type { AppInfo } from '@/common/app-info';

import { DeadLetterAlarms } from './dead-letter-alarms';

export interface MonitoringStackProps extends StackProps, AppInfo {
  deadLetterQueues: Record<string, IQueue>;
}

/** Alarms on the other stacks. Deployed to prod only. */
export class MonitoringStack extends Stack {
  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props);

    new DeadLetterAlarms(this, 'DeadLetterAlarms', props);
  }
}
