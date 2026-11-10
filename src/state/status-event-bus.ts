import { Duration } from 'aws-cdk-lib';
import { EventBus } from 'aws-cdk-lib/aws-events';
import { Construct } from 'constructs';

import { type AppInfo, isProd } from '@/common/app-info';
import { EVENT_SOURCE } from '@/contracts/events';

export interface StatusEventBusProps extends AppInfo {}

/** Bus carrying the status events, archived for replays. */
export class StatusEventBus extends Construct {
  readonly bus: EventBus;

  constructor(scope: Construct, id: string, props: StatusEventBusProps) {
    super(scope, id);

    const { appName, appEnv } = props;

    this.bus = new EventBus(this, 'Bus', {
      eventBusName: `${appName}-${appEnv}`,
    });

    this.bus.archive('Archive', {
      description: `All ${EVENT_SOURCE} events, for replays`,
      eventPattern: { source: [EVENT_SOURCE] },
      // Duration.days(0) keeps events indefinitely
      retention: isProd(props) ? Duration.days(0) : Duration.days(30),
    });
  }
}
