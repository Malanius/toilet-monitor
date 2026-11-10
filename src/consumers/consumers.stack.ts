import { Stack, type StackProps } from 'aws-cdk-lib';
import type { IEventBus } from 'aws-cdk-lib/aws-events';
import type { Construct } from 'constructs';

import type { AppInfo } from '@/common/app-info';

import { StatusEventLog } from './status-event-log';

export interface ConsumersStackProps extends StackProps, AppInfo {
  bus: IEventBus;
}

/** Everything reacting to status events from the bus. */
export class ConsumersStack extends Stack {
  constructor(scope: Construct, id: string, props: ConsumersStackProps) {
    super(scope, id, props);

    new StatusEventLog(this, 'StatusEventLog', props);
  }
}
