/** Name of a toilet's offline timer, unique within the schedule group. */
export const livenessScheduleName = (toiletId: string): string => `offline-${toiletId}`;

/** One-time Scheduler expression, UTC with second precision: `at(2026-11-10T20:25:15)`. */
export const atExpression = (at: Date): string => `at(${at.toISOString().slice(0, 19)})`;

export const offlineAt = (lastSeenAt: string, offlineAfterSeconds: number): Date =>
  new Date(new Date(lastSeenAt).getTime() + offlineAfterSeconds * 1000);

export type LivenessDecision = { action: 'rearm'; at: Date } | { action: 'markOffline'; offlineAt: Date };

/**
 * What a fired timer means. A device report moves the timer, but a slow invocation can still set it back to an
 * older report's deadline, so a timer firing early is moved to the deadline of the last report on record.
 */
export const decideOnTimeout = (lastSeenAt: string, offlineAfterSeconds: number, now: Date): LivenessDecision => {
  const deadline = offlineAt(lastSeenAt, offlineAfterSeconds);
  return deadline > now ? { action: 'rearm', at: deadline } : { action: 'markOffline', offlineAt: deadline };
};
