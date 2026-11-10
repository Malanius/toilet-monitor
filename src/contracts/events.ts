import { z } from 'zod';

/** `source` of every event this app puts on the status event bus. */
export const EVENT_SOURCE = 'toilet-monitor';

/** `detail-type` values of the events on the status event bus. */
export const StatusEventType = {
  StatusChanged: 'Toilet Status Changed',
  WentOffline: 'Toilet Went Offline',
  CameOnline: 'Toilet Came Online',
} as const;
export type StatusEventType = (typeof StatusEventType)[keyof typeof StatusEventType];

export const ToiletStatus = z.enum(['occupied', 'vacant', 'unknown']);
export type ToiletStatus = z.infer<typeof ToiletStatus>;

export const Connectivity = z.enum(['online', 'offline', 'unknown']);
export type Connectivity = z.infer<typeof Connectivity>;

/**
 * `detail` of every status event, the same shape for all detail-types.
 * Consumers pick the change they care about by detail-type.
 */
export const StatusEventDetail = z.object({
  version: z.literal(1),
  toiletId: z.string(),
  status: ToiletStatus,
  connectivity: Connectivity,
  changedAt: z.iso.datetime(),
  previous: z.object({
    status: ToiletStatus,
    connectivity: Connectivity,
    changedAt: z.iso.datetime().or(z.literal('')),
  }),
});
export type StatusEventDetail = z.infer<typeof StatusEventDetail>;
