#!/usr/bin/env node
import { env } from 'node:process';

import { App } from 'aws-cdk-lib';

import { AppStage } from './app.stage';
import { APP_NAME, REGION } from './common/deployment';

const appName = APP_NAME;
const appEnv = env.APP_ENV || 'dev';
const app = new App();

new AppStage(app, appEnv, {
  appName,
  appEnv,
  env: {
    account: env.CDK_DEFAULT_ACCOUNT,
    region: REGION,
  },
});

app.synth();
