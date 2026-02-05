export type MachineRow = {
  id: string;
  name: string;
  meta?: Record<string, unknown>;
};

export type ProcessItem = {
  id: string;
  machineId: string;
  workOrderId: string; // from backend "task"
  salesOrderId?: string;
  start: string | null; // ISO or null
  end: string | null; // ISO or null
  productCode?: string | null;
  quantity?: number | null;
  status?:
    | "planned"
    | "actual"
    | "incomplete"
    | "not_accepted"
    | "current"
    | "frozen";
  arrow?: "up" | "down";
  label?: string;
  color?: string;
  meta?: Record<string, unknown>;

  salesOrderDeliveryDate?: string | null; // ISO delivery date from SalesOrder
  salesOrderWorkOrderCount?: number | null; // total WOs in SalesOrder
  workOrderIndexInSO?: number | null; // 1-based order of this WO within SalesOrder
  customerName?: string;
};

export type ProductionTimelineProps = {
  machines: MachineRow[];
  items: ProcessItem[]; // not used in MP1 (placeholder rows only)
  initialView?: "day" | "3day" | "week" | "month";
  visibleStart?: string;
  visibleEnd?: string;
  highlightMode?: "none" | "workOrder" | "salesOrder";
  onSelectItem?: (id: string | null) => void;
  className?: string;
  visibleStatuses?: {
    planned: boolean;
    actual: boolean;
    frozen?: boolean; // later
  };
};
