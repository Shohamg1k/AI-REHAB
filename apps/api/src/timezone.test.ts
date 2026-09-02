import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIME_ZONE,
  endOfLocalDay,
  isValidTimeZone,
  localDateKey,
  resolveTimeZone,
  startOfLocalDay
} from "./timezone.js";

/**
 * The bug this module exists to fix: a patient in Kolkata exercising at 11pm
 * on Tuesday had it filed under Monday, because everything keyed on the UTC
 * date. The streak counter agreed with the mistake.
 */
describe("localDateKey", () => {
  it("files a late-evening session under the day the patient lived through", () => {
    // 2026-09-01T18:45Z is 2026-09-02 00:15 in Kolkata.
    const instant = "2026-09-01T18:45:00.000Z";
    expect(localDateKey(instant, "UTC")).toBe("2026-09-01");
    expect(localDateKey(instant, "Asia/Kolkata")).toBe("2026-09-02");
  });

  it("files an early-morning session in the Americas under the previous day", () => {
    // 2026-09-02T03:00Z is 2026-09-01 23:00 in New York.
    const instant = "2026-09-02T03:00:00.000Z";
    expect(localDateKey(instant, "UTC")).toBe("2026-09-02");
    expect(localDateKey(instant, "America/New_York")).toBe("2026-09-01");
  });

  it("agrees with UTC when the patient is in UTC", () => {
    expect(localDateKey("2026-09-01T12:00:00.000Z", "UTC")).toBe("2026-09-01");
  });

  it("handles a half-hour offset", () => {
    expect(localDateKey("2026-09-01T18:29:00.000Z", "Asia/Kolkata")).toBe("2026-09-01");
    expect(localDateKey("2026-09-01T18:31:00.000Z", "Asia/Kolkata")).toBe("2026-09-02");
  });
});

describe("resolveTimeZone", () => {
  it("keeps a valid zone", () => {
    expect(resolveTimeZone("Asia/Kolkata")).toBe("Asia/Kolkata");
  });

  /**
   * The value arrives in a query string. An unknown zone makes
   * `Intl.DateTimeFormat` throw, which would turn a client typo into a 500 on
   * a report rather than a report in the wrong zone.
   */
  it("falls back to UTC for anything the runtime will not accept", () => {
    expect(resolveTimeZone("Mars/Olympus_Mons")).toBe(DEFAULT_TIME_ZONE);
    expect(resolveTimeZone("")).toBe(DEFAULT_TIME_ZONE);
    expect(resolveTimeZone(undefined)).toBe(DEFAULT_TIME_ZONE);
    expect(resolveTimeZone("'; drop table users --")).toBe(DEFAULT_TIME_ZONE);
  });

  it("recognises valid and invalid zones", () => {
    expect(isValidTimeZone("Europe/London")).toBe(true);
    expect(isValidTimeZone("Nowhere/Nothing")).toBe(false);
  });
});

describe("startOfLocalDay / endOfLocalDay", () => {
  it("brackets a UTC day exactly", () => {
    expect(startOfLocalDay("2026-09-01", "UTC")).toBe("2026-09-01T00:00:00.000Z");
    expect(endOfLocalDay("2026-09-01", "UTC")).toBe("2026-09-01T23:59:59.999Z");
  });

  it("brackets an Indian day, which starts the previous UTC evening", () => {
    expect(startOfLocalDay("2026-09-02", "Asia/Kolkata")).toBe("2026-09-01T18:30:00.000Z");
    expect(endOfLocalDay("2026-09-02", "Asia/Kolkata")).toBe("2026-09-02T18:29:59.999Z");
  });

  /**
   * The reason `startOfLocalDay` samples the offset twice. On a spring-forward
   * date the offset at UTC midnight differs from the offset at local midnight,
   * and a single-pass version lands an hour out.
   */
  it("is correct across a spring-forward transition", () => {
    // US DST began 2026-03-08. Local midnight is still EST (-05:00).
    expect(startOfLocalDay("2026-03-08", "America/New_York")).toBe("2026-03-08T05:00:00.000Z");
    // By the end of that day the zone is on EDT (-04:00).
    expect(endOfLocalDay("2026-03-08", "America/New_York")).toBe("2026-03-09T03:59:59.999Z");
  });

  it("is correct across an autumn-back transition", () => {
    // US DST ended 2026-11-01. Local midnight is still EDT (-04:00).
    expect(startOfLocalDay("2026-11-01", "America/New_York")).toBe("2026-11-01T04:00:00.000Z");
    expect(endOfLocalDay("2026-11-01", "America/New_York")).toBe("2026-11-02T04:59:59.999Z");
  });

  it("brackets a southern-hemisphere day", () => {
    expect(startOfLocalDay("2026-09-02", "Pacific/Auckland")).toBe("2026-09-01T12:00:00.000Z");
  });

  /** Every instant inside the bracket must key to the day it brackets. */
  it("produces brackets whose contents all belong to that day", () => {
    for (const zone of ["UTC", "Asia/Kolkata", "America/New_York", "Pacific/Auckland"]) {
      for (const date of ["2026-01-15", "2026-03-08", "2026-09-02", "2026-11-01"]) {
        const start = startOfLocalDay(date, zone);
        const end = endOfLocalDay(date, zone);
        expect(localDateKey(start, zone), `${zone} ${date} start`).toBe(date);
        expect(localDateKey(end, zone), `${zone} ${date} end`).toBe(date);
        // And the instant just before the bracket belongs to the day before.
        const justBefore = new Date(new Date(start).getTime() - 1).toISOString();
        expect(localDateKey(justBefore, zone), `${zone} ${date} before`).not.toBe(date);
      }
    }
  });
});
