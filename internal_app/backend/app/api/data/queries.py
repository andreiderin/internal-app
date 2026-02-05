from __future__ import annotations

from typing import Any, Dict, Set, List, Optional

import logging
import os
from datetime import datetime, timezone

from sqlalchemy.orm import Session
from sqlalchemy import text, bindparam

TIME_UNIT_SECONDS = 60.0

logger = logging.getLogger(__name__)

LIMIT_WORK_ORDERS = os.getenv("LIMIT_WORK_ORDERS", "0") == "1"


# --- FAKE workstation padding config ---------------------------------------
# Used to pad shorter BOM routes so that every route for a given product has
# the same number of steps.
FAKE_WORKSTATION_CODE = os.getenv("PLANNER_FAKE_WORKSTATION_CODE", "FAKE")
FAKE_CYCLE_TIME_MODEL = float(os.getenv("PLANNER_FAKE_CYCLE_TIME_MODEL", "0.01"))
FAKE_MINIBATCH_QTY = float(os.getenv("PLANNER_FAKE_MINIBATCH_QTY", "100"))

# You can edit this list anytime.
LIMIT_WORK_ORDER_NUMBERS = [
    "MFG-WO-2025-02832",
    "MFG-WO-2025-02870",
    "MFG-WO-2025-02869",
    "MFG-WO-2025-02853",
    "MFG-WO-2025-02811",
    "MFG-WO-2025-02755",
    "MFG-WO-2025-02756",
    "MFG-WO-2025-02805",
    "MFG-WO-2025-02828",
    "MFG-WO-2025-02877",
    "MFG-WO-2025-02881",
    "MFG-WO-2025-02890",
    "MFG-WO-2025-02843",
    "MFG-WO-2025-01028",
    "MFG-WO-2025-02823",
    "MFG-WO-2025-02764",
    "MFG-WO-2025-02821",
    "MFG-WO-2025-02820",
    "MFG-WO-2025-02802",
    "MFG-WO-2025-02829",
    "MFG-WO-2025-02857",
    "MFG-WO-2025-02878",
    "MFG-WO-2025-02882",
    "MFG-WO-2025-02891",
    "MFG-WO-2025-02889",
    "MFG-WO-2025-02806",
    "MFG-WO-2025-02808",
    "MFG-WO-2025-02607",
    "MFG-WO-2025-02884",
    "MFG-WO-2025-02824",
    "MFG-WO-2025-02871",
    "MFG-WO-2025-02888",
    "MFG-WO-2025-02872",
    "MFG-WO-2025-02873",
    "MFG-WO-2025-02611",
    "MFG-WO-2025-02809",
    "MFG-WO-2025-02886",
    "MFG-WO-2025-02810",
    "MFG-WO-2025-02879",
]

def get_planner_input(session: Session, tenant_id: str) -> Dict[str, Any]:
    scope = load_plan_scope(session, tenant_id)
    product_ids = scope["product_ids"]

    cycle = load_cycle_structure(session, tenant_id, product_ids)
    minibatch = load_minibatch_structure(session, tenant_id, product_ids)
    bom_data = load_bom_structure(session, tenant_id, product_ids)

    # Ensure each product's BOM routes are same length by padding with FAKE.
    # IMPORTANT: Only inject FAKE into cycle/minibatch for the *specific process indices*
    # that were actually padded (end of shorter routes).
    _pad_boms_and_inject_fake_defaults_sparse(
        cycle=cycle,
        minibatch=minibatch,
        bom_data=bom_data,
        fake_ws=FAKE_WORKSTATION_CODE,
        fake_cycle_model=FAKE_CYCLE_TIME_MODEL,
        fake_minibatch=FAKE_MINIBATCH_QTY,
    )

    orders = load_orders(session, tenant_id, scope)
    machine_downtimes = load_downtimes(session, tenant_id)

    return {
        "cycle": cycle,
        "minibatch": minibatch,
        "bom_data": bom_data,
        "orders": orders,
        "machine_downtimes": machine_downtimes,
        "max_proc_time": 75000,
    }


