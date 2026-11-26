# PresenDex database and QR-code plan

## Database in the current prototype

The app creates these tables in a local SQLite database:

| Table | Stores |
| --- | --- |
| `accounts` | Admin and teacher usernames, names, Argon2 password hashes, roles, and first-login password-change state |
| `classes` | Class names and the assigned class teacher |
| `students` | Student names, random internal student codes, class membership, and active status |
| `attendance_records` | One daily status per student, who marked it, and when it was last changed |

Foreign keys connect the tables. A unique rule allows only one attendance record per student per day. Student records are deactivated instead of erased, so older attendance reports can still refer to them.

The first admin account is created once from the local computer. Teachers get accounts from the admin and must change the temporary password when they first sign in. Passwords are hashed with Argon2; the database never stores the original password. Teacher permissions are checked by the API for every class, student, attendance, and CSV request.

The local database is useful while one computer runs the service. It must stay out of GitHub; the public repository is for source files only. Do not use real student information in this local prototype.

## Moving to a shared school database

When the school laptop and other devices need to read and update the same records, the intended shape is:

```text
Teacher browser ─┐
                 ├─ HTTPS ─> PresenDex API ─> PostgreSQL database
ESP32 terminal ─┘
```

The web page and ESP32 should talk to the API, never directly to the database. The API stays on an always-on server, so records remain available when the school laptop is off. PostgreSQL is a client/server database; its server accepts application connections. SQLite is an embedded local file and its guidance recommends a client/server database when many computers need direct network access to the same database. [PostgreSQL connection model](https://www.postgresql.org/docs/current/connect-estab.html) · [SQLite usage guidance](https://www.sqlite.org/whentouse.html)

SQLAlchemy is already used to describe the schema and connect to SQLite or PostgreSQL. Before moving real records to a hosted database, add Alembic migrations, test a backup-and-restore process, keep the connection secret outside GitHub, require HTTPS, add account recovery and sign-in rate limits, and agree with school staff about who can access records and how long to retain them.

## QR-code approach

The app currently creates a random student code such as `A71C3F9D42B8`. A later QR card can encode that code, without putting a student's name or other identifying details in the QR image.

The teacher signs in, chooses their class, then scans a student's code with the webcam. The browser sends the code to the API over HTTPS. The API finds the student, checks that the teacher is assigned to that class, and records the attendance once for that day. If the code is unknown or the student belongs to another class, the API rejects it.

A printed QR code can be copied, so it should be treated as an identifier rather than proof of identity. For the school demo, a teacher should visually confirm the student. Later we can consider short-lived rotating codes or another school-approved check. We should not use face recognition for this project.
