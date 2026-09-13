# Archived Cloud Functions Prototype

This directory is retained only as an earlier prototype and is not connected in `firebase.json`.

The active WBTE implementation uses Next.js server routes for:

- SMTP delivery
- period lifecycle automation
- deadline reminders
- announcement delivery
- AI performance reports
- audit logging
- logical backups

Put active credentials in the project-root `.env.local` or `.env`. Values in `functions/.env` are not read by the application.

Do not deploy this directory for the free WBTE workflow. Use the root `README.md` instructions and an optional external cron request to `/api/maintenance/run`.
