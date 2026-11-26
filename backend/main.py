"""Web pages and role-protected API routes for the PresenDex prototype."""

import csv
from datetime import date, datetime, timezone
from io import StringIO
import os
import re
import secrets
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from starlette.middleware.sessions import SessionMiddleware

from .database import Base, engine, get_db
from .models import Account, AttendanceRecord, SchoolClass, Student
from .schemas import (
    AdminSetupRequest,
    AttendanceUpdateRequest,
    ClassCreateRequest,
    ClassUpdateRequest,
    LoginRequest,
    PasswordChangeRequest,
    StudentCreateRequest,
    StudentUpdateRequest,
    TeacherCreateRequest,
)
from .security import (
    DUMMY_PASSWORD_HASH,
    get_active_account,
    get_current_account,
    hash_password,
    require_admin,
    verify_password,
)


PROJECT_ROOT = Path(__file__).resolve().parent.parent
WEB_ROOT = PROJECT_ROOT / "web"
APP_ENV = os.environ.get("PRESENDEX_ENV", "development").lower()
SESSION_SECRET = os.environ.get("PRESENDEX_SESSION_SECRET")

if APP_ENV == "production" and not SESSION_SECRET:
    raise RuntimeError("PRESENDEX_SESSION_SECRET must be set before production startup.")
if not SESSION_SECRET:
    SESSION_SECRET = "local-only-" + secrets.token_urlsafe(32)


app = FastAPI(
    title="PresenDex",
    description="School attendance prototype with admin and class-teacher access.",
    version="0.2.0",
)
app.add_middleware(
    SessionMiddleware,
    secret_key=SESSION_SECRET,
    session_cookie="presendex_session",
    max_age=8 * 60 * 60,
    same_site="lax",
    https_only=APP_ENV == "production",
)
app.mount("/assets", StaticFiles(directory=WEB_ROOT / "assets"), name="assets")


@app.on_event("startup")
def create_database_tables() -> None:
    """Create missing prototype tables when the local app starts."""
    Base.metadata.create_all(bind=engine)


def account_summary(account: Account) -> dict[str, object]:
    return {
        "id": account.id,
        "username": account.username,
        "full_name": account.full_name,
        "role": account.role,
        "must_change_password": account.must_change_password,
    }


def class_summary(school_class: SchoolClass) -> dict[str, object]:
    return {
        "id": school_class.id,
        "name": school_class.name,
        "class_teacher_id": school_class.class_teacher_id,
        "class_teacher_name": school_class.class_teacher.full_name if school_class.class_teacher else None,
    }


def student_summary(student: Student) -> dict[str, object]:
    return {
        "id": student.id,
        "student_code": student.student_code,
        "full_name": student.full_name,
        "class_id": student.class_id,
        "is_active": student.is_active,
    }


def get_accessible_class(db: Session, account: Account, class_id: int) -> SchoolClass:
    school_class = db.get(SchoolClass, class_id)
    if school_class is None:
        raise HTTPException(status_code=404, detail="Class not found.")
    if account.role == "teacher" and school_class.class_teacher_id != account.id:
        raise HTTPException(status_code=403, detail="You can only manage your assigned classes.")
    return school_class


def csv_value(value: object) -> object:
    """Prefix spreadsheet formula-like text before writing a CSV cell."""
    if isinstance(value, str) and value.startswith(("=", "+", "-", "@", "\t", "\r")):
        return "'" + value
    return value


@app.get("/", include_in_schema=False)
def home_page() -> FileResponse:
    return FileResponse(WEB_ROOT / "index.html")


@app.get("/login", include_in_schema=False)
def login_page() -> FileResponse:
    return FileResponse(WEB_ROOT / "login.html")


@app.get("/setup", include_in_schema=False)
def setup_page() -> FileResponse:
    return FileResponse(WEB_ROOT / "setup.html")


@app.get("/dashboard", include_in_schema=False)
def dashboard_page() -> FileResponse:
    return FileResponse(WEB_ROOT / "dashboard.html")


@app.get("/logo.png", include_in_schema=True)
def logo() -> FileResponse:
    return FileResponse(PROJECT_ROOT / "logo.png", media_type="image/png")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "PresenDex"}


@app.get("/api/setup/status")
def setup_status(db: Session = Depends(get_db)) -> dict[str, bool]:
    admin_exists = db.scalar(select(func.count(Account.id)).where(Account.role == "admin")) > 0
    return {"setup_required": not admin_exists}


