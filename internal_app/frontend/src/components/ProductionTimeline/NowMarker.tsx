"use client";
import * as React from "react";
import { TimeScale } from "./utils/timeScale";

export default function NowMarker({
  scale,
  leftOffset = 0,
  topOffset = 0,
  trackPaddingLeft = 0,
  svgWidthPx,
  contentHeight,
}: {
  scale: TimeScale;
  leftOffset?: number;
  topOffset?: number;
  trackPaddingLeft?: number;
  svgWidthPx: number;
  contentHeight: number;
}) {
  const [now, setNow] = React.useState<number>(Date.now());

  // tick every ~30s to keep the line fresh (≤ 1 min requirement)
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const { startMs, endMs } = scale.window;
  if (now < startMs || now > endMs) return null; // don't render if off-screen

  const x = Math.round(scale.toX(now)) + 0.5;

  return (
    <svg
      className="pointer-events-none absolute"
      style={{
        left: leftOffset,
        top: topOffset,
        width: svgWidthPx,
        height: contentHeight,
        zIndex: 4, // above grid, under bars or tweak as you like
        overflow: "visible",
      }}
      aria-hidden
      shapeRendering="crispEdges"
      preserveAspectRatio="none"
    >
      <g transform={`translate(${trackPaddingLeft},0)`}>
        {/* red line */}
        <line
          x1={x}
          x2={x}
          y1={0}
          y2={contentHeight}
          stroke="#2449e9"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
        {/* small tag near top */}
        <g transform={`translate(${x}, 8)`}>
          {/* <rect x={-16} y={-10} width={32} height={16} rx={8} fill="#FF3B30" />
          <text
            x={0}
            y={2}
            fontSize={10}
            textAnchor="middle"
            fill="white"
            style={{ fontWeight: 600 }}
          >
            Now
          </text> */}
        </g>
      </g>
    </svg>
  );
}
