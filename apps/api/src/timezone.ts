/**
 * G2 — bucketing events into the days a patient actually lived through.
 *
 * Everything used to key on the UTC date of `session_started`. For anyone far
 * from UTC that files a late-evening session under the previous day: a patient
 * in Kolkata exercising at 11pm on Tuesday saw it land on Monday, and the
 * streak counter agreed with the mistake. A rehab app that miscounts which day
 * you exercised is wrong about the one thing adherence is for.
 *
 * No dependency: `Intl.DateTimeFormat` already carries the IANA database, and
 * `en-CA` formats dates as `YYYY-MM-DD`, which is exactly the key we want.
 */

/** Fallback when a caller supplies nothing, or something the runtime rejects. */
export const DEFAULT_TIME_ZONE = "UTC";

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * A caller-supplied zone, or UTC.
 *
 * Validated rather than trusted: `timeZone` reaches us from a query string,
 * and an unknown value makes `Intl.DateTimeFormat` throw — which would turn a
 * typo in a client into a 500 on a report.
 */
export function resolveTimeZone(timeZone: string | undefined): string {
  if (!timeZone) return DEFAULT_TIME_ZONE;
  return isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE;
}

const keyFormatters = new Map<string, Intl.DateTimeFormat>();

function keyFormatter(timeZone: string): Intl.DateTimeFormat {
  // Constructing a DateTimeFormat is not cheap and this runs once per session
  // per projection; the cache is keyed by zone, of which there are few.
  const cached = keyFormatters.get(timeZone);
  if (cached) return cached;
  const created = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  keyFormatters.set(timeZone, created);
  return created;
}

/** The calendar day an instant fell on, in `timeZone`. `YYYY-MM-DD`. */
export function localDateKey(iso: string, timeZone: string): string {
  return keyFormatter(timeZone).format(new Date(iso));
}

const partFormatters = new Map<string, Intl.DateTimeFormat>();

function partFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = partFormatters.get(timeZone);
  if (cached) return cached;
  const created = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    // h23 rather than hour12:false — the latter renders midnight as "24" in
    // some runtimes, which parses as the next day and shifts the offset by
    // a full day exactly once per day.
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
  partFormatters.set(timeZone, created);
  return created;
}

/** How far `timeZone` is from UTC at a given instant, in milliseconds. */
function offsetMsAt(instant: Date, timeZone: string): number {
  const parts = partFormatter(timeZone).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  // Read the zone's wall-clock reading back as though it were UTC; the gap
  // between that and the real instant is the offset.
  const asIfUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second")
  );
  return asIfUtc - instant.getTime();
}

/**
 * The instant at which the local day `dateKey` begins in `timeZone`.
 *
 * Two passes, because the offset has to be sampled *at* the moment we are
 * trying to find. Sampling at UTC midnight and correcting once lands inside
 * the right day; sampling again there catches the case where a DST transition
 * sits between the guess and the answer. A third pass cannot change anything —
 * the second sample is already inside the target day.
 */
export function startOfLocalDay(dateKey: string, timeZone: string): string {
  const guess = new Date(`${dateKey}T00:00:00Z`);
  const first = new Date(guess.getTime() - offsetMsAt(guess, timeZone));
  const second = new Date(guess.getTime() - offsetMsAt(first, timeZone));
  return second.toISOString();
}

/** The last instant of the local day `dateKey` — one millisecond before the next begins. */
export function endOfLocalDay(dateKey: string, timeZone: string): string {
  const next = new Date(`${dateKey}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const nextKey = next.toISOString().slice(0, 10);
  return new Date(new Date(startOfLocalDay(nextKey, timeZone)).getTime() - 1).toISOString();
}
