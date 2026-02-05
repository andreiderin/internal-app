"use client";
import * as React from "react";
// REPLACE your import line with this (adds the two helpers)
import {
  TimeScale,
  tickSpecForPreset,
  Preset,
  tickBaseForPreset,
  snapFromBase,
} from "./utils/timeScale";

export default function GridOverlay({
  scale,
  contentHeight,
  preset,
  // rowCount,
  // rowHeight,
  leftOffset = 0,
  trackPaddingLeft = 0,
  topOffset = 0, // NEW
  rightPadding = 0, // NEW
  svgWidthPx, // ← NEW
}: {
  scale: TimeScale;
  contentHeight: number;
  preset: Preset;
  // rowCount: number;
  // rowHeight: number;
  leftOffset?: number;
  trackPaddingLeft?: number;
  topOffset?: number; // NEW
  rightPadding?: number; // NEW
  svgWidthPx?: number; // ← NEW
}) {
  const { startMs, endMs } = scale.window;
  const ticks: React.ReactNode[] = [];

  const spec = tickSpecForPreset(preset);

  const base = tickBaseForPreset(preset, startMs);

  // Minor verticals
  const firstMinor = snapFromBase(startMs, spec.minorMs, base);
  for (let t = firstMinor; t <= endMs; t += spec.minorMs) {
    const x = Math.round(scale.toX(t)) + 0.5;
    console.log("x", x);
    ticks.push(
      <line
        key={`minor-${t}`}
        x1={x}
        x2={x}
        y1={0}
        y2={contentHeight}
        stroke="#EDEFF5"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
    );
  }

  // Major verticals
  const firstMajor = snapFromBase(startMs, spec.majorMs, base);
  for (let t = firstMajor; t <= endMs - 1; t += spec.majorMs) {
    const x = Math.round(scale.toX(t)) + 0.5;
    ticks.push(
      <line
        key={`major-${t}`}
        x1={x}
        x2={x}
        y1={0}
        y2={contentHeight}
        stroke="#D5DAE6"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
    );
  }

  // let c = 0;
  // for (let t = firstMinor; t <= endMs && c < 6; t += spec.minorMs, c++) {
  //   const x = Math.round(scale.toX(t)) + 0.5;
  // }

  // Horizontal row separators (inside track)
  // const horizontals: React.ReactNode[] = [];
  // for (let i = 0; i <= rowCount; i++) {
  //   const y = Math.round(i * rowHeight) + 0.5;
  //   horizontals.push(
  //     <line
  //       key={`row-${i}`}
  //       x1={0}
  //       x2="100%"
  //       y1={y}
  //       y2={y}
  //       stroke="#F1F3F8"
  //       strokeWidth={1}
  //       vectorEffect="non-scaling-stroke"
  //     />
  //   );
  // }

  return (
    <svg
      className="pointer-events-none absolute"
      style={{
        left: leftOffset, // pin to start of track
        top: topOffset, // align with rows top padding
        width: svgWidthPx ?? undefined, // ← explicit width matches scale space
        ...(svgWidthPx == null ? { right: rightPadding } : null), // fallback to old behavior
        height: contentHeight, // exact rows height
        zIndex: 2,
        overflow: "visible", // ← allow anything at the very edge to render
      }}
      aria-hidden
      shapeRendering="crispEdges"
      preserveAspectRatio="none"
    >
      <g transform={`translate(${trackPaddingLeft},0)`}>
        {ticks}
        {/* {horizontals} */}
      </g>
    </svg>
  );
}
