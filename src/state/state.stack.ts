import { Stack, type StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';

import type { AppInfo } from '@/common/app-info';

import { DeviceAccess } from './device-access';
import { StatusEventBus } from './status-event-bus';
import { StatusEventsPipe } from './status-events-pipe';
import { StatusTable } from './status-table';

export interface StateStackProps extends StackProps, AppInfo {}

/** Stateful resources: status data, its change feed, the event bus and what device certificates depend on. */
export class StateStack extends Stack {
  readonly statusTable: StatusTable;
  readonly statusEventBus: StatusEventBus;
  readonly statusEventsPipe: StatusEventsPipe;
  readonly deviceAccess: DeviceAccess;

  constructor(scope: Construct, id: string, props: StateStackProps) {
    super(scope, id, props);

    this.statusTable = new StatusTable(this, 'StatusTable', props);
    this.statusEventBus = new StatusEventBus(this, 'StatusEventBus', props);
    this.statusEventsPipe = new StatusEventsPipe(this, 'StatusEventsPipe', {
      ...props,
      table: this.statusTable.table,
      bus: this.statusEventBus.bus,
    });
    this.deviceAccess = new DeviceAccess(this, 'DeviceAccess', props);
  }
}
