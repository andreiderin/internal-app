// components/ProductionTimeline/hooks/usePlanData.ts
import * as React from "react";
import type {
  MachineRow,
  ProcessItem,
} from "../components/ProductionTimeline/types";

type Payload = { machines: MachineRow[]; items: ProcessItem[] };

// IMPORTANT: this must match the internal backend base URL
const API_BASE = process.env.NEXT_PUBLIC_INTERNAL_API_BASE || "";

export function usePlanData() {
  const [data, setData] = React.useState<Payload | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const ac = new AbortController();

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const url = `${API_BASE}/schedule`;

        const res = await fetch(url, {
          signal: ac.signal,
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const json = (await res.json()) as Payload;

        setData(json);
      } catch (e: unknown) {
        if (e instanceof Error) {
          if (e.name === "AbortError") {
            return;
          } else {
            setError(e.message || String(e));
          }
        } else {
          setError(String(e));
        }
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      ac.abort();
    };
  }, []);

  // When data is still null, we spread nothing — callers must handle undefined
  return {
    machines: data?.machines,
    items: data?.items,
    loading,
    error,
  };
}
