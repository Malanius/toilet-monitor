import { z } from 'zod';

import { DoorMessage } from '@/contracts/device-messages';

/** Event the door topic rule invokes the Lambda with: the device payload plus what the rule adds. */
export const DoorReport = DoorMessage.extend({
  /** From the topic, so it's the identity the IoT policy verified. */
  thingName: z.string().min(1),
  /** IoT `timestamp()`: when IoT Core received the message, epoch millis. */
  receivedAt: z.number().int().positive(),
});
export type DoorReport = z.infer<typeof DoorReport>;
