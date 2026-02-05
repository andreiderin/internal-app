from __future__ import annotations

from typing import Any, Dict, Set, List, Optional

import logging
import os
from datetime import datetime, timezone, timedelta

from sqlalchemy.orm import Session
from sqlalchemy import text, bindparam

from app.api.data.queries import (
    _pad_boms_and_inject_fake_defaults_sparse,
    LIMIT_WORK_ORDER_NUMBERS,
    FAKE_WORKSTATION_CODE,
    FAKE_CYCLE_TIME_MODEL,
    FAKE_MINIBATCH_QTY,
)

TIME_UNIT_SECONDS = 60.0

logger = logging.getLogger(__name__)

LIMIT_WORK_ORDERS = os.getenv("LIMIT_WORK_ORDERS", "0") == "1"


def _isoformat(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    return value


def _build_employee_shift(present_time: datetime) -> Dict[str, Any]:
    day_end = present_time.replace(hour=19, minute=30, second=0, microsecond=0)
    night_end = present_time.replace(hour=7, minute=30, second=0, microsecond=0)

    if present_time <= night_end:
        first_shift_end = night_end
    elif present_time <= day_end:
        first_shift_end = day_end
    else:
        first_shift_end = night_end + timedelta(days=1)

    return {
        "first_shift_end": _isoformat(first_shift_end),
        "day_shift_end": "19:30",
        "night_shift_end": "07:30",
        "frequency": 720,
    }


# ---------------------------------------------------------------------------
# Top-level: CPLEX planner input
# ---------------------------------------------------------------------------

def get_planner_input_cplex(
    session: Session,
    tenant_id: str,
    trigger: str | None = None,
    present_time: datetime | None = None,
) -> Dict[str, Any]:
    """
    CPLEX planner input (datetime-based).
    """
    now = present_time or datetime.now(timezone.utc)

    scope = load_plan_scope(session, tenant_id)
    product_ids: Set[int] = scope["product_ids"]

    cycle = load_cycle_structure(session, tenant_id, product_ids)
    minibatch = load_minibatch_structure(session, tenant_id, product_ids)
    bom_data = load_bom_structure(session, tenant_id, product_ids)
    _pad_boms_and_inject_fake_defaults_sparse(
        cycle=cycle,
        minibatch=minibatch,
        bom_data=bom_data,
        fake_ws=FAKE_WORKSTATION_CODE,
        fake_cycle_model=FAKE_CYCLE_TIME_MODEL,
        fake_minibatch=FAKE_MINIBATCH_QTY,
    )

    orders = load_orders(session, tenant_id, scope, now)
    machine_downtimes = load_downtimes(session, tenant_id, now, orders, cycle)
    current_schedule = load_current_schedule(session, tenant_id)

    data: Dict[str, Any] = {
        "cycle": cycle,
        "minibatch": minibatch,
        "bom_data": bom_data,
        "orders": orders,
        "machine_downtimes": machine_downtimes,
        "current_schedule": current_schedule,
        "cannot_produce": {},
        "factory_closure": [],
        "break_times": [],
        "storage_mapping": {
            "HKK 1":  "yuv_araba",
            "HKK 2":  "yuv_araba",
            "BKK 1":   "yuv_araba",
            "BAL 1":  "yuv_araba",
            "KUR 1": "dik_araba",
            "KUR 2": "dik_araba",
            "RKK 1":   "dok",
            "TUP 1":  "dok",
            "SAR 1": "dok",
            "SAR 2": "dok",
            "SAR 3": "dok",
            "SAR 4": "dok",
            'RAM 1': "dok",
            "RAM 2": "dok",
            "YIK 1": "dok",
            "DOK 1": "dok"
        },
        "storage": {},
        "max_wait_times":  {
            "yuv_araba": 60,
            "dik_araba": 60,
            "dok": 180
        },
        "employee_shift": _build_employee_shift(now),
        "obj_func_ranking": {
            "makespan": 1,
            "shift_change": 2,
            "total_shifts": 3,
            "night_shifts": 4,
            "saturday_shifts": 5
        },
        "no_break_machines": [],
        "need_at_least_30_min": [],
    }

    return {
        "data": data,
        "new_plan_start_time": _isoformat(now),
        "present_time": _isoformat(now),
        "trigger": trigger or "FULL_REPLAN",
    }


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

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
    product_ids: Set[int],
) -> Dict[int, Dict[str, Dict[str, float]]]:
    """
    Build the nested cycle structure for products in product_ids.

    Returned values are time/unit in model units,
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
        process_idx = int(row["sequence_index"]) - 1  # 0-based
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
          [ws_code_step1, ws_code_step2, ...],
          [ws_code_step1, ws_code_step2, ...],
          ...
      ]
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

    by_product_and_route: Dict[str, Dict[int, List[str]]] = {}

    for row in rows:
        product_code = row["product_code"]
        route_id = int(row["route_id"])
        ws_code = row["workstation_code"]

        prod_routes = by_product_and_route.setdefault(product_code, {})
        path = prod_routes.setdefault(route_id, [])
        path.append(ws_code)

    bom_data: Dict[str, List[List[str]]] = {}
    for product_code, routes_dict in by_product_and_route.items():
        bom_data[product_code] = list(routes_dict.values())

    return bom_data


def load_orders(
    session: Session,
    tenant_id: str,
    scope: Dict[str, object],
    present_time: datetime,
) -> Dict[str, Dict[str, Any]]:
    """
    Build the 'orders' structure the planner expects.
    """
    work_order_ids: List[int] = list(scope.get("work_order_ids") or [])
    product_ids: Set[int] = scope.get("product_ids") or set()

    if not work_order_ids:
        return {}

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

    latest_event_time_by_wo_id: Dict[int, datetime] = {}
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
        latest_event_time_by_wo_id[int(wo_id)] = dt

    by_id: Dict[int, Dict[str, Any]] = {}
    wo_numbers: List[str] = []

    for row in wo_rows:
        d = dict(row)
        by_id[d["id"]] = d
        if d.get("work_order_number"):
            wo_numbers.append(d["work_order_number"])

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

    last_complete_qty_by_wo: Dict[str, float] = {}

    if wo_numbers:
        complete_rows = (
            session.execute(
                text(
                    """
                    SELECT DISTINCT ON (wo.work_order_number)
                        wo.work_order_number,
                        be.produced_qty
                    FROM barcode_events be
                    JOIN work_orders wo
                      ON wo.id = be.work_order_id
                    WHERE be.tenant_id = :tenant_id
                      AND wo.work_order_number = ANY(:wo_numbers)
                      AND UPPER(be.event_type) = 'COMPLETE'
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

        for row in complete_rows:
            wo_num = row["work_order_number"]
            qty = row.get("produced_qty")
            if qty is not None:
                last_complete_qty_by_wo[wo_num] = float(qty)

    orders: Dict[str, Dict[str, Any]] = {}

    for wo_id in work_order_ids:
        base = by_id.get(wo_id)
        if not base:
            continue

        wo_num = base["work_order_number"]
        product_code = base["product_code"]
        qty_planned = float(base["qty_planned"]) if base["qty_planned"] is not None else 0.0
        status = (base.get("status") or "").upper()

        so_number = base.get("so_number")
        product_id = base.get("product_id")

        min_prod_dt = base.get("min_prod_time")
        promised_dt = base.get("promised_delivery_utc")

        min_prod_time = min_prod_dt if isinstance(min_prod_dt, datetime) else None

        if status == "IN_PROGRESS":
            latest_dt = latest_event_time_by_wo_id.get(int(wo_id))
            if latest_dt is not None:
                min_prod_time = latest_dt

        if min_prod_time is None:
            min_prod_time = present_time
        elif min_prod_time < present_time and status != "IN_PROGRESS":
            min_prod_time = present_time

        if isinstance(promised_dt, datetime):
            delivery_dt = promised_dt
        else:
            delivery_dt = datetime(9999, 1, 1, tzinfo=timezone.utc)

        last_process = None
        if product_id in last_process_by_product:
            last_process = last_process_by_product[product_id]

        past_machines = past_machines_by_wo.get(wo_num, [])

        progress = status or "NOT_STARTED"
        if progress == "IN_PROGRESS" and not past_machines:
            progress = "NOT_STARTED"

        last_event_type = last_event_by_wo.get(wo_num)
        currently_running = (progress == "IN_PROGRESS") and (last_event_type == "START")

        qty = qty_planned
        if progress == "IN_PROGRESS":
            qty = last_complete_qty_by_wo.get(wo_num, qty_planned)

        orders[wo_num] = {
            "Sales Order": so_number,
            "Product": product_code,
            "Quantity": qty,
            "Minimum Production Time": _isoformat(min_prod_time),
            "Delivery Date": _isoformat(delivery_dt),
            "Last Process": last_process,
            "Status": progress,
            "Past Machines": past_machines,
            "Currently Running": currently_running,
        }

    logger.info("[MIDDLEWARE] CPLEX order data: %s", orders)
    return orders


