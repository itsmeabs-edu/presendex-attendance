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

Active students can now have a PNG QR image generated from their random student code. An admin or the teacher assigned to that student's class can download it from the student list. The image contains only the code, not the student's name. QR generation is implemented; webcam scanning and attendance check-in from a scan are still future work.

For scanning, a teacher signs in, chooses their class, and scans the code with the webcam. The browser or ESP32 terminal sends the decoded code to the API. The API finds the student, checks that the teacher is assigned to that class, and records attendance once for that day. A scanner device will need its own secure access method; a student QR code should identify a student, not authorize attendance changes.

A printed QR code can be copied, so it should be treated as an identifier rather than proof of identity. For the school demo, a teacher should visually confirm the student. We should not use face recognition for this project.
