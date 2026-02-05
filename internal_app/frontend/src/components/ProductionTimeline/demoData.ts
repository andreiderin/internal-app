// components/ProductionTimeline/demoItems.ts
import type { MachineRow, ProcessItem } from "./types";

export const DEMO_MACHINES: MachineRow[] = [
  { id: "HKK-1", name: "HKK 1" },
  { id: "HKK-2", name: "HKK 2" },
  { id: "RAM-1", name: "RAM 1" },
  { id: "RAM-2", name: "RAM 2" },
  { id: "BAL-1", name: "BAL 1" },
  { id: "BAL-2", name: "BAL 2" },
  { id: "YIK-1", name: "YIK 1" },
  { id: "YIK-2", name: "YIK 2" },
  { id: "TUP-1", name: "TUP 1" },
  { id: "TUP-2", name: "TUP 2" },
  { id: "FKK-1", name: "FKK 1" },
  { id: "FKK-2", name: "FKK 2" },
  { id: "FKK-3", name: "FKK 3" },
  { id: "FKK-4", name: "FKK 4" },
];

/**
 * Relations to test:
 * - SO-9001 groups WO1001 & WO1002 (different WOs under same SO)
 * - SO-9002 groups WO2001 & WO2003 (different WOs)
 * - SO-9010 groups multi-step WO7001 across machines (same WO across machines)
 * - Mix of statuses to check dim/highlight: actual (green), planned (yellow), incomplete (orange), not_accepted (gray)
 */