def load_downtimes(
    session: Session,
    tenant_id: str,
    present_time: datetime,
    orders: Dict[str, Dict[str, Any]],
    cycle: Dict[int, Dict[str, Dict[str, float]]],
) -> Dict[str, List[List[Any]]]:
    """
    machine_downtimes[workstation_code] = [[start_dt, end_dt], ...]
    """
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

    downtimes: Dict[str, List[List[Any]]] = {}

    for row in rows:
        ws_code = row["workstation_code"]
        start_dt = row["downtime_start"]
        end_dt = row["downtime_end"]

        if not start_dt or not end_dt:
            continue
        if end_dt < present_time:
            continue
        if start_dt < present_time:
            continue

        downtimes.setdefault(ws_code, []).append([_isoformat(start_dt), _isoformat(end_dt)])

    _append_running_job_downtimes(
        session=session,
        tenant_id=tenant_id,
        present_time=present_time,
        orders=orders,
        cycle=cycle,
        downtimes=downtimes,
    )

    return downtimes


def load_current_schedule(
    session: Session,
    tenant_id: str,
) -> Dict[str, List[List[Any]]]:
    """
    current_schedule[work_order_number] = [
        [process_idx, workstation_code, start_time_utc, end_time_utc],
        ...
    ]
    """
    latest_sched = (
        session.execute(
            text(
                """
                SELECT id
                FROM schedules
                WHERE tenant_id = :tenant_id
                ORDER BY created_at DESC
                LIMIT 1
                """
            ),
            {"tenant_id": tenant_id},
        )
        .mappings()
        .first()
    )

    if latest_sched is None:
        return {}

    schedule_id = latest_sched["id"]

    rows = (
        session.execute(
            text(
                """
                SELECT
                    wo.work_order_number,
                    ws.workstation_code,
                    jc.step_index,
                    jc.start_time_utc,
                    jc.end_time_utc
                FROM job_cards jc
                JOIN work_orders wo
                  ON wo.id = jc.work_order_id
                JOIN workstations ws
                  ON ws.id = jc.workstation_id
                WHERE jc.tenant_id = :tenant_id
                  AND jc.schedule_id = :schedule_id
                ORDER BY wo.work_order_number, jc.start_time_utc, jc.id
                """
            ),
            {
                "tenant_id": tenant_id,
                "schedule_id": schedule_id,
            },
        )
        .mappings()
        .all()
    )

    current_schedule: Dict[str, List[List[Any]]] = {}

    for row in rows:
        wo_num = row["work_order_number"]
        ws_code = row["workstation_code"]
        start_dt = row["start_time_utc"]
        end_dt = row["end_time_utc"]

        process_idx = int(row["step_index"]) if row.get("step_index") is not None else 0
        current_schedule.setdefault(wo_num, []).append(
            [
                process_idx,
                ws_code,
                _isoformat(start_dt),
                _isoformat(end_dt),
            ]
        )

    return current_schedule


