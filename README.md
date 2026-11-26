# PresenDex

![PresenDex logo](logo.png)

PresenDex is a school attendance project with separate admin and teacher workspaces. The current version is a local prototype intended for made-up learner data while we build and learn.

## What is included

- One-time setup for the first admin account.
- Admin tools to create classes and teacher accounts, assign class teachers, and manage students.
- Teacher accounts created by the admin, with a required password change at first sign-in.
- Server-side class permissions: teachers can only manage classes assigned to them.
- Attendance records that authorized teachers can add or correct for any date, with a CSV download.
- SQLite database stored locally on the computer running PresenDex.

## Project layout

- `backend/main.py` — web pages and API routes, including role checks.
- `backend/models.py` — database tables and relationships.
- `backend/database.py` — SQLite or PostgreSQL connection setup.
- `backend/schemas.py` — input validation.
- `backend/security.py` — password hashing and login checks.
- `web/index.html` — public project homepage.
- `web/login.html`, `web/setup.html`, `web/dashboard.html` — sign-in, first admin setup, and school workspace.
- `web/assets/css/styles.css` — shared page styles.
- `web/assets/js/` — separate scripts for the homepage, login, setup, and dashboard.
- `docs/DATABASE.md` — database and QR-code plan.

## Run locally on Fedora or Ubuntu 22.04

You need Python 3.10 or newer and Git. Clone the public repository once:

```bash
git clone https://github.com/itsmeabs-edu/presendex-attendance.git
cd presendex-attendance
```

Set up and start the app:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
uvicorn backend.main:app --reload
```

Open <http://127.0.0.1:8000>. On the first run, choose **Set up your school** and create the admin account. First-admin setup is accepted only from this computer, and closes after the account is created. Later, sign in at <http://127.0.0.1:8000/login>.

The local database, `presendex.db`, is created on startup and excluded from Git. Stop the app with `Ctrl+C`. Use made-up names and IDs during development; this prototype is not ready for real student records or public internet hosting.

To get later code and page updates on the other computer, run `git pull` in its project folder. GitHub shares project files, not the local database.

## Database and privacy

The database currently has `accounts`, `classes`, `students`, and `attendance_records` tables. Passwords are stored as Argon2 hashes, never as readable text. The `.gitignore` rules exclude databases and environment files from the public repository.

This version is local-only. Before hosting it for a school, we still need to configure a strong session secret, use HTTPS, add account recovery and sign-in rate limits, plan schema migrations and backups, and get school approval for the student data and retention plan. Read [the database and QR-code plan](docs/DATABASE.md).
