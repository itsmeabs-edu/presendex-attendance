# PresenDex database plan

## Stage 1: Local prototype

Keep SQLite for the first version. The FastAPI service and the SQLite file live on the same computer. This is simple to run on Fedora or Ubuntu and works well while one app server handles the demo.

The current table stores only:

| Field | Purpose |
| --- | --- |
| `learner_id` | Fake ID for development; later, a school-approved internal ID |
| `attendance_date` | The school day for the check-in |
| `checked_in_at` | Time the API received the check-in, stored in UTC |

A unique constraint on `(learner_id, attendance_date)` prevents duplicate daily check-ins. The `.gitignore` rules keep local database files and environment files out of GitHub. Never commit real attendance records, passwords, API keys, or database connection strings.

## Stage 2: Shared service

When the school laptop and other devices need to see the same records, run the API on an always-on host and move the database to a managed PostgreSQL service. The browser page and ESP32 should call the API over HTTPS; neither should connect directly to the database. PostgreSQL is designed to accept client connections to a running database server, while SQLite is an embedded local file. SQLite's documentation recommends a client/server database when many computers need to access the same database over a network. [SQLite: Appropriate Uses](https://www.sqlite.org/whentouse.html) · [PostgreSQL: Connections](https://www.postgresql.org/docs/current/connect-estab.html)

The migration should preserve the API routes where possible. The API will use a database connection setting from a host secret manager or environment variable; that value must never be committed to the public repository.

## Suggested shared data model

For a school-approved version, grow the schema in small steps:

1. `schools` — the school name and its time zone.
2. `classes` — each class or group, belonging to a school.
3. `learners` — a random internal ID and only the minimum school-approved profile fields.
4. `enrollments` — which learners belong to which classes and when.
5. `attendance_sessions` — one attendance-taking session for a class and date.
6. `attendance_records` — one learner's status and check-in time for that session, with a uniqueness rule to avoid duplicate records.
7. `staff_accounts` — teacher access, handled with secure sign-in and roles.

Use random internal IDs in QR codes rather than names or other identifying details. QR codes are still shareable credentials, so the API needs to validate them and prevent one learner from checking in as another. Add teacher sign-in, role checks, an audit trail for edits, encrypted connections, backups, and a school-approved retention period before storing real student data.

## Before real student data

Keep development and demo data fictional. Before a school trial, agree with a teacher on what data is necessary, who can see or change it, how long it is kept, how backups are protected, and how records are removed. Do not use face recognition for this project; QR check-in can do the job without collecting face data.
