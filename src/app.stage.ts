import { Aspects, Stage, type StageProps, Tag } from 'aws-cdk-lib';
import type { Construct } from 'constructs';

import { type AppInfo, isProd } from '@/common/app-info';
import { offlineAfter } from '@/common/liveness';
import { ConsumersStack } from '@/consumers/consumers.stack';
import { IngestStack } from '@/ingest/ingest.stack';
import { MonitoringStack } from '@/monitoring/monitoring.stack';
import { StateStack } from '@/state/state.stack';

interface AppStageProps extends StageProps, AppInfo {}

export class AppStage extends Stage {
  constructor(scope: Construct, id: string, props: AppStageProps) {
    super(scope, id, props);

    const { appName, appEnv } = props;

    const stackName = (name: string) => `${appName}-${appEnv}-${name}`;

    const state = new StateStack(this, 'state', {
      appName,
      appEnv,
      stackName: stackName('state'),
      terminationProtection: isProd(props),
    });

    const ingest = new IngestStack(this, 'ingest', {
      appName,
      appEnv,
      stackName: stackName('ingest'),
      table: state.statusTable.table,
      scheduleGroup: state.livenessSchedules.group,
      offlineAfter: offlineAfter(this),
    });

    new ConsumersStack(this, 'consumers', {
      appName,
      appEnv,
      stackName: stackName('consumers'),
      bus: state.statusEventBus.bus,
    });

    // Alarms cost money and nobody watches dev
    if (isProd(props)) {
      new MonitoringStack(this, 'monitoring', {
        appName,
        appEnv,
        stackName: stackName('monitoring'),
        deadLetterQueues: {
          'status-events-pipe': state.statusEventsPipe.deadLetterQueue,
          'status-processor': ingest.statusProcessor.deadLetterQueue,
          'door-topic-rule': ingest.doorTopicRule.errorQueue,
        },
      });
    }

    Aspects.of(this).add(new Tag('project', appName));
    Aspects.of(this).add(new Tag('env', appEnv));
  }
}
