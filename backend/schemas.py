"""Validated request shapes used by the PresenDex API."""

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field


class AdminSetupRequest(BaseModel):
    username: str = Field(min_length=3, max_length=60, pattern=r"^[A-Za-z0-9._-]+$", str_strip_whitespace=True)
    full_name: str = Field(min_length=2, max_length=120, str_strip_whitespace=True)
    password: str = Field(min_length=12, max_length=128)


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=60)
    password: str = Field(min_length=1, max_length=128)


class TeacherCreateRequest(BaseModel):
    username: str = Field(min_length=3, max_length=60, pattern=r"^[A-Za-z0-9._-]+$", str_strip_whitespace=True)
    full_name: str = Field(min_length=2, max_length=120, str_strip_whitespace=True)
    temporary_password: str = Field(min_length=12, max_length=128)


class ClassCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80, str_strip_whitespace=True)
    class_teacher_id: int | None = None


class ClassUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80, str_strip_whitespace=True)
    class_teacher_id: int | None = None


class StudentCreateRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=120, str_strip_whitespace=True)


class StudentUpdateRequest(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=120, str_strip_whitespace=True)
    is_active: bool | None = None


class AttendanceUpdateRequest(BaseModel):
    attendance_date: date
    status: Literal["present", "late", "absent", "excused"]


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=12, max_length=128)
