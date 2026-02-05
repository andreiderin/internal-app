import type { MachineRow } from "@/components/ProductionTimeline/types";

// Your current Group type likely has { id, content } shape.
export function groupsToMachines(
  groups: Array<{ id: string | number; content?: string }>
): MachineRow[] {
  return groups.map((g) => ({
    id: String(g.id),
    name: g.content ?? String(g.id),
  }));
}
