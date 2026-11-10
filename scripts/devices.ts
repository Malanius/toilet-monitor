#!/usr/bin/env bun
/**
 * Provisions and deprovisions device identities: thing, certificate and policy attachment.
 *
 *   bun scripts/devices.ts provision <env> <toiletId> [--out <dir>]
 *   bun scripts/devices.ts deprovision <env> <toiletId>
 *
 * Uses the default AWS credential chain, e.g. AWS_PROFILE.
 */
import { chmod, mkdir, readdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import {
  AttachPolicyCommand,
  AttachThingPrincipalCommand,
  CreateKeysAndCertificateCommand,
  CreateThingCommand,
  DeleteCertificateCommand,
  DeleteThingCommand,
  DescribeEndpointCommand,
  DescribeThingCommand,
  DetachPolicyCommand,
  DetachThingPrincipalCommand,
  GetPolicyCommand,
  IoTClient,
  ListThingPrincipalsCommand,
  ResourceNotFoundException,
  UpdateCertificateCommand,
} from '@aws-sdk/client-iot';

import type { AppInfo } from '../src/common/app-info';
import { APP_NAME, REGION } from '../src/common/deployment';
import { devicePolicyName, doorTopic, thingName } from '../src/contracts/topics';

const ROOT_CA_URL = 'https://www.amazontrust.com/repository/AmazonRootCA1.pem';

const iot = new IoTClient({ region: REGION });

const defaultOutDir = (thing: string) =>
  join(process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'), APP_NAME, 'devices', thing);

const thingPrincipals = async (thing: string): Promise<string[]> => {
  try {
    const { principals = [] } = await iot.send(new ListThingPrincipalsCommand({ thingName: thing }));
    return principals;
  } catch (error) {
    if (error instanceof ResourceNotFoundException) {
      return [];
    }
    throw error;
  }
};

const thingExists = async (thing: string): Promise<boolean> => {
  try {
    await iot.send(new DescribeThingCommand({ thingName: thing }));
    return true;
  } catch (error) {
    if (error instanceof ResourceNotFoundException) {
      return false;
    }
    throw error;
  }
};

const isEmptyDir = async (dir: string): Promise<boolean> => {
  try {
    return (await readdir(dir)).length === 0;
  } catch {
    return true;
  }
};

const provision = async (app: AppInfo, toiletId: string, outDir?: string) => {
  const thing = thingName(app, toiletId);
  const policyName = devicePolicyName(app);
  const dir = outDir ?? defaultOutDir(thing);

  if (!(await isEmptyDir(dir))) {
    throw new Error(`${dir} isn't empty, refusing to overwrite existing credentials`);
  }
  // Fails when the state stack of the env isn't deployed
  await iot.send(new GetPolicyCommand({ policyName }));
  if ((await thingPrincipals(thing)).length > 0) {
    throw new Error(`${thing} already has a certificate, deprovision it first`);
  }

  console.log(`Creating thing ${thing}`);
  await iot.send(
    new CreateThingCommand({
      thingName: thing,
      attributePayload: { attributes: { app: app.appName, env: app.appEnv, toiletId } },
    }),
  );

  const certificate = await iot.send(new CreateKeysAndCertificateCommand({ setAsActive: true }));
  const { certificateArn, certificatePem, keyPair } = certificate;
  if (!certificateArn || !certificatePem || !keyPair?.PrivateKey) {
    throw new Error('IoT returned an incomplete certificate');
  }
  console.log(`Created certificate ${certificate.certificateId}`);

  try {
    await iot.send(new AttachPolicyCommand({ policyName, target: certificateArn }));
    await iot.send(new AttachThingPrincipalCommand({ thingName: thing, principal: certificateArn }));

    const { endpointAddress } = await iot.send(new DescribeEndpointCommand({ endpointType: 'iot:Data-ATS' }));
    const rootCa = await fetch(ROOT_CA_URL).then((response) => {
      if (!response.ok) throw new Error(`Downloading ${ROOT_CA_URL} failed: ${response.status}`);
      return response.text();
    });

    await mkdir(dir, { recursive: true, mode: 0o700 });
    await writeFile(join(dir, 'certificate.pem.crt'), certificatePem);
    await writeFile(join(dir, 'private.pem.key'), keyPair.PrivateKey, { mode: 0o600 });
    await chmod(join(dir, 'private.pem.key'), 0o600);
    await writeFile(join(dir, 'AmazonRootCA1.pem'), rootCa);
    await writeFile(
      join(dir, 'device.json'),
      `${JSON.stringify(
        {
          thingName: thing,
          clientId: thing,
          endpoint: endpointAddress,
          port: 8883,
          doorTopic: doorTopic(app, thing),
        },
        null,
        2,
      )}\n`,
    );
  } catch (error) {
    console.error('Provisioning failed, rolling back');
    await deprovision(app, toiletId);
    throw error;
  }

  console.log(`Device credentials written to ${dir}`);
};

const deleteCertificate = async (thing: string, certificateArn: string, policyName: string) => {
  const certificateId = certificateArn.split('/').pop();
  // Deactivate first, so the device loses access before anything else changes
  await iot.send(new UpdateCertificateCommand({ certificateId, newStatus: 'INACTIVE' }));
  await iot.send(new DetachThingPrincipalCommand({ thingName: thing, principal: certificateArn }));
  await iot.send(new DetachPolicyCommand({ policyName, target: certificateArn }));
  // Detaching from the thing is eventually consistent, deleting can fail for a few seconds
  for (let attempt = 1; ; attempt++) {
    try {
      await iot.send(new DeleteCertificateCommand({ certificateId }));
      console.log(`Deleted certificate ${certificateId}`);
      return;
    } catch (error) {
      if (attempt === 10) throw error;
      await Bun.sleep(2000);
    }
  }
};

const deprovision = async (app: AppInfo, toiletId: string) => {
  const thing = thingName(app, toiletId);
  const policyName = devicePolicyName(app);

  if (!(await thingExists(thing))) {
    console.log(`Thing ${thing} doesn't exist`);
    return;
  }

  for (const principal of await thingPrincipals(thing)) {
    await deleteCertificate(thing, principal, policyName);
  }

  // Succeeds for missing things too, hence the existence check above
  await iot.send(new DeleteThingCommand({ thingName: thing }));
  console.log(`Deleted thing ${thing}`);
  console.log(`Local credentials in ${defaultOutDir(thing)} (if used) are now useless, delete them`);
};

const { positionals, values } = parseArgs({
  args: Bun.argv.slice(2),
  allowPositionals: true,
  options: { out: { type: 'string' } },
});
const [command, appEnv, toiletId] = positionals;

if (!appEnv || !toiletId || (command !== 'provision' && command !== 'deprovision')) {
  console.error('Usage: bun scripts/devices.ts <provision|deprovision> <env> <toiletId> [--out <dir>]');
  process.exit(1);
}

// Ends up in thing names and topics: no MQTT wildcards or separators
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(toiletId)) {
  console.error(`Invalid toilet id '${toiletId}', use lowercase letters, digits and single dashes`);
  process.exit(1);
}

const app = { appName: APP_NAME, appEnv };
await (command === 'provision' ? provision(app, toiletId, values.out) : deprovision(app, toiletId));