export const DEMO_ITEMS: ProcessItem[] = [
  /* ---------- SO-9001: WO1001 & WO1002 ---------- */
  // WO1001 — appears on two machines in sequence (same WO across items)
  {
    id: "HKK1-WO1001-A",
    machineId: "HKK-1",
    workOrderId: "WO1001",
    salesOrderId: "SO-9001",
    start: "2025-09-25T07:30:00.000",
    end: "2025-09-25T09:00:00.000",
    productCode: "FAB-ABC",
    quantity: 120,
    status: "actual",
    label: "WO1001 (HKK-1)",
  },
  {
    id: "RAM1-WO1001-A",
    machineId: "RAM-1",
    workOrderId: "WO1001",
    salesOrderId: "SO-9001",
    start: "2025-09-25T09:15:00.000", // +15m handoff gap
    end: "2025-09-25T10:45:00.000",
    productCode: "FAB-ABC",
    quantity: 120,
    status: "actual",
    label: "WO1001 (RAM-1)",
  },

  // WO1002 — different WO but same SO-9001
  {
    id: "BAL1-WO1002-A",
    machineId: "BAL-1",
    workOrderId: "WO1002",
    salesOrderId: "SO-9001",
    start: "2025-09-26T09:00:00.000",
    end: "2025-09-26T12:00:00.000",
    productCode: "FAB-XYZ",
    quantity: 80,
    status: "actual",
    label: "WO1002 (BAL-1)",
  },
  // Planned continuation for WO1002 (same SO)
  {
    id: "YIK1-WO1002-P",
    machineId: "YIK-1",
    workOrderId: "WO1002",
    salesOrderId: "SO-9001",
    start: "2025-09-26T12:30:00.000",
    end: "2025-09-26T14:00:00.000",
    productCode: "FAB-XYZ",
    quantity: 80,
    status: "planned",
    label: "WO1002 Plan (YIK-1)",
  },
  {
    id: "BAL2-WO1002-P",
    machineId: "BAL-2",
    workOrderId: "WO1002",
    salesOrderId: "SO-9001",
    start: "2025-09-26T09:00.000",
    end: "2025-09-26T10:00:00.000",
    productCode: "FAB-XYZ",
    quantity: 80,
    status: "planned",
    label: "WO1002 Plan (YIK-1)",
  },

  /* ---------- SO-9002: WO2001 & WO2003 ---------- */
  {
    id: "HKK2-WO2001-A",
    machineId: "HKK-2",
    workOrderId: "WO2001",
    salesOrderId: "SO-9002",
    start: "2025-09-26T08:00:00.000",
    end: "2025-09-26T09:30:00.000",
    productCode: "FAB-MNO",
    quantity: 70,
    status: "actual",
    label: "WO2001 (HKK-2)",
  },
  // Planned step for WO2001 later (same WO, different machine)
  {
    id: "BAL2-WO2001-P",
    machineId: "BAL-2",
    workOrderId: "WO2001",
    salesOrderId: "SO-9002",
    start: "2025-09-26T10:00:00.000",
    end: "2025-09-26T11:00:00.000",
    productCode: "FAB-MNO",
    quantity: 70,
    status: "planned",
    label: "WO2001 Plan (BAL-2)",
  },
  // Different WO under same SO-9002
  {
    id: "TUP1-WO2003-A",
    machineId: "TUP-1",
    workOrderId: "WO2003",
    salesOrderId: "SO-9002",
    start: "2025-09-27T09:00:00.000",
    end: "2025-09-27T11:30:00.000",
    productCode: "FAB-VWX",
    quantity: 65,
    status: "actual",
    label: "WO2003 (TUP-1)",
  },
  {
    id: "TUP2-WO2003-I",
    machineId: "TUP-2",
    workOrderId: "WO2003",
    salesOrderId: "SO-9002",
    start: "2025-09-27T12:00:00.000",
    end: "2025-09-27T13:30:00.000",
    productCode: "FAB-VWX",
    quantity: 65,
    status: "incomplete",
    label: "WO2003 Incomplete (TUP-2)",
  },

  /* ---------- SO-9010: Multi-step single WO7001 across machines ---------- */
  // Same work order id WO7001 on multiple machines sequentially
  {
    id: "FKK1-WO7001-A",
    machineId: "FKK-1",
    workOrderId: "WO7001",
    salesOrderId: "SO-9010",
    start: "2025-09-25T06:45:00.000",
    end: "2025-09-25T08:00:00.000",
    productCode: "FAB-DEF",
    quantity: 60,
    status: "actual",
    label: "WO7001 (FKK-1)",
  },
  {
    id: "YIK2-WO7001-A",
    machineId: "YIK-2",
    workOrderId: "WO7001",
    salesOrderId: "SO-9010",
    start: "2025-09-25T08:15:00.000", // +15m handoff
    end: "2025-09-25T09:30:00.000",
    productCode: "FAB-DEF",
    quantity: 60,
    status: "actual",
    label: "WO7001 (YIK-2)",
  },
  {
    id: "RAM2-WO7001-NA",
    machineId: "RAM-2",
    workOrderId: "WO7001",
    salesOrderId: "SO-9010",
    start: "2025-09-25T10:00:00.000",
    end: "2025-09-25T11:00:00.000",
    productCode: "FAB-DEF",
    quantity: 60,
    status: "not_accepted",
    label: "WO7001 N/A (RAM-2)",
  },

  /* ---------- A few independent items with shared SO/WO mixes ---------- */
  // Two different WOs under SO-9050 on different days
  {
    id: "BAL1-WO8100-A",
    machineId: "BAL-1",
    workOrderId: "WO8100",
    salesOrderId: "SO-9050",
    start: "2025-09-26T16:00:00.000",
    end: "2025-09-26T18:00:00.000",
    productCode: "FAB-BCD",
    quantity: 85,
    status: "incomplete",
    label: "WO8100 (BAL-1)",
  },
  {
    id: "HKK1-WO8200-P",
    machineId: "HKK-1",
    workOrderId: "WO8200",
    salesOrderId: "SO-9050",
    start: "2025-09-27T08:00:00.000",
    end: "2025-09-27T10:00:00.000",
    productCode: "FAB-BCD",
    quantity: 85,
    status: "planned",
    label: "WO8200 Plan (HKK-1)",
  },

  // Same WO across 2 machines but different SO (edge case to test)
  {
    id: "RAM1-WO9999-A",
    machineId: "RAM-1",
    workOrderId: "WO9999",
    salesOrderId: "SO-9990",
    start: "2025-09-26T08:00:00.000",
    end: "2025-09-26T09:00:00.000",
    productCode: "FAB-MISC",
    quantity: 40,
    status: "actual",
    label: "WO9999 (RAM-1)",
  },
  {
    id: "BAL2-WO9999-P",
    machineId: "BAL-2",
    workOrderId: "WO9999",
    salesOrderId: "SO-9991", // different SO
    start: "2025-09-26T11:00:00.000",
    end: "2025-09-26T14:30:00.000",
    productCode: "FAB-MISC",
    quantity: 40,
    status: "not_accepted",
    label: "WO9999 Plan (BAL-2)",
  },
];
