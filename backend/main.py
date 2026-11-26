"""Small local attendance API for the PresenDex prototype."""

from contextlib import asynccontextmanager
import csv
from datetime import date, datetime, timezone
from io import StringIO
import os
from pathlib import Path
import sqlite3

from fastapi import FastAPI, Query
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.responses import JSONResponse


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DB_PATH = Path(os.environ.get("PRESENDEX_DB", PROJECT_ROOT / "presendex.db"))


def connect_db() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def initialize_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with connect_db() as db:
        db.execute(
            """
            CREATE TABLE IF NOT EXISTS attendance (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                learner_id TEXT NOT NULL,
                attendance_date TEXT NOT NULL,
                checked_in_at TEXT NOT NULL,
                UNIQUE (learner_id, attendance_date)
            )
            """
        )


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize_db()
    yield


app = FastAPI(
    title="PresenDex API",
    description="Local prototype API for recording attendance by learner ID.",
    version="0.1.0",
    lifespan=lifespan,
)
app.mount("/assets", StaticFiles(directory=PROJECT_ROOT / "web" / "assets"), name="assets")


class CheckInRequest(BaseModel):
    learner_id: str = Field(min_length=1, max_length=40, pattern=r"^[A-Za-z0-9_-]+$")
    attendance_date: date | None = None


class CheckInResponse(BaseModel):
    learner_id: str
    attendance_date: date
    checked_in_at: datetime
    status: str


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "PresenDex API"}


@app.get("/", include_in_schema=False)
def home() -> FileResponse:
    return FileResponse(PROJECT_ROOT / "web" / "index.html")


@app.get("/logo.png", include_in_schema=False)
def logo() -> FileResponse:
    return FileResponse(PROJECT_ROOT / "logo.png", media_type="image/png")


@app.post("/attendance/check-in", response_model=CheckInResponse)
def check_in(payload: CheckInRequest) -> CheckInResponse:
    day = payload.attendance_date or date.today()
    timestamp = datetime.now(timezone.utc).isoformat()
    with connect_db() as db:
        try:
            db.execute(
                "INSERT INTO attendance (learner_id, attendance_date, checked_in_at) VALUES (?, ?, ?)",
                (payload.learner_id, day.isoformat(), timestamp),
            )
            status = "checked_in"
        except sqlite3.IntegrityError:
            status = "already_checked_in"
        row = db.execute(
            "SELECT learner_id, attendance_date, checked_in_at FROM attendance WHERE learner_id = ? AND attendance_date = ?",
            (payload.learner_id, day.isoformat()),
        ).fetchone()
    return CheckInResponse(
        learner_id=row["learner_id"],
        attendance_date=date.fromisoformat(row["attendance_date"]),
        checked_in_at=datetime.fromisoformat(row["checked_in_at"]),
        status=status,
    )


@app.get("/attendance", response_model=list[CheckInResponse])
def list_attendance(attendance_date: date | None = Query(default=None)) -> list[CheckInResponse]:
    day = attendance_date or date.today()
    with connect_db() as db:
        rows = db.execute(
            "SELECT learner_id, attendance_date, checked_in_at FROM attendance WHERE attendance_date = ? ORDER BY checked_in_at",
            (day.isoformat(),),
        ).fetchall()
    return [
        CheckInResponse(
            learner_id=row["learner_id"],
            attendance_date=date.fromisoformat(row["attendance_date"]),
            checked_in_at=datetime.fromisoformat(row["checked_in_at"]),
            status="checked_in",
        )
        for row in rows
    ]


@app.get("/attendance/export.csv", include_in_schema=True)
def export_attendance(attendance_date: date | None = Query(default=None)) -> Response:
    day = attendance_date or date.today()
    with connect_db() as db:
        rows = db.execute(
            "SELECT learner_id, attendance_date, checked_in_at FROM attendance WHERE attendance_date = ? ORDER BY checked_in_at",
            (day.isoformat(),),
        ).fetchall()

    output = StringIO(newline="")
    writer = csv.writer(output)
    writer.writerow(["learner_id", "attendance_date", "checked_in_at_utc"])
    writer.writerows((row["learner_id"], row["attendance_date"], row["checked_in_at"]) for row in rows)
    filename = f"presendex-attendance-{day.isoformat()}.csv"
    return Response(
        content=output.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.delete("/attendance", status_code=204)
def clear_attendance(attendance_date: date = Query(..., description="Date to clear, in YYYY-MM-DD format")) -> None:
    """Clear one date's prototype records; useful for resetting demo data."""
    with connect_db() as db:
        db.execute("DELETE FROM attendance WHERE attendance_date = ?", (attendance_date.isoformat(),))


@app.exception_handler(sqlite3.Error)
async def database_error_handler(_, __: sqlite3.Error):
    return JSONResponse(
        status_code=500,
        content={"detail": "The attendance database could not complete the request"},
    )