def _pad_boms_and_inject_fake_defaults_sparse(
    *,
    cycle: Dict[int, Dict[str, Dict[str, float]]],
    minibatch: Dict[str, Dict[str, float]],
    bom_data: Dict[str, List[List[str]]],
    fake_ws: str,
    fake_cycle_model: float,
    fake_minibatch: float,
) -> None:
    """Mutates bom_data/cycle/minibatch in-place.

    For each product:
      1) Compute max route length across that product's routes.
      2) Pad ONLY routes shorter than max_len by appending fake_ws at the end.
      3) Inject defaults into:
         - cycle ONLY for process indices that are actually padded (tail indices)
         - minibatch ONLY if padding occurred for that product

    This avoids polluting cycle[0][product][FAKE] when FAKE never appears at process 0.
    """

    if not bom_data:
        return

    padded_products = 0
    padded_routes = 0

    for product_code, routes in bom_data.items():
        if not routes:
            continue

        # Keep only well-formed list routes
        list_routes: List[List[str]] = [r for r in routes if isinstance(r, list)]
        if not list_routes:
            continue

        # Original lengths
        lengths = [len(r) for r in list_routes]
        max_len = max(lengths, default=0)
        if max_len <= 0:
            continue

        # Track which process indices (0-based) we actually pad for this product
        padded_process_indices: Set[int] = set()
        any_padding_for_product = False

        # Pad routes as needed
        for i, route in enumerate(routes):
            if not isinstance(route, list):
                continue

            orig_len = len(route)
            if orig_len >= max_len:
                continue

            any_padding_for_product = True
            pad_n = max_len - orig_len
            padded_routes += 1

            # The padded indices are [orig_len, ..., max_len-1] (0-based)
            for pidx in range(orig_len, max_len):
                padded_process_indices.add(pidx)

            routes[i] = route + [fake_ws] * pad_n

        if not any_padding_for_product:
            continue

        padded_products += 1

        # Inject minibatch default ONLY if padding occurred for this product
        minibatch.setdefault(product_code, {})
        minibatch[product_code].setdefault(fake_ws, float(fake_minibatch))

        # Inject cycle defaults ONLY for padded process indices
        for process_idx in sorted(padded_process_indices):
            cycle.setdefault(process_idx, {})
            cycle[process_idx].setdefault(product_code, {})
            cycle[process_idx][product_code].setdefault(fake_ws, float(fake_cycle_model))

    if padded_routes:
        logger.info(
            "[MIDDLEWARE] Padded BOMs with %s: products=%d, routes_padded=%d",
            fake_ws,
            padded_products,
            padded_routes,
        )


def load_plan_scope(
    session: Session,
    tenant_id: str,
) -> Dict[str, object]:
    """
    Decide which work orders are in this planning run.

    Default:
      - tenant filter
      - status filter
      - ONLY products with product_group = 'Mamul'
      - ONLY work orders that are linked to a sales order (sales_order_id IS NOT NULL)

    Optional:
      - if LIMIT_WORK_ORDERS=1, restrict to LIMIT_WORK_ORDER_NUMBERS
    """

    base_sql = """
        SELECT
            wo.id AS work_order_id,
            wo.product_id,
            p.product_code
        FROM work_orders wo
        JOIN products p
          ON p.id = wo.product_id
        WHERE wo.tenant_id = :tenant_id
          AND wo.status IN ('NOT_STARTED', 'IN_PROGRESS')
          AND p.product_group = 'Mamul'
          AND wo.sales_order_id IS NOT NULL
    """

    params: Dict[str, Any] = {"tenant_id": tenant_id}

    if LIMIT_WORK_ORDERS:
        if not LIMIT_WORK_ORDER_NUMBERS:
            # Enabled but empty list -> scope should be empty (avoid planning “everything”)
            return {
                "work_order_ids": [],
                "product_ids": set(),
                "product_codes": set(),
            }

        base_sql += " AND wo.work_order_number IN :wo_numbers"
        params["wo_numbers"] = LIMIT_WORK_ORDER_NUMBERS

        stmt = text(base_sql + " ORDER BY wo.planned_start_at").bindparams(
            bindparam("wo_numbers", expanding=True)
        )
    else:
        stmt = text(base_sql + " ORDER BY wo.planned_start_at")

    rows = session.execute(stmt, params).mappings().all()

    work_order_ids: List[int] = []
    product_ids: Set[int] = set()
    product_codes: Set[str] = set()

    for row in rows:
        wo_id = row["work_order_id"]
        prod_id = row["product_id"]
        prod_code = row["product_code"]

        if wo_id is not None:
            work_order_ids.append(int(wo_id))
        if prod_id is not None:
            product_ids.add(int(prod_id))
        if prod_code:
            product_codes.add(prod_code)

    return {
        "work_order_ids": work_order_ids,
        "product_ids": product_ids,
        "product_codes": product_codes,
    }


