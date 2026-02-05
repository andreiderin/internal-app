"use client";

import * as React from "react";
import GridOverlay from "./GridOverlay";
import TimeAxis from "./TimeAxis";
import { ProductionTimelineProps } from "./types";
import { TimeScale, makeWindowForPreset, Preset } from "./utils/timeScale";
import { useRowWindow } from "./hooks/useRowWindow";
import { useDebounced } from "./hooks/useDebounced";
import { layoutItemsByMachine } from "./utils/layout";
import { RowItemsOverlay } from "./RowItemsOverlay";
import { Tooltip, type TooltipData } from "./Tooltip";
import NowMarker from "./NowMarker";

// constants (top)
const ROW_HEIGHT = 48;
const LEFT_COL_WIDTH = 180;
const GRID_PAD_X = 12; // px-3
const GRID_PAD_Y = 12; // pt-3
const TRACK_PAD_LEFT = 0;
const TRACK_PAD_RIGHT = 12;
const AXIS_HEIGHT = 16;

// at top of ProductionTimeline.tsx
export type ProductionTimelineHandle = {
  panBy: (mult: -1 | 1) => void; // -1 = previous, +1 = next
  snapToToday: () => void;
};

function colorForStatus(status?: string): { color: string; hatch: boolean } {
  switch (status) {
    case "planned":
      return { color: "#f3d598", hatch: false }; // yellow
    case "actual":
      return { color: "#88ea97", hatch: false }; // green
    case "not_accepted":
      return { color: "#f3d598", hatch: true }; // orange + dashed stroke
    case "incomplete":
      return { color: "#e3706c", hatch: true }; // grey + fine dash
    case "current":
      return { color: "#88ea97", hatch: true }; // green + fine dash
    case "frozen":
      return { color: "#73bbd1", hatch: true };
    default:
      return { color: "#88ea97", hatch: false }; // default to actual green
  }
}

function buildRelationMaps(
  items: { id: string; workOrderId?: string; salesOrderId?: string }[]
) {
  const idToWO = new Map<string, string | undefined>();
  const idToSO = new Map<string, string | undefined>();
  const woToIds = new Map<string, Set<string>>();
  const soToIds = new Map<string, Set<string>>();

  for (const it of items) {
    idToWO.set(it.id, it.workOrderId);
    idToSO.set(it.id, it.salesOrderId);
    if (it.workOrderId) {
      if (!woToIds.has(it.workOrderId)) woToIds.set(it.workOrderId, new Set());
      woToIds.get(it.workOrderId)!.add(it.id);
    }
    if (it.salesOrderId) {
      if (!soToIds.has(it.salesOrderId))
        soToIds.set(it.salesOrderId, new Set());
      soToIds.get(it.salesOrderId)!.add(it.id);
    }
  }
  return { idToWO, idToSO, woToIds, soToIds };
}

export const ProductionTimeline = React.forwardRef<
  ProductionTimelineHandle,
  ProductionTimelineProps
