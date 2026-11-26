# PresenDex

![PresenDex logo](logo.png)

PresenDex is a school attendance project built around an ESP32 terminal and a separate software service. This first software milestone is a small attendance app that runs on Fedora and Ubuntu 22.04.

## Current milestone

- A Python API and simple web page record one check-in per learner ID per day.
- SQLite stores records locally on the computer running the app.
- The prototype uses learner IDs only. Use made-up IDs while developing.
- There is no camera or ESP32 connection yet. Later, a QR reader or ESP32 can send a learner ID to the same API.

The database stays on the computer where the app is running, so attendance records will not automatically appear on both computers. A shared online database and always-available hosting are later steps.

The project files are shared in a **public GitHub repository** so schools and other students can view and reuse the code. The logo, code, and setup notes are public; `presendex.db`, `.env`, and real attendance data must stay private and out of GitHub. GitHub keeps project files available across computers, but it does not sync attendance records or keep the app running by itself.

## Run on Fedora or Ubuntu 22.04

To get the project on a computer, clone the public repository once:

```bash
git clone https://github.com/itsmeabs-edu/presendex-attendance.git
cd presendex-attendance
```

To bring in later project-file updates on that computer, run `git pull` from the project folder. When you make code changes on one computer, commit and push them to GitHub; then run `git pull` on the other. These steps sync code, notes, and the logo, not attendance records.

You need Python 3.10 or newer. From the project folder:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
uvicorn backend.main:app --reload
```

Open <http://127.0.0.1:8000> for the attendance page, or <http://127.0.0.1:8000/docs> to try the API. Stop the server with `Ctrl+C`.

The database is created as `presendex.db` in this folder the first time the app starts. Keep that file private; it contains attendance records.

## Try the demo

On the home page, enter a made-up learner ID such as `DEMO-001`, then select **Check in**. The page shows the check-in result and today's records. Repeating a check-in for the same ID that day is marked as a duplicate.

The API also supports `POST /attendance/check-in` with `{"learner_id":"DEMO-001"}` and `GET /attendance` to see today's records.

## Project roadmap

1. Software API and operator page (this milestone).
2. QR-code scanning using an external webcam.
3. Connect ESP32 firmware to the API and show success or duplicate status on the LCD.
4. Add access controls and choose a suitable always-on hosting option before using real attendance data.

Do not put real student names or attendance data into this prototype. Before a real school trial, ask a teacher to approve the data and hosting plan.
