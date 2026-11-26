import { awscdk } from 'projen';
import { type AddBundleOptions, TypeScriptModuleResolution } from 'projen/lib/javascript';
import { NodePackageManager } from 'projen/lib/javascript/node-package';
import { ReleaseTrigger } from 'projen/lib/release';

import { biomeOptions } from './projenrc/biome';
import { context } from './projenrc/cdk';

const cdkVersion = '2.278.0';
const powertoolsVersion = 'v2.37.0';
const awsSdkVersion = '3.1177.0';
const middyVersion = '7.9.2';
const cdkAlphaVersion = `${cdkVersion}-alpha.0`;

const lambdaBundling = {
  externals: [],
  sourcemap: true,
  mainFields: ['module', 'main'],
  minify: true,
  format: 'esm',
  outfile: 'index.mjs',
  banner: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
} satisfies Partial<AddBundleOptions>;

const project = new awscdk.AwsCdkTypeScriptApp({
  name: 'toilet-monitor',
  authorName: 'Michal Slota',
  authorEmail: 'malaniusprivierre@gmail.com',
  license: 'MIT',

  cdkVersion,
  cdkVersionPinning: true,

  release: false,
  releaseTrigger: ReleaseTrigger.manual(),
  defaultReleaseBranch: 'main',
  github: false,

  packageManager: NodePackageManager.BUN,

  projenrcTs: true,
  tsconfig: {
    compilerOptions: {
      target: 'esnext',
      module: 'esnext',
      moduleResolution: TypeScriptModuleResolution.BUNDLER,
      lib: ['esnext'],
      types: ['aws-lambda', 'bun-types', 'node'],
      typeRoots: ['./node_modules/@types', './node_modules'],
      emitDecoratorMetadata: true,
      forceConsistentCasingInFileNames: true,
      skipLibCheck: true,
      // Type-check only (bundling is esbuild's job), so scripts outside src are fine
      rootDir: '.',
      paths: {
        '@/*': ['./src/*'],
      },
    },
  },

  // No need for jest with Bun
  jest: false,

  biome: true,
  biomeOptions,

  lambdaOptions: {
    runtime: awscdk.LambdaRuntime.NODEJS_26_X,
    awsSdkConnectionReuse: false, // not needed for sdk v3
    bundlingOptions: lambdaBundling,
  },

  deps: [
    // CDK alpha modules, versions must match the pinned CDK version
    `@aws-cdk/aws-iot-alpha@${cdkAlphaVersion}`,
    `@aws-cdk/aws-iot-actions-alpha@${cdkAlphaVersion}`,
    `@aws-cdk/aws-pipes-alpha@${cdkAlphaVersion}`,
    `@aws-cdk/aws-pipes-sources-alpha@${cdkAlphaVersion}`,
    `@aws-cdk/aws-pipes-targets-alpha@${cdkAlphaVersion}`,

    // AWS Lambda Powertools dependencies
    `@aws-lambda-powertools/batch@${powertoolsVersion}`,
    `@aws-lambda-powertools/logger@${powertoolsVersion}`,
    `@aws-lambda-powertools/parameters@${powertoolsVersion}`,
    `@aws-lambda-powertools/parser@${powertoolsVersion}`,
    `@aws-lambda-powertools/tracer@${powertoolsVersion}`,
    `@aws-lambda-powertools/validation@${powertoolsVersion}`,

    // AWS SDK dependencies
    `@aws-sdk/client-dynamodb@${awsSdkVersion}`,
    `@aws-sdk/client-scheduler@${awsSdkVersion}`,
    `@aws-sdk/client-secrets-manager@${awsSdkVersion}`,
    `@aws-sdk/lib-dynamodb@${awsSdkVersion}`,

    // Middy middleware dependencies
    `@middy/core@${middyVersion}`,

    'zod@~4',
  ],
  devDeps: [
    '@commitlint/config-conventional',
    '@types/aws-lambda',
    '@types/node@^26',
    'bun-types',
    `@aws-sdk/client-iot@${awsSdkVersion}`,
    'commitlint',
    'cz-conventional-changelog',
    'lefthook',
  ],
  context,
});

// Old implementations kept for reference, they have their own repos
project.gitignore.exclude('/_old/');

project.defaultTask?.reset('bun .projenrc.ts');
project.tsconfig?.addInclude('scripts/**/*.ts');
project.testTask.exec('bun test');
project.compileTask.exec('bun run tsc --project tsconfig.json --noEmit');
project.cdkConfig.json.addOverride('build', 'bunx projen compile && bunx projen bundle');

project.addTask('prepare', {
  exec: 'bunx lefthook install',
});

project.addTask('check', {
  description: 'Check the code style and formatting',
  exec: 'bunx biome check --write',
});

project.addTask('check:staged', {
  description: 'Check the code style and formatting for staged files',
  exec: 'bunx biome check --write --staged',
});

project.synth();
