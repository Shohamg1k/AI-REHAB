import { useState } from "react";
import type { ReferenceMedia } from "@ai-rehab/contracts";

/**
 * Renders an exercise's demonstration material from its spec
 * (`ExerciseSpec.referenceMedia`). Nothing here is hardcoded per exercise —
 * adding a video to an exercise is authoring, not a UI change.
 *
 * Performance: video reference material is `preload="none"` and never
 * autoplays, so it cannot compete with the camera pipeline for decode
 * bandwidth while a session is running.
 */
export function ReferenceMediaCard({
  media,
  compact = false
}: {
  media: ReferenceMedia;
  compact?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surf">
      <div className="relative bg-sunk">
        {failed ? (
          <div className="flex items-center justify-center px-16 py-24 text-center text-cap text-ink-3">
            Demonstration unavailable — the written steps below still apply.
          </div>
        ) : media.type === "video" ? (
          <video
            className="mx-auto max-h-[240px] w-full object-contain"
            src={media.url}
            poster={media.thumbnail}
            controls
            preload="none"
            playsInline
            muted
            loop
            onError={() => setFailed(true)}
          />
        ) : (
          <img
            className="mx-auto max-h-[240px] w-full object-contain"
            src={media.url}
            alt={media.instructions}
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
          />
        )}
      </div>

      <div className="flex flex-col gap-8 p-16">
        <p className="text-b2 text-ink">{media.instructions}</p>
        {!compact && media.keyPoints && media.keyPoints.length > 0 && (
          <ul className="flex flex-col gap-4">
            {media.keyPoints.map((point) => (
              <li key={point} className="flex items-start gap-8 text-b2 text-ink-2">
                <span aria-hidden className="mt-1 text-teal">
                  •
                </span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Collapsible variant for the setup screen, where the camera is the focus. */
export function ReferenceMediaDisclosure({ media }: { media: ReferenceMedia }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-line bg-surf">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-touch w-full items-center justify-between gap-8 px-16 text-left"
      >
        <span className="text-b1 font-medium text-ink">How this exercise looks</span>
        <span className="text-cap text-teal">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <div className="border-t border-line p-12">
          <ReferenceMediaCard media={media} compact />
        </div>
      )}
    </div>
  );
}
