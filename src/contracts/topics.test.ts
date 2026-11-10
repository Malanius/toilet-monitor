import { DOOR_TOPIC_THING_SEGMENT, doorTopic, thingName, toiletIdFromThingName } from './topics';
import { describe, expect, test } from 'bun:test';

const app = { appName: 'toilet-monitor', appEnv: 'dev' };

describe('topics', () => {
  test('thing name round-trips to the toilet id', () => {
    expect(thingName(app, 'ground-floor')).toBe('toilet-monitor-dev-ground-floor');
    expect(toiletIdFromThingName(app, 'toilet-monitor-dev-ground-floor')).toBe('ground-floor');
  });

  test('things of other envs or apps are rejected', () => {
    expect(toiletIdFromThingName(app, 'toilet-monitor-prod-ground-floor')).toBeUndefined();
    expect(toiletIdFromThingName(app, 'other-dev-ground-floor')).toBeUndefined();
    expect(toiletIdFromThingName(app, 'toilet-monitor-dev-')).toBeUndefined();
  });

  test('thing name sits at the segment the rule extracts', () => {
    const topic = doorTopic(app, 'toilet-monitor-dev-ground-floor');

    expect(topic).toBe('toilet-monitor/dev/toilets/toilet-monitor-dev-ground-floor/door');
    expect(topic.split('/')[DOOR_TOPIC_THING_SEGMENT - 1]).toBe('toilet-monitor-dev-ground-floor');
  });
});
