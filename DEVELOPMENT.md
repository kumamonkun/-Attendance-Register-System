# Development Status: Attendance Register System

This document summarizes the current implementation state of the Attendance Register System based on the live codebase.

## Completed

### Core Attendance
- Timed attendance sessions with configurable scan windows
- Late detection using a separate late threshold
- Auto-refreshing live QR codes every 30 seconds
- Public student scan flow via `/scan/:sessionId/:sessionCode`
- Manual attendance fallback inside the session page
- Live attendance polling during active sessions
- Dedicated session display window for projector/fullscreen use

### Students, Courses, and Accounts
- Admin-managed user accounts
- Course creation with lecturer assignment
- Student creation and deletion
- CSV import for students with flexible header handling
- Student ID card generation and print layout
- Forced password change flow for default/new accounts

### Reporting
- Per-course attendance reports
- At-risk student highlighting below 75%
- Excel export with Summary, Attendance, At Risk, and Sessions worksheets
- Draft warning emails opened through the local mail client

### Platform
- React frontend with route-based pages
- Express backend with PostgreSQL persistence
- Schema bootstrap on server start
- Default admin seeding when the users table is empty

## Partially Implemented

### Email Alerts
- UI exists for warning students from the reports page
- Backend endpoint exists for looking up email addresses
- Actual SMTP/email delivery is not implemented

### Student QR Usage
- Student ID cards include QR codes containing each student ID
- The session attendance flow still expects students to enter their ID manually on the scan page
- There is no end-to-end “scan personal card to auto-fill attendance form” flow yet

## Known Gaps

- No enrollment validation when a student checks into a session
- No attendance editing/correction UI after a session is recorded
- Authentication sessions are kept in memory and are lost when the server restarts
- PostgreSQL credentials are currently hardcoded in `server/db.js`
- No automated tests or CI pipeline
- Search, pagination, and advanced filtering are still missing

## Architecture Notes

- Runtime database: PostgreSQL
- Legacy file: `server/db.json` is still present, but it is no longer the active datastore
- Frontend proxy target: `http://localhost:3001`
- Main session state contract: `active_session` in localStorage

## Recommended Next Improvements

1. Move database credentials and ports to environment variables
2. Add enrollment checks before accepting attendance scans
3. Add attendance correction/editing tools
4. Replace in-memory auth sessions with persistent storage
5. Add automated tests for session start, scan, report generation, and imports
