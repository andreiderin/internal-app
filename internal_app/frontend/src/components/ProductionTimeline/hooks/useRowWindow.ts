"use client";
// import * as React from "react";

export type RowWindow = {
  first: number; // inclusive
  last: number; // inclusive
  offsetY: number; // translateY for first rendered row (if you need it later)
  viewportH: number; // for debugging/QA
};

/** Compute visible row window from scrollTop + viewport height. */
export function useRowWindow(params: {
  scrollTop: number;
  viewportH: number;
  rowH: number;
  rowCount: number;
  overscan?: number; // default 4
}): RowWindow {
  const { scrollTop, viewportH, rowH, rowCount, overscan = 4 } = params;

  const firstVisible = Math.floor(scrollTop / rowH);
  const visibleCount = Math.ceil(viewportH / rowH);

  const first = Math.max(0, firstVisible - overscan);
  const last = Math.min(rowCount - 1, firstVisible + visibleCount + overscan);

  const offsetY = first * rowH;
  return { first, last, offsetY, viewportH };
}
