import type { Connectivity, StatusEventType, ToiletStatus } from './events';

/** Sort keys of the per-toilet items in the status table. */
export const ItemType = {
  /** Current state; written only on real changes, the only item type that becomes an event. */
  State: 'STATE',
  /** Device telemetry (last seen, battery); written on every message, never becomes an event. */
  Device: 'DEVICE',
} as const;

export const toiletPk = (toiletId: string): string => `TOILET#${toiletId}`;

/**
 * STATE item as stored in DynamoDB. The stream pipe builds the event from the
 * new image only, so the item carries everything the event needs, including
 * the previous values. All values are strings to keep the pipe's input
 * transformation trivial.
 */
export interface StateItem {
  pk: string;
  sk: typeof ItemType.State;
  toiletId: string;
  status: ToiletStatus;
  connectivity: Connectivity;
  /** ISO timestamp, also used as the event time. */
  changedAt: string;
  /** Becomes the event's detail-type. */
  changeType: StatusEventType;
  previousStatus: ToiletStatus;
  previousConnectivity: Connectivity;
  /** ISO timestamp, empty string when there was no previous state. */
  previousChangedAt: string;
}
