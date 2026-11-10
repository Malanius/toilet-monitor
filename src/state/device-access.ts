import { ArnFormat, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { CfnPolicy } from 'aws-cdk-lib/aws-iot';
import { Construct } from 'constructs';

import { type AppInfo, isProd } from '@/common/app-info';
import { devicePolicyName, doorTopic } from '@/contracts/topics';

export interface DeviceAccessProps extends AppInfo {}

/** IoT policy variable resolving to the thing the connecting certificate is attached to (MQTT only). */
// biome-ignore lint/suspicious/noTemplateCurlyInString: IoT policy variable, resolved by IoT Core
export const THING_NAME = '${iot:Connection.Thing.ThingName}';

/**
 * IoT policy for device certificates. A device may only connect with its own
 * thing name as the client ID and only publish door reports for itself.
 *
 * Lives in the state stack: certificates get attached outside CloudFormation
 * by the provisioning script, and a policy with attached certificates can't be deleted.
 */
export class DeviceAccess extends Construct {
  constructor(scope: Construct, id: string, props: DeviceAccessProps) {
    super(scope, id);

    const stack = Stack.of(this);
    const iotArn = (resource: string, resourceName: string) =>
      stack.formatArn({ service: 'iot', resource, resourceName, arnFormat: ArnFormat.SLASH_RESOURCE_NAME });

    const policy = new CfnPolicy(this, 'Policy', {
      policyName: devicePolicyName(props),
      policyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Action: 'iot:Connect',
            Resource: iotArn('client', THING_NAME),
            // The certificate must be attached to a thing, otherwise the variable doesn't resolve
            Condition: { Bool: { 'iot:Connection.Thing.IsAttached': 'true' } },
          },
          {
            Effect: 'Allow',
            Action: 'iot:Publish',
            Resource: iotArn('topic', doorTopic(props, THING_NAME)),
          },
        ],
      },
    });
    policy.applyRemovalPolicy(isProd(props) ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY);
  }
}