def _append_running_job_downtimes(
    *,
    session: Session,
    tenant_id: str,
    present_time: datetime,
    orders: Dict[str, Dict[str, Any]],
    cycle: Dict[int, Dict[str, Dict[str, float]]],
    downtimes: Dict[str, List[List[Any]]],
) -> None:
    if not orders:
        return

    wo_numbers = list(orders.keys())

    rows = (
        session.execute(
            text(
                """
                SELECT DISTINCT ON (wo.work_order_number)
                    wo.work_order_number,
                    be.event_type,
                    be.event_time_utc,
                    be.route_step_index,
                    ws.workstation_code
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

    for row in rows:
        wo_num = row["work_order_number"]
        event_type = (row.get("event_type") or "").upper()
        start_dt = row.get("event_time_utc")
        route_step_index = row.get("route_step_index")
        ws_code = row.get("workstation_code")

        if event_type != "START" or not ws_code or not isinstance(start_dt, datetime):
            continue

        order = orders.get(wo_num, {})
        product_code = order.get("Product")
        qty = order.get("Quantity")

        if product_code is None or qty is None:
            continue

        proc_idx = int(route_step_index) - 1 if route_step_index is not None else None
        if proc_idx is None:
            continue

        cycle_time = (
            cycle.get(proc_idx, {})
            .get(product_code, {})
            .get(ws_code)
        )
        if cycle_time is None:
            continue

        try:
            expected_minutes = float(qty) * float(cycle_time)
        except Exception:
            continue

        running_minutes = max(0.0, (present_time - start_dt).total_seconds() / 60.0)
        time_left_minutes = expected_minutes - running_minutes
        if time_left_minutes <= 0:
            continue

        end_dt = present_time + timedelta(minutes=time_left_minutes)
        downtimes.setdefault(ws_code, []).append([_isoformat(present_time), _isoformat(end_dt)])
