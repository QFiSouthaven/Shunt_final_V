import { z } from "zod";

export const EnvelopeSchema = z.object({
  from: z.string(),
  to: z.string(),
  room: z.string().optional(),
  kind: z.string(),
  intent: z.string().optional(),
  body: z.string().optional()
});
