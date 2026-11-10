import { RemovalPolicy } from 'aws-cdk-lib';
import { type IEventBus, Rule } from 'aws-cdk-lib/aws-events';
import { CloudWatchLogGroup } from 'aws-cdk-lib/aws-events-targets';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

import { type AppInfo, isProd } from '@/common/app-info';
import { EVENT_SOURCE } from '@/contracts/events';

export interface StatusEventLogProps extends AppInfo {
  bus: IEventBus;
}

/** Logs every status event from the bus, to see what consumers receive. */
export class StatusEventLog extends Construct {
  readonly logGroup: LogGroup;
  readonly rule: Rule;

  constructor(scope: Construct, id: string, props: StatusEventLogProps) {
    super(scope, id);

    const { appName, appEnv, bus } = props;

    this.logGroup = new LogGroup(this, 'LogGroup', {
      // EventBridge only writes to log groups under /aws/events/
      logGroupName: `/aws/events/${appName}/${appEnv}/status-events`,
      retention: isProd(props) ? RetentionDays.ONE_MONTH : RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.rule = new Rule(this, 'Rule', {
      eventBus: bus,
      description: `Logs all ${EVENT_SOURCE} events`,
      eventPattern: { source: [EVENT_SOURCE] },
      targets: [new CloudWatchLogGroup(this.logGroup)],
    });
  }
}
