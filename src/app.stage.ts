import { Aspects, Stage, type StageProps, Tag } from 'aws-cdk-lib';
import type { Construct } from 'constructs';

import { type AppInfo, isProd } from '@/common/app-info';
import { StateStack } from '@/state/state.stack';

interface AppStageProps extends StageProps, AppInfo {}

export class AppStage extends Stage {
  constructor(scope: Construct, id: string, props: AppStageProps) {
    super(scope, id, props);

    const { appName, appEnv } = props;

    const stackName = (name: string) => `${appName}-${appEnv}-${name}`;

    new StateStack(this, 'state', {
      appName,
      appEnv,
      stackName: stackName('state'),
      terminationProtection: isProd(props),
    });

    Aspects.of(this).add(new Tag('project', appName));
    Aspects.of(this).add(new Tag('env', appEnv));
  }
}
