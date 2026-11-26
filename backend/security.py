"""Password hashing and request-account helpers."""

from fastapi import Depends, HTTPException, Request, status
from pwdlib import PasswordHash
from sqlalchemy.orm import Session

from .database import get_db
from .models import Account


password_hasher = PasswordHash.recommended()
DUMMY_PASSWORD_HASH = password_hasher.hash("not-a-real-presendex-password")


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return password_hasher.verify(password, password_hash)


def get_current_account(
    request: Request,
    db: Session = Depends(get_db),
) -> Account:
    account_id = request.session.get("account_id")
    if not isinstance(account_id, int):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Please sign in.")

    account = db.get(Account, account_id)
    if account is None or not account.is_active:
        request.session.clear()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Please sign in again.")
    return account


def get_active_account(account: Account = Depends(get_current_account)) -> Account:
    if account.must_change_password:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Change your temporary password before continuing.",
        )
    return account


def require_admin(account: Account = Depends(get_active_account)) -> Account:
    if account.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required.")
    return account
