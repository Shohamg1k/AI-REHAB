/**
 * Every M1 exercise ships without a physiotherapist's sign-off — see
 * docs/STATUS.md "Blocked". This note is the single source of truth for
 * that disclaimer text; the UI renders it verbatim next to every score and
 * on camera setup for a provisional exercise, per
 * docs/MVP-BUILD-PROMPT.md §7 ("Do not ship provisional ranges as if they
 * were validated").
 */
export const PROVISIONAL_NOTE =
  "Reference ranges for this exercise are placeholders, not clinically validated. " +
  "A physiotherapist has not reviewed them yet.";
