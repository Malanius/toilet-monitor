import { Aspects, Stage, type StageProps, Tag } from 'aws-cdk-lib';
import type { Construct } from 'constructs';

import { type AppInfo, isProd } from '@/common/app-info';
import { ConsumersStack } from '@/consumers/consumers.stack';
import { IngestStack } from '@/ingest/ingest.stack';
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

    new IngestStack(this, 'ingest', {
      appName,
      appEnv,
      stackName: stackName('ingest'),
      table: state.statusTable.table,
    });

    new ConsumersStack(this, 'consumers', {
      appName,
      appEnv,
      stackName: stackName('consumers'),
      bus: state.statusEventBus.bus,
    });

    Aspects.of(this).add(new Tag('project', appName));
    Aspects.of(this).add(new Tag('env', appEnv));
  }
}
