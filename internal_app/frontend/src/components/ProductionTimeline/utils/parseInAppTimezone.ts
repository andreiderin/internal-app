// utils/parseInAppTimezone.ts
import { fromZonedTime } from "date-fns-tz";

export const APP_TZ = process.env.NEXT_PUBLIC_APP_TIMEZONE || "Europe/Istanbul";

// Detect trailing timezone marker: Z or ±HH:MM
const HAS_TZ_RE = /(Z|[+\-]\d{2}:\d{2})$/;
const STRIP_TZ_RE = HAS_TZ_RE;

/**
 * STRICT WALL-TIME PARSER (Istanbul)
 *
 * - Numbers → returned as-is (assumed to already be correct ms).
 * - Date objects → returned as-is (ms).
 * - Strings:
 *    • If timezone is present, parse as absolute time
 *    • Else, normalize space to 'T'
 *    • Interpret the result as Istanbul wall time
 *    • Convert ONCE to UTC ms
 *
 * Outcome: "2025-10-09T19:37:07.956135+00:00" is treated as 19:37 in Istanbul,
 * not shifted to 22:37.
 */
export function parseInAppTimezone(input: string | number | Date): number {
  if (typeof input === "number") return input;
  if (input instanceof Date) return input.getTime();

  const s = String(input).trim();

  if (HAS_TZ_RE.test(s)) {
    const withT = s.includes("T") ? s : s.replace(" ", "T");
    const normalized = withT.replace(
      /(\.\d{3})\d+(Z|[+\-]\d{2}:\d{2})$/,
      "$1$2",
    );
    const ms = Date.parse(normalized);
    if (!Number.isNaN(ms)) return ms;
  }

  // Normalize to ISO-like without timezone
  const noTz = s.replace(STRIP_TZ_RE, "");
  const isoLocal = noTz.includes("T") ? noTz : noTz.replace(" ", "T");

  // Interpret that wall time in APP_TZ, convert to a UTC instant (ms)
  return fromZonedTime(isoLocal, APP_TZ).getTime();
}
