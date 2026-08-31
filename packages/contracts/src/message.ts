import { z } from "zod";
import { RoleSchema } from "./identity.js";

/**
 * F9 — messages between a patient and their clinician.
 *
 * A thread always belongs to exactly one patient. There is no group chat and
 * no clinician-to-clinician channel: the only relationship this product
 * models is the one between a patient and the clinician who prescribed
 * their program, and a message store that allowed anything else would be a
 * second, weaker copy of the tenancy rules.
 *
 * Deliberately *not* gated by `dataSharingEnabled`. That flag controls
 * whether a clinician may read the patient's session data; being able to
 * say "this hurt, can we talk" is not session data, and a patient who has
 * paused sharing precisely because something is wrong is the last person
 * who should lose the ability to say so. See docs/STATUS.md.
 *
 * Not a clinical channel: nothing here is monitored, and the UI must say so
 * (CLAUDE.md §6). It is not for emergencies.
 */
export const MessageSchema = z.object({
  id: z.string(),
  /** Whose thread this is. A clinician posts *into* a patient's thread. */
  patientId: z.string(),
  senderId: z.string(),
  senderDisplayName: z.string(),
  senderRole: RoleSchema,
  body: z.string().min(1),
  createdAt: z.string()
});
export type Message = z.infer<typeof MessageSchema>;

export const MAX_MESSAGE_LENGTH = 2000;

export const SendMessageRequestSchema = z.object({
  body: z.string().trim().min(1, "Write something first.").max(MAX_MESSAGE_LENGTH),
  /**
   * Clinician only — which patient's thread to post into. A patient always
   * posts to their own thread, so sending this as a patient is meaningless
   * and the server ignores it rather than letting it redirect the message.
   */
  patientId: z.string().optional()
});
export type SendMessageRequest = z.infer<typeof SendMessageRequestSchema>;
