import { describe, it, expect } from "vitest";
import {
  parseDbDate,
  DB_EXPIRY_SQL
} from "../../../src/shared/lib/datetime.js";

describe("DB_EXPIRY_SQL", () => {
  it("is the datetime('now', ...) fragment write sites interpolate", () => {
    expect(DB_EXPIRY_SQL).toBe("datetime('now', ? || ' seconds')");
  });
});

describe("parseDbDate", () => {
  describe("SQLite datetime() format (the stored format)", () => {
    it("parses 'YYYY-MM-DD HH:MM:SS' as UTC, not local time", () => {
      // This is exactly what datetime('now') / column DEFAULTs produce.
      const d = parseDbDate("2026-06-07 17:46:15");

      expect(Number.isNaN(d.getTime())).toBe(false);
      expect(d.toISOString()).toBe("2026-06-07T17:46:15.000Z");
    });

    it("treats a past stored value as in the past", () => {
      const past = parseDbDate("2000-01-01 00:00:00");
      expect(past <= new Date()).toBe(true);
    });

    it("treats a future stored value as in the future", () => {
      const future = parseDbDate("2999-01-01 00:00:00");
      expect(future > new Date()).toBe(true);
    });
  });

  describe("ISO-8601 tolerance (legacy rows)", () => {
    it("parses an ISO string with a trailing Z without mangling it", () => {
      // Regression: the old read path did `new Date(`${value}Z`)`, which on an
      // ISO value produced a double-Z ("...466ZZ") → Invalid Date → NaN →
      // `NaN <= now` false → nothing ever expired. parseDbDate must NOT do that.
      const iso = "2026-06-07T17:46:15.466Z";
      const d = parseDbDate(iso);

      expect(Number.isNaN(d.getTime())).toBe(false);
      expect(d.getTime()).toBe(Date.parse(iso));
    });

    it("does not produce Invalid Date for the format production used to write", () => {
      // The pre-fix production write path stored raw .toISOString().
      expect(
        Number.isNaN(parseDbDate("2026-06-07T17:46:15.466Z").getTime())
      ).toBe(false);
    });
  });

  describe("fail-closed fallback", () => {
    it.each([null, undefined, ""])(
      "returns the Unix epoch for missing input (%s)",
      (value) => {
        expect(parseDbDate(value).getTime()).toBe(0);
      }
    );

    it("returns the Unix epoch for an unparseable string", () => {
      expect(parseDbDate("not a date").getTime()).toBe(0);
    });

    it("makes a missing expiry compare as already-expired (fail closed)", () => {
      // The crux: a bad value must read as expired (<= now), never as valid.
      expect(parseDbDate(null) <= new Date()).toBe(true);
      expect(parseDbDate("garbage") <= new Date()).toBe(true);
    });
  });
});
