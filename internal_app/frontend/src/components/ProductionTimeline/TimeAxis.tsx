"use client";
import * as React from "react";
import {
  TimeScale,
  tickSpecForPreset,
  Preset,
  tickBaseForPreset,
  snapFromBase,
} from "./utils/timeScale";

import { formatInTimeZone } from "date-fns-tz";
import { APP_TZ } from "./utils/parseInAppTimezone";

export default function TimeAxis({
  scale,
  preset,
  position = "bottom",
  leftOffset = 0,
  trackPaddingLeft = 0,
  trackPaddingRight = 0,
  axisHeight = 36,
  axisWidthPx,
  sticky = true,
}: {
  scale: TimeScale;
  preset: Preset;
  position?: "top" | "bottom";
  leftOffset?: number;
  trackPaddingLeft?: number;
  trackPaddingRight?: number;
  axisHeight?: number;
  axisWidthPx?: number;
  sticky?: boolean;
}) {
  const { startMs, endMs } = scale.window;
  const spec = tickSpecForPreset(preset);

  // align ticks
  const base = tickBaseForPreset(preset, startMs);
  const firstMajor = snapFromBase(startMs, spec.majorMs, base);

  // month stride to avoid overlap
  let stride = 1;
  if (preset === "month") {
    const MIN_GAP_PX = 56;
    const pxPerMajor = Math.max(
      1,
      Math.round(scale.toX(firstMajor + spec.majorMs) - scale.toX(firstMajor))
    );
    stride = Math.max(1, Math.ceil(MIN_GAP_PX / pxPerMajor));
  }

  const centerLabels =
    preset === "week" || preset === "month" || preset === "3day";

  // NEW: formatting override for week / 3day (Sep 19, Thu), keep others as-is
  const fmtFor = React.useCallback(
    (ms: number) => {
      if (preset === "week" || preset === "3day") {
        return formatInTimeZone(ms, APP_TZ, "MMM d, EEE");
      }
      return spec.fmt(ms);
    },
    [preset, spec]
  );

  const labels: { x: number; text: string; key: string }[] = [];
  let i = 0;
  for (let t = firstMajor; t <= endMs; t += spec.majorMs) {
    if (i % stride === 0) {
      let x: number;
      if (centerLabels) {
        if (preset === "month") {
          const groupEnd = Math.min(t + spec.majorMs * stride, endMs);
          x = Math.round((scale.toX(t) + scale.toX(groupEnd)) / 2);
        } else {
          x = Math.round(
            (scale.toX(t) + scale.toX(Math.min(t + spec.majorMs, endMs))) / 2
          );
        }
      } else {
        x = Math.round(scale.toX(t));
      }
      labels.push({ x, text: fmtFor(t), key: `lbl-${t}` }); // NEW: use fmtFor
    }
    i += 1;
  }

  if (labels.length > 0 && axisWidthPx) {
    const last = labels[labels.length - 1];
    if (last.x + 20 > axisWidthPx - trackPaddingRight) labels.pop();
  }

  const posClass = sticky
    ? position === "bottom"
      ? "sticky bottom-0"
      : "sticky top-0"
    : "";

  // NEW: compute the “Day chip” text (center of window looks nicer)
  const dayChipText =
    preset === "day"
      ? formatInTimeZone(
          Math.round((startMs + endMs) / 2),
          APP_TZ,
          "EEE, MMM d yyyy"
        )
      : null;

  return (
    <div
      className={`relative ${posClass}`}
      style={{ height: axisHeight, zIndex: 40 }}
    >
      {/* OPAQUE BACKPLATE that spans the full card width */}
      <div
        className="absolute inset-0 bg-white"
        style={{
          // borderTop: position === "bottom" ? "1px solid #ECECF3" : undefined,
          // borderBottom: position === "top" ? "1px solid #ECECF3" : undefined,
          zIndex: 0,
        }}
      />

      {/* LABEL STRIP aligned to the track area */}
      <div
        className="relative w-full h-full"
        style={{
          marginLeft: leftOffset,
          width: axisWidthPx,
          paddingLeft: trackPaddingLeft,
          paddingRight: trackPaddingRight,
          paddingTop: 12,
          zIndex: 1,
        }}
      >
        {labels.map((l) => {
          const style: React.CSSProperties = { left: l.x, top: 2 };
          if (centerLabels) style.transform = "translateX(-50%)";
          return (
            <div
              key={l.key}
              className="absolute text-[12px] text-[#2449e9] whitespace-nowrap"
              style={style}
            >
              {l.text}
            </div>
          );
        })}
      </div>

      {/* NEW: Day view date chip to the LEFT of the axis track */}
      {preset === "day" && axisWidthPx != null && (
        <div
          className="absolute"
          style={{
            // place this to the left of the track area, vertically aligned with labels
            left: Math.max(0, leftOffset - 142), // 140px is chip width guess; tweak as you like
            top: 0, // sits nicely above the axis baseline
            zIndex: 2,
          }}
        >
          <div className="px-5 py-1 bg-transparent text-[#2449e9] text-xs">
            {dayChipText}
          </div>
        </div>
      )}
    </div>
  );
}
