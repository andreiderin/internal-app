from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict

from fastapi import Body, FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.data.queries_cplex import get_planner_input_cplex

APP_NAME = "Navi Internal Planner"
REMOTE_DB_URL = os.getenv(
    "REMOTE_NAVI_DB_URL",
    "postgresql+psycopg://navi_user:navi_password@172.16.199.4:5440/navi_db",
)
DEFAULT_TENANT_ID = os.getenv("INTERNAL_TENANT_ID", "demo-tenant")
STORAGE_DIR = Path(
    os.getenv("INTERNAL_STORAGE_DIR", Path(__file__).parent / "storage")
).resolve()
SCHEDULE_FILE = STORAGE_DIR / "latest_schedule.json"

app = FastAPI(title=APP_NAME, version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

engine = create_engine(REMOTE_DB_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


def _validate_schedule(payload: Dict[str, Any]) -> None:
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Schedule payload must be JSON object")
    if "machines" not in payload or "items" not in payload:
        raise HTTPException(
            status_code=400,
            detail="Schedule payload must include 'machines' and 'items'",
        )


@app.get("/planner-input")
async def get_planner_input(
    tenant_id: str | None = None,
    x_tenant_id: str | None = Header(default=None, alias="X-Tenant-ID"),
) -> Dict[str, Any]:
    tenant = tenant_id or x_tenant_id or DEFAULT_TENANT_ID

    with SessionLocal() as db:
        return get_planner_input_cplex(db, tenant)


@app.post("/schedule")
def store_schedule(payload: Dict[str, Any] = Body(...)) -> Dict[str, str]:
    _validate_schedule(payload)
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    SCHEDULE_FILE.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return {"status": "ok"}


@app.post("/schedule-upload")
async def upload_schedule(file: UploadFile = File(...)) -> Dict[str, str]:
    raw = await file.read()
    try:
        payload = json.loads(raw.decode("utf-8"))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Invalid JSON: {exc}") from exc

    _validate_schedule(payload)
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    SCHEDULE_FILE.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return {"status": "ok"}


@app.get("/schedule")
def load_schedule() -> Dict[str, Any]:
    if not SCHEDULE_FILE.exists():
        raise HTTPException(status_code=404, detail="No schedule uploaded yet")
    return json.loads(SCHEDULE_FILE.read_text(encoding="utf-8"))
