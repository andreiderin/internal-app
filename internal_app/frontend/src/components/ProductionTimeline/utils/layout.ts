// utils/layout.ts
import { TimeScale } from "./timeScale";
import type { MachineRow, ProcessItem } from "../types";
import { parseInAppTimezone } from "./parseInAppTimezone";

export type LaidOutBar = {
  id: string;
  lane: number; // always 0 now
  x: number;
  width: number;
  start: number;
  end: number;
  color: string;
  hatch?: boolean;
  dash?: string;
  label?: string;
  status?: ProcessItem["status"];
  workOrderId?: string;
  salesOrderId?: string;
  arrow?: ProcessItem["arrow"];
};

export type MachineLayout = {
  lanes: number; // always 1 now
  bars: LaidOutBar[];
  rowHeight: number; // based on a single lane
};

export type LayoutResult = Record<string, MachineLayout>;

export const LAYOUT_CONSTANTS = {
  LANE_HEIGHT: 18,
  LANE_GAP: 6,
  ROW_PAD_Y: 8,
  MIN_BAR_PX: 3,
};

function styleForStatus(
  status: ProcessItem["status"],
  explicitColor?: string
): { color: string; hatch?: boolean; dash?: string } {
  if (explicitColor) return { color: explicitColor };
  switch (status) {
    case "planned":
      return { color: "#f3d598" };
    case "actual":
      return { color: "#88ea97" };
    case "not_accepted":
      return { color: "#f3d598", hatch: true };
    case "incomplete":
      return { color: "#e3706c", hatch: true };
    case "current":
      return { color: "#88ea97", hatch: true };
    default:
      return { color: "#88ea97" };
  }
}

export function layoutItemsByMachine(
  items: ProcessItem[],
  machines: MachineRow[],
  scale: TimeScale
): LayoutResult {
  const { LANE_HEIGHT, ROW_PAD_Y, MIN_BAR_PX } = LAYOUT_CONSTANTS;

  // group by machine
  const byMachine = new Map<string, ProcessItem[]>();
  for (const it of items) {
    if (!it.start || !it.end) continue;
    const arr = byMachine.get(it.machineId) ?? [];
    arr.push(it);
    byMachine.set(it.machineId, arr);
  }

  const result: LayoutResult = {};

  for (const m of machines) {
    const list = (byMachine.get(m.id) ?? []).slice();
    // sort by start just for consistent rendering order
    list.sort((a, b) => {
      const as = parseInAppTimezone(a.start!);
      const bs = parseInAppTimezone(b.start!);
      return as - bs;
    });

    const bars: LaidOutBar[] = [];

    for (const it of list) {
      console.log("it.start in layout.ts: ", it.start);
      const startMs = parseInAppTimezone(it.start!);
      console.log(
        "startMs after parseInTimezone:",
        startMs,
        "→",
        new Date(startMs).toLocaleString("tr-TR", {
          timeZone: "Europe/Istanbul",
        })
      );
      const endMs = parseInAppTimezone(it.end!);
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue;

      const x0 = scale.toX(startMs);
      const x1 = scale.toX(endMs);
      const width = Math.max(MIN_BAR_PX, x1 - x0);

      const sty = styleForStatus(it.status, it.color);

      // Single lane: always lane = 0
      bars.push({
        id: it.id,
        lane: 0,
        x: x0,
        width,
        start: startMs,
        end: endMs,
        color: sty.color,
        hatch: sty.hatch,
        dash: sty.dash,
        workOrderId: it.workOrderId,
        salesOrderId:
          it.salesOrderId ?? (it.meta?.["salesOrderId"] as string | undefined),
        status: it.status,
        arrow: it.arrow,
        label: it.label ?? it.workOrderId,
      });
    }

    // Single-lane row metrics
    const lanes = 1;
    const trackH = LANE_HEIGHT; // only one lane tall
    const rowHeight = trackH + ROW_PAD_Y * 2;

    result[m.id] = { lanes, bars, rowHeight };
  }

  return result;
}