def load_cycle_structure(
    session: Session,
    tenant_id: str,
    product_ids: set[int],
) -> Dict[int, Dict[str, Dict[str, float]]]:
    """
    Build the nested cycle structure, but **only** for products in product_ids.

    Returned values are in *model time units per unit*,
    where 1 model time unit = TIME_UNIT_SECONDS real seconds.
    """
    if not product_ids:
        return {}

    rows = (
        session.execute(
            text(
                """
                SELECT
                    rs.sequence_index,
                    p.product_code,
                    w.workstation_code,
                    rs.std_cycle_time_s_per_uom AS std_cycle
                FROM route_steps rs
                JOIN routes r
                    ON r.id = rs.route_id
                JOIN products p
                    ON p.id = r.product_id
                JOIN workstations w
                    ON w.id = rs.workstation_id
                WHERE r.tenant_id = :tenant_id
                  AND r.product_id = ANY(:product_ids)
                  AND rs.std_cycle_time_s_per_uom IS NOT NULL
                  AND p.product_code IS NOT NULL
                  AND w.workstation_code IS NOT NULL
                ORDER BY r.id, rs.sequence_index, p.product_code, w.workstation_code
                """
            ),
            {
                "tenant_id": tenant_id,
                "product_ids": list(product_ids),
            },
        )
        .mappings()
        .all()
    )

    cycle: Dict[int, Dict[str, Dict[str, float]]] = {}

    for row in rows:
        process_idx = int(row["sequence_index"]) - 1  # planner wants 0-based
        product_code = row["product_code"]
        workstation_code = row["workstation_code"]

        std_cycle_s = float(row["std_cycle"])
        std_cycle_model = std_cycle_s / TIME_UNIT_SECONDS

        cycle.setdefault(process_idx, {})
        cycle[process_idx].setdefault(product_code, {})
        cycle[process_idx][product_code][workstation_code] = std_cycle_model

    return cycle


def load_minibatch_structure(
    session: Session,
    tenant_id: str,
    product_ids: Set[int],
) -> Dict[str, Dict[str, float]]:
    """
    Build: minibatch[product_code][workstation_code] = min_batch_qty

    Rules:
      - Only include products in product_ids (plan scope)
      - Only include stations where min_batch_qty is not null and > 0
      - If min_batch_qty is 0 or NULL → skip it (planner spec)
    """

    if not product_ids:
        return {}

    rows = (
        session.execute(
            text(
                """
                SELECT
                    p.product_code,
                    w.workstation_code,
                    rs.min_batch_qty
                FROM route_steps rs
                JOIN routes r
                  ON r.id = rs.route_id
                JOIN products p
                  ON p.id = r.product_id
                JOIN workstations w
                  ON w.id = rs.workstation_id
                WHERE r.tenant_id = :tenant_id
                  AND r.product_id = ANY(:product_ids)
                  AND rs.min_batch_qty IS NOT NULL
                  AND rs.min_batch_qty > 0
                  AND p.product_code IS NOT NULL
                  AND w.workstation_code IS NOT NULL
                ORDER BY p.product_code, w.workstation_code
                """
            ),
            {
                "tenant_id": tenant_id,
                "product_ids": list(product_ids),
            },
        )
        .mappings()
        .all()
    )

    minibatch: Dict[str, Dict[str, float]] = {}

    for row in rows:
        prod = row["product_code"]
        ws = row["workstation_code"]
        qty = float(row["min_batch_qty"])

        minibatch.setdefault(prod, {})
        minibatch[prod][ws] = qty

    return minibatch


