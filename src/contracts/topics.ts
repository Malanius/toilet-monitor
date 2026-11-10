import type { AppInfo } from '@/common/app-info';

/**
 * Things are named `<appName>-<appEnv>-<toiletId>`. The env is part of the name
 * because all envs share one account and thing names are unique per account/region.
 */
export const thingNamePrefix = ({ appName, appEnv }: AppInfo): string => `${appName}-${appEnv}-`;

export const thingName = (app: AppInfo, toiletId: string): string => `${thingNamePrefix(app)}${toiletId}`;

/** Returns undefined when the thing name doesn't belong to this app and env. */
export const toiletIdFromThingName = (app: AppInfo, name: string): string | undefined => {
  const prefix = thingNamePrefix(app);
  return name.startsWith(prefix) && name.length > prefix.length ? name.slice(prefix.length) : undefined;
};

/** Name of the IoT policy attached to every device certificate of an env. */
export const devicePolicyName = ({ appName, appEnv }: AppInfo): string => `${appName}-${appEnv}-device`;

/** Topic a device publishes its door reports to: `<appName>/<appEnv>/toilets/<thingName>/door`. */
export const doorTopic = ({ appName, appEnv }: AppInfo, thing: string): string =>
  `${appName}/${appEnv}/toilets/${thing}/door`;

/** 1-based position of the thing name in the door topic, as used by IoT SQL `topic(n)`. */
export const DOOR_TOPIC_THING_SEGMENT = 4;
