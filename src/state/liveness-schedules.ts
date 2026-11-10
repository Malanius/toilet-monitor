import { RemovalPolicy } from 'aws-cdk-lib';
import { ScheduleGroup } from 'aws-cdk-lib/aws-scheduler';
import { Construct } from 'constructs';

import type { AppInfo } from '@/common/app-info';

export interface LivenessSchedulesProps extends AppInfo {}

/**
 * Group of the per-toilet offline timers. The status processor creates and moves the schedules at runtime,
 * they're short-lived and recreated by the next device report, so nothing needs retaining.
 */
export class LivenessSchedules extends Construct {
  readonly group: ScheduleGroup;

  constructor(scope: Construct, id: string, props: LivenessSchedulesProps) {
    super(scope, id);

    const { appName, appEnv } = props;

    this.group = new ScheduleGroup(this, 'Group', {
      scheduleGroupName: `${appName}-${appEnv}-liveness`,
      removalPolicy: RemovalPolicy.DESTROY,
    });
  }
}
