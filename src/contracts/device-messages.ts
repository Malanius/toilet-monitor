import { z } from 'zod';

/**
 * Payload a device publishes to its door topic (see `doorTopic`).
 * The device identity comes from the topic, never from the payload.
 */
export const DoorMessage = z.object({
  door: z.enum(['open', 'closed']),
  /** What woke the device up. */
  reason: z.enum(['change', 'heartbeat']).default('change'),
  /** Battery voltage in millivolts, if the device measures it. */
  batteryMv: z.number().int().positive().optional(),
});
export type DoorMessage = z.infer<typeof DoorMessage>;
