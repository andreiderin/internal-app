"use client";

import * as React from "react";
import {
  ProductionTimeline,
  type ProductionTimelineHandle,
} from "@/components/ProductionTimeline";
import { usePlanData } from "@/hooks/usePlanData";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  DEMO_MACHINES,
  DEMO_ITEMS,
} from "@/components/ProductionTimeline/demoData";
import type { MachineRow, ProcessItem } from "@/components/ProductionTimeline";

const USE_DEMO = 0;

type View = "day" | "3day" | "week" | "month";

const MACHINE_ORDER = [
  "HKK 1",
  "HKK 2",
  "RKK 1",
  "BKK 1",
  "BAL 1",
  "YIK 1",
  "KUR 1",
  "KUR 2",
  "TUP 1",
  "DOK 1",
  "SAR 1",
  "SAR 2",
  "SAR 3",
  "SAR 4",
  "RAM 1",
  "RAM 2",
  "FKK 1",
  "FKK 2",
];

type TimelinePanelProps = {
  machines?: MachineRow[];
  items?: ProcessItem[];
};

export function TimelinePanel({ machines, items }: TimelinePanelProps) {
  // zoom (view) state
  const [view, setView] = React.useState<View>("3day");

  // data (backend with demo fallback)
  const planData = usePlanData();

  const dataMachines = USE_DEMO
    ? DEMO_MACHINES
    : (machines ?? planData.machines ?? DEMO_MACHINES);
  const dataItems = USE_DEMO
    ? DEMO_ITEMS
    : (items ?? planData.items ?? DEMO_ITEMS);

  const [showPlanned, setShowPlanned] = React.useState(true);
  const [showActual, setShowActual] = React.useState(true);
  // later: frozen
  const [showFrozen, setShowFrozen] = React.useState(false);

  // timeline ref to call pan/today
  const timelineRef = React.useRef<ProductionTimelineHandle>(null);
  const goPrev = () => timelineRef.current?.panBy(-1);
  const goNext = () => timelineRef.current?.panBy(1);
  const goToday = () => timelineRef.current?.snapToToday();

  const machinesOrdered = React.useMemo(() => {
    if (!dataMachines?.length) return [];
    // filter out FAKE machine
    const filtered = dataMachines.filter(
      (m) => m.name.toLowerCase() !== "fake" && m.id.toLowerCase() !== "fake",
    );

    const pos = new Map(MACHINE_ORDER.map((n, i) => [n.toLowerCase(), i]));
    return filtered.slice().sort((a, b) => {
      const ia = pos.get(a.name.toLowerCase());
      const ib = pos.get(b.name.toLowerCase());
      const ra = ia ?? Number.MAX_SAFE_INTEGER;
      const rb = ib ?? Number.MAX_SAFE_INTEGER;
      return ra === rb ? a.name.localeCompare(b.name) : ra - rb;
    });
  }, [dataMachines]);

  return (
    <div className="w-full">
      {/* Top controls row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Zoom segmented */}
        <div className="inline-flex rounded-lg overflow-hidden h-8">
          {(["day", "3day", "week", "month"] as View[]).map((v) => (
            <button
              key={v}
              className={`px-4 py-1 text-sm font-medium border border-[#4060FF] rounded-lg transition-colors ${
                view === v
                  ? "bg-[#4060FF] text-white"
                  : "bg-white text-[#4060FF]"
              }`}
              onClick={() => setView(v)}
            >
              {v === "3day" ? "3 Days" : v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-[#2449e9]">
            <input
              type="checkbox"
              checked={showPlanned}
              onChange={(e) => setShowPlanned(e.target.checked)}
            />
            Planned
          </label>

          <label className="flex items-center gap-2 text-sm text-[#2449e9]">
            <input
              type="checkbox"
              checked={showActual}
              onChange={(e) => setShowActual(e.target.checked)}
            />
            Actual
          </label>

          <label className="flex items-center gap-2 text-sm text-[#2449e9]">
            <input
              type="checkbox"
              checked={showFrozen}
              onChange={(e) => setShowFrozen(e.target.checked)}
            />
            Frozen
          </label>
        </div>

        {/* Nav group */}
        <div className="flex items-center gap-3 mr-6">
          {/* <button className="px-4 ml-5 py-1 text-sm font-medium border border-[#4060FF] rounded-lg bg-white text-[#4060FF] hover:bg-gray-50 transition-colors h-8">
              Export as pdf
            </button> */}

          <div className="inline-flex items-center rounded-lg bg-[#2449e9] h-8">
            <button
              aria-label="Previous"
              className="h-full w-6 grid place-items-center text-white hover:bg-white/10 rounded-l-lg"
              onClick={goPrev}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>

            <button
              className="h-full px-4 bg-white border rounded-lg text-[#2449e9] text-sm font-medium hover:bg-gray-50"
              onClick={goToday}
            >
              Today
            </button>

            <button
              aria-label="Next"
              className="h-full w-6 grid place-items-center text-white hover:bg-white/10 rounded-r-lg"
              onClick={goNext}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Timeline area */}
      <div className="md:mt-4">
        <div className="h-[740px] overflow-hidden rounded-xl border border-[#E9ECF4] bg-white">
          {/* {error ? (
              <div className="h-full grid place-items-center text-sm text-red-600">
                Failed to load schedule. Showing demo data.
              </div>
            ) : loading ? (
              <div className="h-full grid place-items-center text-sm text-gray-500">
                Loading schedule…
              </div>
            ) : null} */}

          <ProductionTimeline
            ref={timelineRef}
            machines={machinesOrdered}
            items={dataItems}
            initialView={view}
            visibleStatuses={{
              planned: showPlanned,
              actual: showActual,
              frozen: showFrozen, // placeholder for later
            }}
          />
        </div>
      </div>
    </div>
  );
}