@app.post("/api/setup/admin", status_code=201)
def create_first_admin(
    payload: AdminSetupRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> dict[str, object]:
    host = request.client.host if request.client else ""
    if host not in {"127.0.0.1", "::1", "testclient"}:
        raise HTTPException(status_code=403, detail="Initial admin setup must be done on this computer.")
    if db.scalar(select(func.count(Account.id)).where(Account.role == "admin")) > 0:
        raise HTTPException(status_code=409, detail="The first admin account has already been created.")

    account = Account(
        username=payload.username.strip().lower(),
        full_name=payload.full_name.strip(),
        password_hash=hash_password(payload.password),
        role="admin",
    )
    db.add(account)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="That username is already in use.") from exc
    db.refresh(account)
    request.session["account_id"] = account.id
    return account_summary(account)


@app.post("/api/login")
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)) -> dict[str, object]:
    username = payload.username.strip().lower()
    account = db.scalar(select(Account).where(Account.username == username, Account.is_active.is_(True)))
    password_hash = account.password_hash if account else DUMMY_PASSWORD_HASH
    password_ok = verify_password(payload.password, password_hash)
    if account is None or not password_ok:
        raise HTTPException(status_code=401, detail="Username or password is incorrect.")

    request.session.clear()
    request.session["account_id"] = account.id
    return account_summary(account)


@app.post("/api/logout", status_code=204)
def logout(request: Request) -> Response:
    request.session.clear()
    return Response(status_code=204)


@app.get("/api/me")
def who_am_i(account: Account = Depends(get_current_account)) -> dict[str, object]:
    return account_summary(account)


