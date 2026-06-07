/**
 * Shared helpers for the single DB datetime format.
 *
 * Every timestamp in D1 is stored in SQLite's datetime() text format —
 * "YYYY-MM-DD HH:MM:SS", UTC, space separator, no zone suffix — which is what
 * column DEFAULTs (`datetime('now')`) and every expiry write
 * (`datetime('now', '+N seconds')`, via DB_EXPIRY_SQL) produce. Keeping one
 * format is the invariant: SQL comparisons against `datetime('now')` are then
 * lexically correct, and JS reads go through parseDbDate(). Writing an ISO
 * string (`.toISOString()`) into these columns breaks both — it sorts after the
 * space format and double-Z parsing yields Invalid Date.
 */

/**
 * SQL fragment computing an expiry timestamp N seconds from now in DB format.
 * Bind the offset as a signed seconds string, e.g. `+900` (the ` || ' seconds'`
 * suffix makes SQLite's `'+900 seconds'` modifier).
 */
export const DB_EXPIRY_SQL = "datetime('now', ? || ' seconds')";

/**
 * Parse a timestamp stored by D1 into a Date, interpreted as UTC.
 *
 * Accepts the SQLite datetime() format and is tolerant of ISO-8601 in case a
 * legacy row predates format unification. Missing or unparseable input returns
 * the Unix epoch (far past) rather than an Invalid Date: every caller compares
 * against `now` for expiry, and `NaN <= now` is false (fail OPEN) whereas
 * `epoch <= now` is true — so a bad value fails CLOSED (treated as expired).
 * These columns are NOT NULL and always written, so this is a defensive
 * fallback, not an expected path.
 *
 * @param {string|null|undefined} value
 * @returns {Date}
 */
export function parseDbDate(value) {
  if (value) {
    // ISO-8601 (a 'T' separator or a trailing 'Z') parses as-is. SQLite
    // "YYYY-MM-DD HH:MM:SS" is UTC but carries no zone marker; without one
    // Date() would read it as local time, so normalize to ISO UTC.
    const iso =
      value.includes("T") || value.endsWith("Z")
        ? value
        : `${value.replace(" ", "T")}Z`;
    const parsed = new Date(iso);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return new Date(0);
}