def load_bom_structure(
    session: Session,
    tenant_id: str,
    product_ids: Set[int],
) -> Dict[str, List[List[str]]]:
    """
    Build BOM structure:

      bom_data[product_code] = [
          [ws_code_step1, ws_code_step2, ...],    # route 1
          [ws_code_step1, ws_code_step2, ...],    # route 2
          ...
      ]

    - Only includes products in product_ids (plan scope)
    - Steps ordered by sequence_index
    - Skips routes/steps without a workstation_code
    """

    if not product_ids:
        return {}

    rows = (
        session.execute(
            text(
                """
                SELECT
                    r.id AS route_id,
                    p.product_code,
                    rs.sequence_index,
                    w.workstation_code
                FROM routes r
                JOIN products p
                  ON p.id = r.product_id
                JOIN route_steps rs
                  ON rs.route_id = r.id
                JOIN workstations w
                  ON w.id = rs.workstation_id
                WHERE r.tenant_id = :tenant_id
                  AND r.product_id = ANY(:product_ids)
                  AND p.product_code IS NOT NULL
                  AND w.workstation_code IS NOT NULL
                ORDER BY p.product_code, r.id, rs.sequence_index
                """
            ),
            {
                "tenant_id": tenant_id,
                "product_ids": list(product_ids),
            },
        )
        .mappings()
        .all()
    )

    # temp: product_code -> route_id -> [ws1, ws2, ...]
    by_product_and_route: Dict[str, Dict[int, List[str]]] = {}

    for row in rows:
        product_code = row["product_code"]
        route_id = int(row["route_id"])
        ws_code = row["workstation_code"]

        prod_routes = by_product_and_route.setdefault(product_code, {})
        path = prod_routes.setdefault(route_id, [])
        path.append(ws_code)

    # compress into final structure: product_code -> list of paths
    bom_data: Dict[str, List[List[str]]] = {}
    for product_code, routes_dict in by_product_and_route.items():
        bom_data[product_code] = list(routes_dict.values())

    return bom_data


