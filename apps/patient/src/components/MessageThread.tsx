import { useEffect, useRef, useState } from "react";
import { MAX_MESSAGE_LENGTH, type Message } from "@ai-rehab/contracts";
import { ApiError, fetchMessages, sendMessage } from "../lib/api.js";
import { Button } from "./Button.js";
import { Icon } from "./Icon.js";

/**
 * F9 — the conversation, shared by both sides.
 *
 * One component for patient and clinician: the thread is the same object
 * from either end, and two implementations would drift. `patientId` is the
 * only difference — a clinician names whose thread they are in, a patient
 * never does (the server would ignore it anyway).
 *
 * Deliberately not real-time. There is no websocket and no polling: this is
 * asynchronous advice between sessions, not chat, and pretending otherwise
 * would set an expectation of responsiveness nobody has agreed to meet. The
 * copy says so, because a patient must not believe an urgent message here
 * will be seen quickly (CLAUDE.md §6).
 */
export function MessageThread({
  currentUserId,
  patientId,
  emptyHint
}: {
  currentUserId: string;
  /** Clinician side only. Omitted by a patient, who always posts to their own thread. */
  patientId?: string;
  emptyHint: string;
}) {
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchMessages(patientId)
      .then(setMessages)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : "Couldn't load your messages.")
      );
  }, [patientId]);

  useEffect(() => {
    // Optional on the method, not just the ref: scrolling to the newest
    // message is a nicety, and it should not throw anywhere the DOM does not
    // implement it (jsdom, for one).
    endRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [messages]);

  async function handleSend() {
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    setError(null);
    try {
      const sent = await sendMessage(body, patientId);
      setMessages((prev) => [...(prev ?? []), sent]);
      setDraft("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't send that message.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col gap-10">
      <div className="flex max-h-[320px] flex-col gap-8 overflow-y-auto">
        {messages === null && !error && <p className="text-b2 text-ink-2">Loading…</p>}
        {messages?.length === 0 && <p className="text-b2 text-ink-2">{emptyHint}</p>}

        {messages?.map((m) => {
          const mine = m.senderId === currentUserId;
          return (
            <div key={m.id} className={`flex flex-col gap-2 ${mine ? "items-end" : "items-start"}`}>
              <div
                className={`max-w-[85%] rounded-lg px-12 py-8 text-b2 ${
                  mine ? "bg-teal text-white" : "bg-sunk text-ink"
                }`}
              >
                {m.body}
              </div>
              <span className="font-mono text-lb uppercase text-ink-3">
                {mine ? "You" : m.senderDisplayName} ·{" "}
                {new Date(m.createdAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric"
                })}
              </span>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {error && <p className="text-b2 text-dang">{error}</p>}

      <div className="flex flex-col gap-8">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
          rows={3}
          placeholder="Write a message…"
          aria-label="Message"
          className="resize-none rounded bg-surf p-12 text-b2 text-ink shadow-hair placeholder:text-ink-3"
        />
        <Button onClick={handleSend} disabled={sending || draft.trim().length === 0}>
          <Icon name="sound" size={17} />
          {sending ? "Sending…" : "Send"}
        </Button>
        <p className="flex items-start gap-8 text-[11.5px] leading-[1.4] text-ink-3">
          <Icon name="warning" size={13} className="mt-1 text-ink-3" />
          <span>
            Messages are not monitored and may not be read for some time. If something is urgent, or
            the pain is severe, contact your clinician directly or call your local emergency number.
          </span>
        </p>
      </div>
    </div>
  );
}
