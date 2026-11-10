import { z } from 'zod';

import { DoorMessage } from '@/contracts/device-messages';

/** Event the door topic rule invokes the Lambda with: the device payload plus what the rule adds. */
export const DoorReport = DoorMessage.extend({
  kind: z.literal('doorReport'),
  /** From the topic, so it's the identity the IoT policy verified. */
  thingName: z.string().min(1),
  /** IoT `timestamp()`: when IoT Core received the message, epoch millis. */
  receivedAt: z.number().int().positive(),
});
export type DoorReport = z.infer<typeof DoorReport>;

/** Input of the offline timer, fired when a toilet stays silent for too long. */
export const LivenessTimeout = z.object({
  kind: z.literal('livenessTimeout'),
  toiletId: z.string().min(1),
});
export type LivenessTimeout = z.infer<typeof LivenessTimeout>;

/** Everything the status processor is invoked with. */
export const ProcessorEvent = z.discriminatedUnion('kind', [DoorReport, LivenessTimeout]);
export type ProcessorEvent = z.infer<typeof ProcessorEvent>;