def load_orders(
    session: Session,
    tenant_id: str,
    scope: Dict[str, object],
) -> Dict[str, Dict[str, Any]]:
    """
    Build the 'orders' structure the planner expects.
    """

    work_order_ids: List[int] = list(scope.get("work_order_ids") or [])
    product_ids: Set[int] = scope.get("product_ids") or set()

    if not work_order_ids:
        return {}

    # --- 1) Base work order info ---------------------------------------------
    wo_rows = (
        session.execute(
            text(
                """
                SELECT
                    wo.id,
                    wo.work_order_number,
                    wo.qty_planned,
                    wo.status,
                    so.so_number AS so_number,
                    wo.min_prod_time,
                    so.promised_delivery_utc,
                    p.id AS product_id,
                    p.product_code
                FROM work_orders wo
                JOIN products p
                  ON p.id = wo.product_id
                LEFT JOIN sales_orders so
                  ON so.id = wo.sales_order_id
                WHERE wo.tenant_id = :tenant_id
                  AND wo.id = ANY(:wo_ids)
                """
            ),
            {
                "tenant_id": tenant_id,
                "wo_ids": work_order_ids,
            },
        )
        .mappings()
        .all()
    )

    # --- 1b) Latest barcode event time per work order (for IN_PROGRESS min_prod_time) ---
    latest_barcode_time_by_wo_id: Dict[int, float] = {}

    last_bc_rows = (
        session.execute(
            text(
                """
                SELECT
                    be.work_order_id AS work_order_id,
                    MAX(be.event_time_utc) AS last_event_time
                FROM barcode_events be
                WHERE be.tenant_id = :tenant_id
                  AND be.work_order_id = ANY(:wo_ids)
                GROUP BY be.work_order_id
                """
            ),
            {
                "tenant_id": tenant_id,
                "wo_ids": work_order_ids,
            },
        )
        .mappings()
        .all()
    )

    for row in last_bc_rows:
        wo_id = row.get("work_order_id")
        dt = row.get("last_event_time")
        if wo_id is None or dt is None:
            continue
        latest_barcode_time_by_wo_id[int(wo_id)] = float(dt.timestamp())

    by_id: Dict[int, Dict[str, Any]] = {}
    wo_numbers: List[str] = []

    for row in wo_rows:
        d = dict(row)
        by_id[d["id"]] = d
        if d.get("work_order_number"):
            wo_numbers.append(d["work_order_number"])

    # --- 2) Route length per product (Last Process) --------------------------
    last_process_by_product: Dict[int, int] = {}

    if product_ids:
        route_rows = (
            session.execute(
                text(
                    """
                    SELECT
                        r.product_id,
                        MAX(rs.sequence_index) AS last_process
                    FROM routes r
                    JOIN route_steps rs
                      ON rs.route_id = r.id
                    WHERE r.tenant_id = :tenant_id
                      AND r.product_id = ANY(:product_ids)
                    GROUP BY r.product_id
                    """
                ),
                {
                    "tenant_id": tenant_id,
                    "product_ids": list(product_ids),
                },
            )
            .mappings()
            .all()
        )

        for row in route_rows:
            pid = row["product_id"]
            last_proc = row["last_process"]
            if pid is not None and last_proc is not None:
                last_process_by_product[int(pid)] = int(last_proc) - 1

    # --- 3) Past Machines based on LAST barcode (route_step_index + workstation) -
    past_machines_by_wo: Dict[str, List[str]] = {}

    if wo_numbers:
        bc_rows = (
            session.execute(
                text(
                    """
                    SELECT DISTINCT ON (wo.work_order_number)
                        wo.work_order_number,
                        ws.workstation_code,
                        be.route_step_index
                    FROM barcode_events be
                    JOIN work_orders wo
                      ON wo.id = be.work_order_id
                    LEFT JOIN workstations ws
                      ON ws.id = be.workstation_id
                    WHERE be.tenant_id = :tenant_id
                      AND wo.work_order_number = ANY(:wo_numbers)
                    ORDER BY wo.work_order_number, be.event_time_utc DESC
                    """
                ),
                {
                    "tenant_id": tenant_id,
                    "wo_numbers": wo_numbers,
                },
            )
            .mappings()
            .all()
        )

        for row in bc_rows:
            wo_num = row["work_order_number"]
            ws = row["workstation_code"]
            step = row["route_step_index"]

            if ws is None or step is None:
                past_machines_by_wo[wo_num] = []
                continue

            step_i = int(step)
            n_empty = max(0, step_i - 1)
            past_machines_by_wo[wo_num] = ["EMPTY"] * n_empty + [ws]

    # --- 4) Barcode latest event: Currently Running --------------------------
    last_event_by_wo: Dict[str, str] = {}

    if wo_numbers:
        last_rows = (
            session.execute(
                text(
                    """
                    SELECT DISTINCT ON (wo.work_order_number)
                        wo.work_order_number,
                        be.event_type
                    FROM barcode_events be
                    JOIN work_orders wo
                      ON wo.id = be.work_order_id
                    WHERE be.tenant_id = :tenant_id
                      AND wo.work_order_number = ANY(:wo_numbers)
                    ORDER BY wo.work_order_number, be.event_time_utc DESC
                    """
                ),
                {
                    "tenant_id": tenant_id,
                    "wo_numbers": wo_numbers,
                },
            )
            .mappings()
            .all()
        )

        for row in last_rows:
            wo_num = row["work_order_number"]
            last_event_by_wo[wo_num] = (row["event_type"] or "").upper()

    # --- 5) Assemble final orders dict ---------------------------------------
    orders: Dict[str, Dict[str, Any]] = {}

    for wo_id in work_order_ids:
        base = by_id.get(wo_id)
        if not base:
            continue

        wo_num = base["work_order_number"]
        product_code = base["product_code"]
        qty = float(base["qty_planned"]) if base["qty_planned"] is not None else 0.0

        so_number = base.get("so_number")
        product_id = base.get("product_id")

        wo_status = (base.get("status") or "").strip().upper()

        min_prod_dt = base.get("min_prod_time")
        promised_dt = base.get("promised_delivery_utc")

        # Default behavior: use work_orders.min_prod_time
        print("[DEBUG] min_prod_dt", min_prod_dt)
        min_prod_time = float(min_prod_dt.timestamp()) if min_prod_dt is not None else 0.0

        # TWEAK: if the WO is already in progress, anchor min_prod_time to the latest barcode timestamp
        if wo_status == "IN_PROGRESS":
            bc_ts = latest_barcode_time_by_wo_id.get(int(wo_id))
            print("[DEBUG] bc_ts:", bc_ts)
            if bc_ts is not None:
                min_prod_time = float(bc_ts)

        delivery_ts = float(promised_dt.timestamp()) if promised_dt is not None else 10**12

        last_process = last_process_by_product.get(product_id)

        past_machines = past_machines_by_wo.get(wo_num, [])

        # Use the DB status as the truth, except if no past machines are found for IN_PROGRESS.
        progress = wo_status
        if progress == "IN_PROGRESS" and not past_machines:
            progress = "NOT_STARTED"

        # Optional: only call it "currently running" if status is IN_PROGRESS AND last event was START
        currently_running = (progress == "IN_PROGRESS") and (last_event_by_wo.get(wo_num) == "START")

        orders[wo_num] = {
            "Sales Order": so_number,
            "Product": product_code,
            "Quantity": qty,
            "Minimum Production Time": min_prod_time,
            "Delivery Date": delivery_ts,
            "Last Process": last_process,
            "Status": progress,
            "Past Machines": past_machines,
            "Currently Running": currently_running,
        }

    logger.info("[MIDDLEWARE] order data: %s", orders)
    return orders


def load_downtimes(
    session: Session,
    tenant_id: str,
) -> Dict[str, List[List[float]]]:
    """
    machine_downtimes[workstation_code] = [[start_ts, end_ts], ...]

    Rules:
    - Skip if start OR end missing
    - Skip if end < now      (fully in the past)
    - Skip if start < now    (ongoing intervals ignored)
    """

    now = datetime.now(timezone.utc)

    rows = (
        session.execute(
            text(
                """
                SELECT
                    w.workstation_code,
                    d.downtime_start,
                    d.downtime_end
                FROM workstation_downtimes d
                JOIN workstations w
                  ON w.id = d.workstation_id
                WHERE d.tenant_id = :tenant_id
                ORDER BY w.workstation_code, d.downtime_start
                """
            ),
            {"tenant_id": tenant_id},
        )
        .mappings()
        .all()
    )

    downtimes: Dict[str, List[List[float]]] = {}

    for row in rows:
        ws_code = row["workstation_code"]
        start_dt = row["downtime_start"]
        end_dt = row["downtime_end"]

        if not start_dt or not end_dt:
            continue
        if end_dt < now:
            continue


        downtimes.setdefault(ws_code, []).append([float(start_dt.timestamp()), float(end_dt.timestamp())])

    return downtimes
