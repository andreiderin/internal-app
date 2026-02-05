"use client";
import * as React from "react";
import type { LaidOutBar } from "./utils/layout";
import { LAYOUT_CONSTANTS } from "./utils/layout";

export function RowItemsOverlay({
  bars,
  rowHeight = 48,
  highlight,
  selectedId,
  visibleStatuses = { planned: true, actual: true, frozen: true },
  splitY = false,
  onHover,
  onClick,
}: {
  bars: LaidOutBar[];
  rowHeight?: number;
  highlight?: Set<string>;
  selectedId?: string | null;
  visibleStatuses?: { planned: boolean; actual: boolean; frozen?: boolean };
  splitY?: boolean;
  onHover?: (
    bar: Pick<LaidOutBar, "id" | "start" | "end" | "label"> | null,
    evt?: React.MouseEvent
  ) => void;
  onClick?: (bar: Pick<LaidOutBar, "id">) => void;
}) {
  const { LANE_HEIGHT, LANE_GAP } = LAYOUT_CONSTANTS;

  type Category = "planned" | "actual" | "frozen";

  const categoryOf = React.useCallback((s: LaidOutBar["status"]): Category => {
    if (s === "actual" || s === "current") return "actual";
    if (s === "frozen") return "frozen";
    return "planned"; // planned + incomplete / not_accepted / undefined
  }, []);

  const visibleBars = React.useMemo(() => {
    return bars.filter((b) => {
      const cat = categoryOf(b.status);
      if (cat === "planned") return visibleStatuses.planned;
      if (cat === "actual") return visibleStatuses.actual;
      if (cat === "frozen") return !!visibleStatuses.frozen;
      return true;
    });
  }, [bars, visibleStatuses, categoryOf]);

  // Ensure frozen renders behind: draw frozen first, then everything else.
  const frozenBars = React.useMemo(
    () => visibleBars.filter((b) => categoryOf(b.status) === "frozen"),
    [visibleBars, categoryOf]
  );
  const nonFrozenBars = React.useMemo(
    () => visibleBars.filter((b) => categoryOf(b.status) !== "frozen"),
    [visibleBars, categoryOf]
  );

  const lanes = Math.max(
    1,
    visibleBars.reduce((acc, b) => Math.max(acc, b.lane + 1), 1)
  );
  const trackH = lanes * LANE_HEIGHT + (lanes - 1) * LANE_GAP;

  // Center the stacked lanes inside the row’s height
  const baseY = Math.max(0, Math.floor((rowHeight - trackH) / 2));

  // hatch pattern (colored stripe + transparent gap)
  const STRIPE_W = 3;
  const STRIPE_G = 3;
  const CELL = STRIPE_W + STRIPE_G;
  const hatchColors = Array.from(
    new Set(visibleBars.filter((b) => b.hatch).map((b) => b.color))
  );

  // When both planned & actual are visible, separate them slightly
  const SPLIT_OFFSET = 10; // px (tweak)

  // Frozen styling: light blue, slightly taller, behind.
  const FROZEN_COLOR = "#BFE3FF"; // light blue, palette-friendly
  const FROZEN_OPACITY = 1; // slightly transparent
  const FROZEN_HEIGHT_DELTA = 6; // px taller than normal bars
  const FROZEN_Y_NUDGE = -16; // nudge up a bit so taller bar grows "up"

  const computeY = (b: LaidOutBar, cat: Category) => {
    const laneTop = baseY + b.lane * (LANE_HEIGHT + LANE_GAP);

    // baseline (your current look)
    let y = laneTop + LANE_HEIGHT / 3 - 2;

    // separate planned/actual when both shown
    if (splitY) {
      if (cat === "planned") y -= SPLIT_OFFSET;
      if (cat === "actual") y += SPLIT_OFFSET;
      // frozen stays centered (background reference)
    }

    // frozen is taller => nudge slightly
    if (cat === "frozen") y += FROZEN_Y_NUDGE;

    return y;
  };

  const renderBar = (b: LaidOutBar) => {
    const cat = categoryOf(b.status);
    const y = computeY(b, cat);

    const rx = 6;

    const patternId = `hatch-${b.color.replace("#", "")}`;
    const normalFill = b.hatch ? `url(#${patternId})` : b.color;

    const fill = cat === "frozen" ? FROZEN_COLOR : normalFill;

    const isHighlighted = highlight ? highlight.has(b.id) : true;
    const baseOpacity = isHighlighted ? 1 : 0.3;

    // frozen should remain readable but still “in the back”
    const opacity =
      cat === "frozen" ? baseOpacity * FROZEN_OPACITY : baseOpacity;

    const isSelected = selectedId === b.id;

    // frozen a bit taller
    const h =
      cat === "frozen" ? LANE_HEIGHT + FROZEN_HEIGHT_DELTA : LANE_HEIGHT;

    return (
      <g
        key={b.id}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseEnter={(e) =>
          onHover?.({ id: b.id, start: b.start, end: b.end, label: b.label }, e)
        }
        onMouseLeave={() => onHover?.(null)}
        onClick={(e) => {
          e.stopPropagation();
          onClick?.({ id: b.id });
        }}
        style={{ cursor: "pointer" }}
      >
        <rect
          x={b.x}
          y={y}
          width={b.width}
          height={h}
          rx={rx}
          ry={rx}
          fill={fill}
          opacity={opacity}
        />

        {/* Selection outline: only for non-frozen (so frozen doesn't steal attention) */}
        {isSelected && cat !== "frozen" && (
          <rect
            x={b.x - 1}
            y={y - 1}
            width={b.width + 2}
            height={h + 2}
            rx={rx + 1}
            ry={rx + 1}
            fill="none"
            strokeWidth={2}
            pointerEvents="none"
            opacity={0.6}
          />
        )}
      </g>
    );
  };

  return (
    <svg
      className="absolute inset-0"
      height={rowHeight}
      width="100%"
      style={{ pointerEvents: "auto", zIndex: 3 }}
      shapeRendering="geometricPrecision"
    >
      <defs>
        {hatchColors.map((color) => {
          const id = `hatch-${color.replace("#", "")}`;
          return (
            <pattern
              key={id}
              id={id}
              patternUnits="userSpaceOnUse"
              width={CELL}
              height={CELL}
              patternTransform="rotate(45)"
            >
              <rect width="100%" height="100%" fill="none" />
              <rect x="0" y="0" width={STRIPE_W} height="100%" fill={color} />
            </pattern>
          );
        })}
      </defs>

      {/* Background frozen first */}
      {frozenBars.map(renderBar)}

      {/* Foreground planned/actual on top */}
      {nonFrozenBars.map(renderBar)}
    </svg>
  );
}
