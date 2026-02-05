"use client";

import * as React from "react";
import { TimelinePanel } from "@/components/TimelinePanel";
import type { MachineRow, ProcessItem } from "@/components/ProductionTimeline";

const API_BASE = process.env.NEXT_PUBLIC_INTERNAL_API_BASE || "";
const TIME_UNIT_SECONDS = 60;

type AlgoStep = [number, string, number | string, number | string];
type AlgoSchedule = Record<string, Array<AlgoStep>>;
type TimelineSchedule = {
  machines: MachineRow[];
  items: ProcessItem[];
};

function buildTimelineData(schedule: AlgoSchedule, baseTime: Date) {
  const machinesByName = new Map<string, MachineRow>();
  const items: ProcessItem[] = [];
  const baseMs = baseTime.getTime();
  const unitMs = TIME_UNIT_SECONDS * 1000;

  Object.entries(schedule).forEach(([workOrderId, steps]) => {
    steps.forEach(([stepIndex, machineName, startOffset, endOffset], idx) => {
      if (!machinesByName.has(machineName)) {
        machinesByName.set(machineName, { id: machineName, name: machineName });
      }

      const start =
        typeof startOffset === "string"
          ? startOffset
          : new Date(baseMs + startOffset * unitMs).toISOString();
      const end =
        typeof endOffset === "string"
          ? endOffset
          : new Date(baseMs + endOffset * unitMs).toISOString();

      items.push({
        id: `${workOrderId}-${stepIndex}-${idx}`,
        machineId: machineName,
        workOrderId,
        start,
        end,
        status: "planned",
        label: workOrderId,
        meta: { stepIndex },
      });
    });
  });

  const machines = Array.from(machinesByName.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  items.sort((a, b) => (a.start ?? "").localeCompare(b.start ?? ""));

  return { machines, items };
}

function isTimelineSchedule(value: unknown): value is TimelineSchedule {
  if (!value || typeof value !== "object") return false;
  const v = value as { machines?: unknown; items?: unknown };
  return Array.isArray(v.machines) && Array.isArray(v.items);
}

export default function HomePage() {
  const [isAuthed, setIsAuthed] = React.useState(false);
  const [password, setPassword] = React.useState("");
  const [authError, setAuthError] = React.useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = React.useState<string | null>(null);
  const [timelineKey, setTimelineKey] = React.useState(0);
  const [scheduleData, setScheduleData] = React.useState<{
    machines: MachineRow[];
    items: ProcessItem[];
  } | null>(null);
  const [selectedFileName, setSelectedFileName] =
    React.useState<string>("No file chosen");

  React.useEffect(() => {
    const stored = sessionStorage.getItem("internal_app_authed");
    if (stored === "true") {
      setIsAuthed(true);
    }
  }, []);

  const handleDownload = async () => {
    setUploadStatus(null);
    try {
      const res = await fetch(`${API_BASE}/planner-input`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const blob = new Blob([JSON.stringify(await res.json(), null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "planner_input_cplex.json";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to download";
      setUploadStatus(message);
    }
  };

  const handleAuthSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password === "12345678") {
      setIsAuthed(true);
      sessionStorage.setItem("internal_app_authed", "true");
      setAuthError(null);
      setPassword("");
    } else {
      setAuthError("Incorrect password.");
    }
  };

  const handleUpload = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setUploadStatus(null);

    const form = event.currentTarget;
    const input = form.elements.namedItem(
      "schedule",
    ) as HTMLInputElement | null;
    if (!input || !input.files || input.files.length === 0) {
      setUploadStatus("Pick a JSON schedule file first.");
      return;
    }

    try {
      const fileText = await input.files[0].text();
      const parsed = JSON.parse(fileText) as unknown;
      if (isTimelineSchedule(parsed)) {
        setScheduleData({ machines: parsed.machines, items: parsed.items });
      } else {
        const nextData = buildTimelineData(parsed as AlgoSchedule, new Date());
        setScheduleData(nextData);
      }
      setUploadStatus("Loaded schedule into session.");
      setTimelineKey((prev) => prev + 1);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      setUploadStatus(message);
    }
  };

  return (
    <div className="min-h-screen bg-white text-[#1f2337]">
      {!isAuthed ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-white">
          <div className="w-full max-w-sm rounded-2xl border border-[#e2e6f2] bg-white p-6 shadow-[0_24px_60px_rgba(25,32,56,0.12)]">
            <div className="text-xs uppercase tracking-[0.35em] text-[#5a6081]">
              Internal Access
            </div>
            <h1 className="mt-2 text-lg font-semibold text-[#1f2a44]">
              Enter Password
            </h1>
            <form className="mt-4 space-y-3" onSubmit={handleAuthSubmit}>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Password"
                className="w-full rounded-lg border border-[#d7dcee] px-3 py-2 text-sm focus:border-[#4060FF] focus:outline-none"
              />
              <button
                type="submit"
                className="w-full rounded-lg bg-[#4060FF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2f55e6]"
              >
                Unlock
              </button>
            </form>
            {authError ? (
              <p className="mt-3 text-sm text-[#c03a3a]">{authError}</p>
            ) : null}
          </div>
        </div>
      ) : null}
      <header className="border-b border-[#e2e6f2] bg-white">
        <div className="flex w-full items-center justify-between px-6 py-4">
          <div>
            {/* <div className="text-xs uppercase tracking-[0.35em] text-[#5a6081]">
              Internal
            </div> */}
            <h1 className="text-lg font-semibold text-[#1f2a44]">
              Planner Input & Schedule Viewer
            </h1>
          </div>
        </div>
      </header>

      <main className="flex w-full flex-col gap-6 px-6 py-6">
        <section className="rounded-2xl border border-[#e2e6f2] bg-white p-5 shadow-[0_20px_50px_rgba(25,32,56,0.08)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <button
                type="button"
                onClick={handleDownload}
                className="rounded-lg border border-[#4060FF] px-4 py-2 text-sm font-semibold text-[#4060FF] hover:bg-[#f3f5ff]"
              >
                Download Planner Input (JSON)
              </button>
            </div>

            <form
              className="flex flex-wrap items-center justify-end gap-3"
              onSubmit={handleUpload}
            >
              <label className="cursor-pointer rounded-lg border border-[#c8d2f0] bg-white px-3 py-2 text-sm font-medium text-[#2f4cc5] shadow-[0_6px_16px_rgba(31,42,68,0.08)] transition hover:border-[#4060FF] hover:text-[#4060FF]">
                Choose schedule JSON
                <input
                  type="file"
                  name="schedule"
                  accept="application/json"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    setSelectedFileName(file ? file.name : "No file chosen");
                  }}
                />
              </label>
              <span className="text-xs text-[#5a6081]">{selectedFileName}</span>
              <button
                type="submit"
                className="rounded-lg bg-[#4060FF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2f55e6]"
              >
                Upload Schedule JSON
              </button>
            </form>
          </div>
          {uploadStatus ? (
            <p className="mt-3 text-sm text-[#5a6081]">{uploadStatus}</p>
          ) : null}
        </section>

        <section className="rounded-2xl border border-[#e2e6f2] bg-white p-5 shadow-[0_20px_50px_rgba(25,32,56,0.08)]">
          <TimelinePanel
            key={timelineKey}
            machines={scheduleData?.machines}
            items={scheduleData?.items}
          />
        </section>
      </main>
    </div>
  );
}
