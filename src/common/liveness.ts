import { Duration } from 'aws-cdk-lib';
import type { Construct } from 'constructs';

export const HEARTBEAT_INTERVAL_CONTEXT_KEY = 'heartbeatIntervalMinutes';

/** Heartbeats a toilet may miss before it's considered offline, so a single lost message doesn't flap it. */
const MISSED_HEARTBEATS = 2;
/** Slack for the device's sleep timer, the ESP32 RTC runs off by several percent. */
const SLEEP_TIMER_DRIFT = 0.1;

/** How long a toilet may stay silent before it's considered offline. */
export const offlineAfter = (scope: Construct): Duration => {
  const interval = Number(scope.node.getContext(HEARTBEAT_INTERVAL_CONTEXT_KEY));
  if (!Number.isInteger(interval) || interval <= 0) {
    throw new Error(`Context '${HEARTBEAT_INTERVAL_CONTEXT_KEY}' must be a positive integer, got '${interval}'`);
  }
  return Duration.minutes(Math.ceil(interval * MISSED_HEARTBEATS * (1 + SLEEP_TIMER_DRIFT)));
};
