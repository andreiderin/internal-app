// utils/timeScale.ts
import { toZonedTime, fromZonedTime, formatInTimeZone } from "date-fns-tz";

/** App-wide timezone (override in .env.local) */
const APP_TZ = process.env.NEXT_PUBLIC_APP_TIMEZONE || "Europe/Istanbul";

export type TimeWindow = { startMs: number; endMs: number };
export type TickSpec = {
  majorMs: number;
  minorMs: number;
  fmt: (ms: number) => string; // format label at timestamp (ms)
};

export type Preset = "day" | "3day" | "week" | "month";

/* ---------------- TimeScale ---------------- */

export class TimeScale {
  private startMs: number;
  private endMs: number;
  private widthPx: number;

  constructor({
    startMs,
    endMs,
    widthPx,
  }: {
    startMs: number;
    endMs: number;
    widthPx: number;
  }) {
    this.startMs = startMs;
    this.endMs = endMs;
    this.widthPx = Math.max(1, widthPx);
  }

  setWindow(win: TimeWindow) {
    this.startMs = win.startMs;
    this.endMs = win.endMs;
  }

  setWidth(widthPx: number) {
    this.widthPx = Math.max(1, widthPx);
  }

  get window(): TimeWindow {
    return { startMs: this.startMs, endMs: this.endMs };
  }

  get pixelsPerHour(): number {
    const ms = this.endMs - this.startMs;
    return (this.widthPx / ms) * 3_600_000;
  }

  toX(tsMs: number): number {
    const t = (tsMs - this.startMs) / (this.endMs - this.startMs);
    return t * this.widthPx;
  }

  toTs(x: number): number {
    const t = x / this.widthPx;
    return this.startMs + t * (this.endMs - this.startMs);
  }
}

/* ---------------- TZ-aware “start of …” helpers ----------------
   We compute calendar boundaries in the app timezone (APP_TZ), then
   convert that wall-clock instant back to UTC ms for storage/math. */

function startOfDayTZ(ms: number): number {
  const z = toZonedTime(new Date(ms), APP_TZ);
  z.setHours(0, 0, 0, 0);
  return fromZonedTime(z, APP_TZ).getTime();
}

function startOfWeekMondayTZ(ms: number): number {
  // Start from midnight in app TZ, then go back to Monday
  const day0UTC = startOfDayTZ(ms);
  const zoned = toZonedTime(new Date(day0UTC), APP_TZ);
  const dow = (zoned.getDay() + 6) % 7; // Mon=0 ... Sun=6
  zoned.setDate(zoned.getDate() - dow);
  zoned.setHours(0, 0, 0, 0);
  return fromZonedTime(zoned, APP_TZ).getTime();
}

function startOfMonthTZ(ms: number): number {
  const z = toZonedTime(new Date(ms), APP_TZ);
  z.setDate(1);
  z.setHours(0, 0, 0, 0);
  return fromZonedTime(z, APP_TZ).getTime();
}

/* ---------------- Window for each preset (TZ-aware) ---------------- */

export function makeWindowForPreset(
  preset: Preset,
  nowMs = Date.now()
): TimeWindow {
  const dd = 24 * 3_600_000;

  if (preset === "day") {
    const s = startOfDayTZ(nowMs);
    return { startMs: s, endMs: s + dd };
  }

  if (preset === "3day") {
    // Center “now” in the middle day
    const s = startOfDayTZ(nowMs) - dd;
    return { startMs: s, endMs: s + 3 * dd };
  }

  if (preset === "week") {
    const s = startOfWeekMondayTZ(nowMs);
    return { startMs: s, endMs: s + 7 * dd };
  }

  // month
  const s = startOfMonthTZ(nowMs);
  const d = new Date(s);
  d.setMonth(d.getMonth() + 1);
  const e = d.getTime();

  console.table({
    PRESET: preset,
    APP_TZ,
    win_start_APP: formatInTimeZone(s, APP_TZ, "yyyy-MM-dd HH:mm (zzz)"),
    win_end_APP: formatInTimeZone(e, APP_TZ, "yyyy-MM-dd HH:mm (zzz)"),
    win_start_UTC: formatInTimeZone(s, "UTC", "yyyy-MM-dd HH:mm 'UTC'"),
    win_end_UTC: formatInTimeZone(e, "UTC", "yyyy-MM-dd HH:mm 'UTC'"),
  });

  return { startMs: s, endMs: e };
}

/* ---------------- Label formatters (TZ-aware) ---------------- */

function fmtHour(ms: number) {
  return formatInTimeZone(ms, APP_TZ, "HH':00'");
}
function fmtDow(ms: number) {
  // Mon, Tue, ...
  return formatInTimeZone(ms, APP_TZ, "EEE");
}
function fmtMonDay(ms: number) {
  // Sep 17
  return formatInTimeZone(ms, APP_TZ, "MMM d");
}

/* ---------------- Tick spec per preset ---------------- */

export function tickSpecForPreset(preset: Preset): TickSpec {
  const dd = 24 * 3_600_000;

  if (preset === "day")
    return {
      majorMs: 6 * 3_600_000, // every 6h
      minorMs: 1 * 3_600_000, // every hour
      fmt: (ms) => fmtHour(ms),
    };

  if (preset === "3day")
    return {
      majorMs: dd, // daily
      minorMs: 3 * 3_600_000, // 6h
      fmt: (ms) => fmtDow(ms),
    };

  if (preset === "week")
    return {
      majorMs: dd, // daily
      minorMs: 6 * 3_600_000, // 12h
      fmt: (ms) => fmtDow(ms),
    };

  // month
  return {
    majorMs: dd,
    minorMs: dd,
    fmt: (ms) => fmtMonDay(ms),
  };
}

/* ---------------- Tick alignment helpers ----------------
   Use local (APP_TZ) midnight / 1st-of-month as the base so lines/labels
   align with what humans expect in that timezone. */

export function tickBaseForPreset(preset: Preset, startMs: number): number {
  if (preset === "month") return startOfMonthTZ(startMs);
  return startOfDayTZ(startMs); // day, 3day, week
}

/** Snap the first tick >= ms using a custom base (local boundary) */
export function snapFromBase(
  ms: number,
  stepMs: number,
  baseMs: number
): number {
  const delta = ms - baseMs;
  const k = Math.ceil(delta / stepMs);
  return baseMs + k * stepMs;
}

/* ---------------- (Optional) Legacy non-TZ helpers ----------------
   Kept for compatibility if other files still import them.
   They are NOT used by the timeline anymore. */

export function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
export function startOfWeekMonday(ms: number): number {
  const d = new Date(startOfDay(ms));
  const day = (d.getDay() + 6) % 7; // Mon=0 ... Sun=6
  d.setDate(d.getDate() - day);
  return d.getTime();
}
export function startOfMonth(ms: number): number {
  const d = new Date(ms);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
