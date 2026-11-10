import { Stack, type StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';

import type { AppInfo } from '@/common/app-info';

import { StatusEventBus } from './status-event-bus';
import { StatusEventsPipe } from './status-events-pipe';
import { StatusTable } from './status-table';

export interface StateStackProps extends StackProps, AppInfo {}

/** Stateful resources: status data, its change feed and the event bus. */
export class StateStack extends Stack {
  readonly statusTable: StatusTable;
  readonly statusEventBus: StatusEventBus;
  readonly statusEventsPipe: StatusEventsPipe;

  constructor(scope: Construct, id: string, props: StateStackProps) {
    super(scope, id, props);

    this.statusTable = new StatusTable(this, 'StatusTable', props);
    this.statusEventBus = new StatusEventBus(this, 'StatusEventBus', props);
    this.statusEventsPipe = new StatusEventsPipe(this, 'StatusEventsPipe', {
      ...props,
      table: this.statusTable.table,
      bus: this.statusEventBus.bus,
    });
  }
}
