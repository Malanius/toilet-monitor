import { Stack, type StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';

import type { AppInfo } from '@/common/app-info';

import { DeviceAccess } from './device-access';
import { LivenessSchedules } from './liveness-schedules';
import { StatusEventBus } from './status-event-bus';
import { StatusEventsPipe } from './status-events-pipe';
import { StatusTable } from './status-table';

export interface StateStackProps extends StackProps, AppInfo {}

/** Stateful resources: status data, its change feed, the event bus, what device certificates depend on
 * and the group of the liveness timers. */
export class StateStack extends Stack {
  readonly statusTable: StatusTable;
  readonly statusEventBus: StatusEventBus;
  readonly livenessSchedules: LivenessSchedules;

  constructor(scope: Construct, id: string, props: StateStackProps) {
    super(scope, id, props);

    this.statusTable = new StatusTable(this, 'StatusTable', props);
    this.statusEventBus = new StatusEventBus(this, 'StatusEventBus', props);
    new StatusEventsPipe(this, 'StatusEventsPipe', {
      ...props,
      table: this.statusTable.table,
      bus: this.statusEventBus.bus,
    });
    new DeviceAccess(this, 'DeviceAccess', props);
    this.livenessSchedules = new LivenessSchedules(this, 'LivenessSchedules', props);
  }
}