>(
  (
    { machines, items, className, initialView = "week", visibleStatuses },
    ref
  ) => {
    console.log("items in timeline", items);
    const wrapperRef = React.useRef<HTMLDivElement>(null);
    const [trackWidth, setTrackWidth] = React.useState(800);

    const scrollerRef = React.useRef<HTMLDivElement>(null);

    const vs = visibleStatuses ?? {
      planned: true,
      actual: true,
      frozen: true,
    };

    const [scrollTop, setScrollTop] = React.useState(0);
    const [viewportH, setViewportH] = React.useState(600);

    const [tip, setTip] = React.useState<TooltipData | null>(null);
    const [tipPos, setTipPos] = React.useState<{ x: number; y: number } | null>(
      null
    );

    // AFTER building `scale`
    const svgWidthPx = trackWidth + TRACK_PAD_LEFT + TRACK_PAD_RIGHT;
    const axisWidthPx = svgWidthPx;

    const viewportHDebounced = useDebounced(viewportH, 80);

    // after you have `items` and `machines`
    const idToItem = React.useMemo(() => {
      const m = new Map(items.map((it) => [it.id, it]));
      return m;
    }, [items]);

    const machineIdToName = React.useMemo(() => {
      const m = new Map(machines.map((mx) => [mx.id, mx.name]));
      return m;
    }, [machines]);

    React.useEffect(() => {
      const el = scrollerRef.current;
      if (!el) return;
      const ro = new ResizeObserver((entries) => {
        const w = entries[0].contentRect.width;
        const drawable =
          w -
          LEFT_COL_WIDTH -
          GRID_PAD_X -
          GRID_PAD_X -
          TRACK_PAD_LEFT -
          TRACK_PAD_RIGHT;
        setTrackWidth(Math.max(1, drawable));
      });
      ro.observe(el);
      return () => ro.disconnect();
    }, []);

    React.useEffect(() => {
      const el = scrollerRef.current;
      if (!el) return;
      const ro = new ResizeObserver((entries) => {
        setViewportH(entries[0].contentRect.height);
      });
      ro.observe(el);
      return () => ro.disconnect();
    }, []);

    // Preset/view state
    const [preset, setPreset] = React.useState<Preset>(initialView as Preset);
    React.useEffect(() => setPreset(initialView as Preset), [initialView]);

    // Window (stateful) + Scale
    const [win, setWin] = React.useState(() => makeWindowForPreset(preset));
    // React.useEffect(() => setWin(makeWindowForPreset(preset)), [preset]);

    function spanMsForPreset(preset: Preset) {
      switch (preset) {
        case "day":
          return 24 * 60 * 60 * 1000; // 1 day
        case "3day":
          return 3 * 24 * 60 * 60 * 1000;
        case "week":
          return 7 * 24 * 60 * 60 * 1000;
        case "month":
          return 30 * 24 * 60 * 60 * 1000;
        default:
          return 7 * 24 * 60 * 60 * 1000;
      }
    }

    // ✅ and replace with this effect
    React.useEffect(() => {
      setWin((w) => {
        const center = (w.startMs + w.endMs) / 2;
        const span = spanMsForPreset(preset);
        return {
          startMs: Math.round(center - span / 2),
          endMs: Math.round(center + span / 2),
        };
      });
    }, [preset]);

    React.useImperativeHandle(
      ref,
      () => ({
        panBy(mult) {
          // shift the window by exactly one current span
          setWin((w) => {
            const span = w.endMs - w.startMs;
            const delta = span * mult;
            return { startMs: w.startMs + delta, endMs: w.endMs + delta };
          });
        },
        snapToToday() {
          setWin(makeWindowForPreset(preset, Date.now()));
        },
      }),
      [preset]
    );

    const scale = React.useMemo(() => {
      return new TimeScale({
        startMs: win.startMs,
        endMs: win.endMs,
        widthPx: Math.max(1, trackWidth),
      });
    }, [win, trackWidth]);

    // Layout
    const layoutMap = React.useMemo(
      () => layoutItemsByMachine(items, machines, scale),
      [items, machines, scale]
    );

    // --- selection + relations ---
    type Mode = "none" | "workOrder" | "salesOrder";
    const [selectedId, setSelectedId] = React.useState<string | null>(null);
    const [mode, setMode] = React.useState<Mode>("none");
    const relations = React.useMemo(() => buildRelationMaps(items), [items]);

    const highlightedIds = React.useMemo(() => {
      if (!selectedId || mode === "none") return undefined;
      const set = new Set<string>();
      set.add(selectedId);
      if (mode === "workOrder") {
        const wo = relations.idToWO.get(selectedId);
        if (wo) for (const rid of relations.woToIds.get(wo) ?? []) set.add(rid);
      } else if (mode === "salesOrder") {
        const so = relations.idToSO.get(selectedId);
        if (so) for (const rid of relations.soToIds.get(so) ?? []) set.add(rid);
      }
      return set;
    }, [selectedId, mode, relations]);

    const hasHighlights = !!highlightedIds && highlightedIds.size > 0;

    const handleBarClick = React.useCallback(
      (bar: { id: string }) => {
        if (selectedId !== bar.id) {
          setSelectedId(bar.id);
          setMode("workOrder");
        } else {
          setMode((prev) =>
            prev === "workOrder"
              ? "salesOrder"
              : prev === "salesOrder"
              ? "none"
              : "workOrder"
          );
          if (mode === "none") setSelectedId(null);
        }
      },
      [selectedId, mode]
    );

    // --- tooltip ---
    // const [tipOpen, setTipOpen] = React.useState(false);
    // const [tipPoint, setTipPoint] = React.useState<{
    //   x: number;
    //   y: number;
    // } | null>(null);
    // const [tipData, setTipData] = React.useState<{
    //   title: string;
    //   range: string;
    // } | null>(null);

    // add near other state
    const [isOverTip, setIsOverTip] = React.useState(false);
    const hideTimerRef = React.useRef<number | null>(null);
    const isOverTipRef = React.useRef(false); // ← NEW
    const isOverBarRef = React.useRef(false); // ← NEW

    const clearIfSafe = React.useCallback(() => {
      // Only close if cursor is over neither the bar nor the tooltip
      if (!isOverTipRef.current && !isOverBarRef.current) {
        setTip(null);
        setTipPos(null);
      }
    }, []);

    if (isOverTip) {
    }

    // const safeClearTip = React.useCallback(() => {
    //   // only clear if we're not over the tooltip
    //   if (!isOverTip) {
    //     setTip(null);
    //     setTipPos(null);
    //   }
    // }, [isOverTip]);

    const scheduleHideTip = React.useCallback(
      (delayMs = 120) => {
        if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = window.setTimeout(() => {
          hideTimerRef.current = null;
          clearIfSafe(); // ← uses refs, not stale state
        }, delayMs) as unknown as number;
      },
      [clearIfSafe]
    );

    React.useEffect(() => {
      return () => {
        if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
      };
    }, []);

    const handleBarHover = React.useCallback(
      (
        bar: { id: string; start: number; end: number; label?: string } | null,
        evt?: React.MouseEvent
      ) => {
        if (!bar || !evt) {
          // leaving the bar
          isOverBarRef.current = false;
          scheduleHideTip();
          return;
        }

        // entering/hovering the bar
        isOverBarRef.current = true;

        // 🔒 Gate tooltips to highlighted bars when a highlight is active
        if (hasHighlights && !highlightedIds!.has(bar.id)) {
          // if a non-highlighted bar is hovered, don't show/update the tooltip
          return;
        }

        if (hideTimerRef.current) {
          window.clearTimeout(hideTimerRef.current);
          hideTimerRef.current = null;
        }

        const raw = idToItem.get(bar.id);
        if (!raw) {
          scheduleHideTip();
          return;
        }

        const { color, hatch } = colorForStatus(raw.status);
        const data: TooltipData = {
          id: bar.id,
          label: bar.label || raw.workOrderId,
          workOrderId: raw.workOrderId,
          salesOrderId: raw.salesOrderId,
          machineName: machineIdToName.get(raw.machineId),
          productCode: raw.productCode ?? null,
          quantity: raw.quantity ?? null,
          start: bar.start,
          end: bar.end,
          status: raw.status,
          color,
          hatch,
          salesOrderDeliveryMs: raw.salesOrderDeliveryDate
            ? Date.parse(raw.salesOrderDeliveryDate)
            : null,
          salesOrderWorkOrderCount: raw.salesOrderWorkOrderCount ?? null,
          workOrderIndexInSO: raw.workOrderIndexInSO ?? null,
        };

        setTip(data);
        setTipPos({ x: evt.clientX, y: evt.clientY });
      },
      [
        hasHighlights,
        highlightedIds,
        idToItem,
        machineIdToName,
        scheduleHideTip,
      ]
    );

    // Scroll + hide tooltip
    const onScroll = React.useCallback(() => {
      const el = scrollerRef.current;
      if (!el) return;
      setScrollTop(el.scrollTop);
      // setTipOpen(false);
    }, []);

    React.useEffect(() => {
      const el = scrollerRef.current;
      if (!el) return;
      setViewportH(el.clientHeight);
      el.addEventListener("scroll", onScroll, { passive: true });
      return () => el.removeEventListener("scroll", onScroll);
    }, [onScroll]);

    // Esc clears selection & tooltip
    React.useEffect(() => {
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          setSelectedId(null);
          setMode("none");
          // setTipOpen(false);
        }
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, []);

    // Windowed rows
    const rowCount = machines.length;
    const totalHeight = rowCount * ROW_HEIGHT;
    const shouldStickAxis = totalHeight + GRID_PAD_Y > viewportH;

    const { first, last } = useRowWindow({
      scrollTop,
      viewportH: viewportHDebounced,
      rowH: ROW_HEIGHT,
      rowCount,
      overscan: 4,
    });
    const visibleMachines = machines.slice(first, last + 1);

    const clearSelection = React.useCallback(() => {
      setSelectedId(null);
      setMode("none");
    }, []);

    // ----- drag-to-pan (left mouse button)
    const isDraggingRef = React.useRef(false);
    const dragStartXRef = React.useRef(0);
    const dragStartWinRef = React.useRef(win);

    const dragMovedRef = React.useRef(false);

    const suppressClearClickRef = React.useRef(false);

    const onPointerDown = React.useCallback(
      (e: React.PointerEvent) => {
        if (e.button !== 0) return; // left button
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        isDraggingRef.current = true;
        dragMovedRef.current = false; // ← reset
        dragStartXRef.current = e.clientX;
        dragStartWinRef.current = win;
        document.body.style.cursor = "grabbing";
      },
      [win]
    );

    const onPointerMove = React.useCallback(
      (e: React.PointerEvent) => {
        if (!isDraggingRef.current) return;
        const dxPx = e.clientX - dragStartXRef.current;
        if (Math.abs(dxPx) > 3) dragMovedRef.current = true; // ← tiny threshold

        const spanMs =
          dragStartWinRef.current.endMs - dragStartWinRef.current.startMs;
        const msPerPx = spanMs / Math.max(1, trackWidth);
        const deltaMs = -dxPx * msPerPx; // drag right -> go earlier
        setWin({
          startMs: Math.round(dragStartWinRef.current.startMs + deltaMs),
          endMs: Math.round(dragStartWinRef.current.endMs + deltaMs),
        });
      },
      [trackWidth]
    );

    const onPointerUp = React.useCallback((e: React.PointerEvent) => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      document.body.style.cursor = "";
      if (dragMovedRef.current) {
        // A real drag happened — ignore the synthetic click that will follow
        suppressClearClickRef.current = true;
        // (Optional) auto-clear the flag on the next tick just in case
        setTimeout(() => {
          suppressClearClickRef.current = false;
        }, 0);
      }
    }, []);

    return (
      <div
        ref={wrapperRef}
        className={`w-full h-full bg-white ${className ?? ""}`}
        role="region"
        aria-label="Production Timeline"
        onClick={() => {
          if (suppressClearClickRef.current || isOverTipRef.current) {
            suppressClearClickRef.current = false;
            return;
          }
          clearSelection();
        }}
      >
        <div ref={scrollerRef} className="relative h-full overflow-auto">
          {/* Rows */}
          <div
            className="relative px-3 pt-3"
            style={{
              paddingBottom: shouldStickAxis ? AXIS_HEIGHT : 0,
              minHeight: shouldStickAxis ? viewportH : undefined,
            }}
          >
            {/* TOP spacer */}
            <div style={{ height: first * ROW_HEIGHT }} />

            {/* VISIBLE WINDOW */}
            {visibleMachines.map((m) => (
              <div
                key={m.id}
                style={{ height: ROW_HEIGHT, position: "relative" }}
              >
                {/* Row background pill */}
                <div className="absolute inset-0 px-1">
                  <div className="h-full w-full rounded-[12px] bg-white border border-[#ECECF3] shadow-[inset_0_0_0_1px_#EEF0F6]" />
                </div>

                {/* Row content: two columns (left rail + track) */}
                <div
                  className="absolute inset-0 grid"
                  style={{ gridTemplateColumns: `${LEFT_COL_WIDTH}px 1fr` }}
                >
                  <div className="flex items-center justify-between pl-8 pr-3 border-r border-navi-gray">
                    <span className="text-[13px] text-[#2449e9] truncate">
                      {m.name}
                    </span>
                    {/* <span className="text-[#B6BBD0]">›</span> */}
                  </div>

                  <div className="relative">
                    <div
                      className="absolute inset-0"
                      style={{
                        left: 0,
                        right: GRID_PAD_X - 6, // ← clip to the same right gutter the grid reserves
                        top: 0,
                        bottom: 0,
                        paddingLeft: TRACK_PAD_LEFT,
                        paddingRight: TRACK_PAD_RIGHT,
                        zIndex: 3,
                        cursor: "grab",
                        overflow: "hidden", // ← ensure the SVG can’t leak past the box
                      }}
                      onPointerDown={onPointerDown}
                      onPointerMove={onPointerMove}
                      onPointerUp={onPointerUp}
                    >
                      {layoutMap[m.id]?.bars && (
                        <RowItemsOverlay
                          bars={layoutMap[m.id].bars}
                          rowHeight={ROW_HEIGHT}
                          highlight={highlightedIds}
                          selectedId={selectedId}
                          onHover={handleBarHover}
                          onClick={handleBarClick}
                          visibleStatuses={vs}
                          splitY={vs.planned && vs.actual}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {/* BOTTOM spacer */}
            <div
              style={{
                height: Math.max(0, (rowCount - (last + 1)) * ROW_HEIGHT),
              }}
            />
          </div>

          <GridOverlay
            scale={scale}
            contentHeight={totalHeight}
            preset={preset}
            // rowCount={rowCount}
            // rowHeight={ROW_HEIGHT}
            leftOffset={LEFT_COL_WIDTH + GRID_PAD_X}
            topOffset={GRID_PAD_Y}
            rightPadding={GRID_PAD_X}
            trackPaddingLeft={TRACK_PAD_LEFT}
            svgWidthPx={svgWidthPx}
          />

          <NowMarker
            scale={scale}
            leftOffset={LEFT_COL_WIDTH + GRID_PAD_X}
            topOffset={GRID_PAD_Y}
            trackPaddingLeft={TRACK_PAD_LEFT}
            svgWidthPx={svgWidthPx}
            contentHeight={totalHeight}
          />

          <TimeAxis
            scale={scale}
            preset={preset}
            position="bottom"
            leftOffset={LEFT_COL_WIDTH + GRID_PAD_X}
            trackPaddingLeft={TRACK_PAD_LEFT}
            trackPaddingRight={TRACK_PAD_RIGHT}
            axisWidthPx={axisWidthPx}
            axisHeight={AXIS_HEIGHT}
            sticky={shouldStickAxis}
          />
        </div>
        {/* Tooltip */}
        <Tooltip
          open={!!tip}
          anchor={tipPos}
          data={tip}
          onMouseEnter={() => {
            if (hideTimerRef.current) {
              window.clearTimeout(hideTimerRef.current);
              hideTimerRef.current = null;
            }
            setIsOverTip(true);
            isOverTipRef.current = true; // ← NEW
          }}
          onMouseLeave={() => {
            setIsOverTip(false);
            isOverTipRef.current = false; // ← NEW
            scheduleHideTip(80);
          }}
        />
      </div>
    );
  }
);

ProductionTimeline.displayName = "ProductionTimeline";