@app.put("/api/me/password", status_code=204)
def change_password(
    payload: PasswordChangeRequest,
    account: Account = Depends(get_current_account),
    db: Session = Depends(get_db),
) -> Response:
    if not verify_password(payload.current_password, account.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")
    account.password_hash = hash_password(payload.new_password)
    account.must_change_password = False
    db.commit()
    return Response(status_code=204)


@app.get("/api/teachers")
def list_teachers(
    _: Account = Depends(require_admin),
    db: Session = Depends(get_db),
) -> list[dict[str, object]]:
    teachers = db.scalars(select(Account).where(Account.role == "teacher", Account.is_active.is_(True)).order_by(Account.full_name)).all()
    return [account_summary(teacher) for teacher in teachers]


@app.post("/api/teachers", status_code=201)
def create_teacher(
    payload: TeacherCreateRequest,
    _: Account = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    teacher = Account(
        username=payload.username.strip().lower(),
        full_name=payload.full_name.strip(),
        password_hash=hash_password(payload.temporary_password),
        role="teacher",
        must_change_password=True,
    )
    db.add(teacher)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="That username is already in use.") from exc
    db.refresh(teacher)
    return account_summary(teacher)


@app.get("/api/classes")
def list_classes(
    account: Account = Depends(get_active_account),
    db: Session = Depends(get_db),
) -> list[dict[str, object]]:
    query = select(SchoolClass).order_by(SchoolClass.name)
    if account.role == "teacher":
        query = query.where(SchoolClass.class_teacher_id == account.id)
    return [class_summary(school_class) for school_class in db.scalars(query).all()]


@app.post("/api/classes", status_code=201)
def create_class(
    payload: ClassCreateRequest,
    _: Account = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    teacher = None
    if payload.class_teacher_id is not None:
        teacher = db.get(Account, payload.class_teacher_id)
        if teacher is None or teacher.role != "teacher" or not teacher.is_active:
            raise HTTPException(status_code=400, detail="Choose an active teacher account.")

    school_class = SchoolClass(name=payload.name.strip(), class_teacher=teacher)
    db.add(school_class)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="A class with that name already exists.") from exc
    db.refresh(school_class)
    return class_summary(school_class)


@app.patch("/api/classes/{class_id}")
def update_class(
    class_id: int,
    payload: ClassUpdateRequest,
    _: Account = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    school_class = db.get(SchoolClass, class_id)
    if school_class is None:
        raise HTTPException(status_code=404, detail="Class not found.")

    changes = payload.model_dump(exclude_unset=True)
    if "name" in changes and changes["name"] is not None:
        school_class.name = changes["name"].strip()
    if "class_teacher_id" in changes:
        teacher_id = changes["class_teacher_id"]
        teacher = db.get(Account, teacher_id) if teacher_id is not None else None
        if teacher_id is not None and (teacher is None or teacher.role != "teacher" or not teacher.is_active):
            raise HTTPException(status_code=400, detail="Choose an active teacher account.")
        school_class.class_teacher = teacher

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="A class with that name already exists.") from exc
    db.refresh(school_class)
    return class_summary(school_class)


@app.get("/api/classes/{class_id}/students")
def list_students(
    class_id: int,
    account: Account = Depends(get_active_account),
    db: Session = Depends(get_db),
) -> list[dict[str, object]]:
    get_accessible_class(db, account, class_id)
    students = db.scalars(select(Student).where(Student.class_id == class_id).order_by(Student.full_name)).all()
    return [student_summary(student) for student in students]


@app.post("/api/classes/{class_id}/students", status_code=201)
def create_student(
    class_id: int,
    payload: StudentCreateRequest,
    account: Account = Depends(get_active_account),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    get_accessible_class(db, account, class_id)
    student = Student(
        student_code=secrets.token_hex(6).upper(),
        full_name=payload.full_name.strip(),
        class_id=class_id,
    )
    db.add(student)
    db.commit()
    db.refresh(student)
    return student_summary(student)


@app.patch("/api/students/{student_id}")
def update_student(
    student_id: int,
    payload: StudentUpdateRequest,
    account: Account = Depends(get_active_account),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    student = db.get(Student, student_id)
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found.")
    get_accessible_class(db, account, student.class_id)

    changes = payload.model_dump(exclude_unset=True)
    if "full_name" in changes and changes["full_name"] is not None:
        student.full_name = changes["full_name"].strip()
    if "is_active" in changes and changes["is_active"] is not None:
        student.is_active = changes["is_active"]
    db.commit()
    db.refresh(student)
    return student_summary(student)


@app.get("/api/classes/{class_id}/attendance")
def attendance_for_day(
    class_id: int,
    attendance_date: date | None = None,
    account: Account = Depends(get_active_account),
    db: Session = Depends(get_db),
) -> list[dict[str, object]]:
    get_accessible_class(db, account, class_id)
    selected_date = attendance_date or date.today()
    query = (
        select(Student, AttendanceRecord)
        .outerjoin(
            AttendanceRecord,
            (AttendanceRecord.student_id == Student.id)
            & (AttendanceRecord.attendance_date == selected_date),
        )
        .where(Student.class_id == class_id, Student.is_active.is_(True))
        .order_by(Student.full_name)
    )
    rows = db.execute(query).all()
    return [
        {
            "student_id": student.id,
            "student_code": student.student_code,
            "full_name": student.full_name,
            "status": record.status if record else "unmarked",
            "checked_in_at": record.checked_in_at.isoformat() if record and record.checked_in_at else None,
        }
        for student, record in rows
    ]


@app.put("/api/classes/{class_id}/attendance/{student_id}")
def mark_attendance(
    class_id: int,
    student_id: int,
    payload: AttendanceUpdateRequest,
    account: Account = Depends(get_active_account),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    get_accessible_class(db, account, class_id)
    student = db.get(Student, student_id)
    if student is None or student.class_id != class_id:
        raise HTTPException(status_code=404, detail="Student not found in this class.")

    record = db.scalar(
        select(AttendanceRecord).where(
            AttendanceRecord.student_id == student_id,
            AttendanceRecord.attendance_date == payload.attendance_date,
        )
    )
    if record is None:
        record = AttendanceRecord(
            student_id=student_id,
            attendance_date=payload.attendance_date,
            status=payload.status,
            checked_in_at=datetime.now(timezone.utc) if payload.status in {"present", "late"} and payload.attendance_date == date.today() else None,
            marked_by_id=account.id,
        )
        db.add(record)
    else:
        record.status = payload.status
        record.marked_by_id = account.id
        if payload.status in {"absent", "excused"}:
            record.checked_in_at = None
        elif record.checked_in_at is None and payload.attendance_date == date.today():
            record.checked_in_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(record)
    return {
        "student_id": student_id,
        "attendance_date": record.attendance_date.isoformat(),
        "status": record.status,
        "checked_in_at": record.checked_in_at.isoformat() if record.checked_in_at else None,
    }


@app.get("/api/classes/{class_id}/attendance.csv")
def download_attendance_csv(
    class_id: int,
    attendance_date: date | None = None,
    account: Account = Depends(get_active_account),
    db: Session = Depends(get_db),
) -> Response:
    school_class = get_accessible_class(db, account, class_id)
    selected_date = attendance_date or date.today()
    query = (
        select(Student, AttendanceRecord)
        .outerjoin(
            AttendanceRecord,
            (AttendanceRecord.student_id == Student.id)
            & (AttendanceRecord.attendance_date == selected_date),
        )
        .where(Student.class_id == class_id)
        .order_by(Student.full_name)
    )

    output = StringIO(newline="")
    writer = csv.writer(output)
    writer.writerow(["class", "student_code", "student_name", "attendance_date", "status", "checked_in_at_utc"])
    for student, record in db.execute(query).all():
        writer.writerow(
            [
                csv_value(school_class.name),
                csv_value(student.student_code),
                csv_value(student.full_name),
                selected_date.isoformat(),
                record.status if record else "unmarked",
                record.checked_in_at.isoformat() if record and record.checked_in_at else "",
            ]
        )

    class_slug = re.sub(r"[^a-z0-9-]+", "-", school_class.name.lower()).strip("-") or "class"
    filename = f"presendex-{class_slug}-{selected_date.isoformat()}.csv"
    return Response(
        content=output.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
