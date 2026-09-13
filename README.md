# WBTE: Web-Based Teacher Evaluation

WBTE is a role-based teacher evaluation application for students, HR, and administrators. Teachers are evaluation records only; there are no teacher login accounts.

## Implemented Workflows

### Authentication and roles

- Students submit their own name, school email, student number, Program, year level, section, and password from the public Create account page.
- Every new student account becomes active immediately and opens the student dashboard after registration; no administrator approval or email verification is required.
- Existing Google identities are safely linked to the submitted student registration instead of duplicated.
- Administrators can review and correct student academic information without controlling account activation.
- Administrators create administrator and HR accounts with usernames and temporary passwords. The HR role keeps the internal value `department_head` for compatibility.
- Email verification, disabled-account enforcement, secure logout, login audit records, in-app login alerts, and optional SMTP login emails are included.
- Firestore rules recognize only `admin`, `department_head`, and `student`.

### Evaluation cycle

- Administrators manage departments, Programs, subjects, teacher records, questions, reusable forms, schedules, assignments, and announcements.
- Questions support rating scales, multiple choice, open text, categories, ordering, active status, endpoint labels, and Program targeting.
- Schedules contain semester, academic year, form/questions, start and end date/time, and draft, scheduled, open, or closed status.
- Assignments enforce teacher subject, department, Program, year-level, and section scope.
- Students can search and select one or more eligible teachers.
- One response is allowed per teacher and period.
- Ratings and comments are written to anonymous `evaluations` documents.
- Student identity is stored separately in `evaluationCompletions` only for completion monitoring and receipts.

### Notifications and automation

- Published announcements create targeted in-app notifications.
- SMTP can send HR verification messages, announcements, login alerts, opening notices, deadline reminders, completion receipts, and contact messages.
- The maintenance workflow automatically opens and closes periods, sends reminders, publishes or expires announcements, generates reports, and creates one logical backup per day.
- A browser heartbeat runs maintenance while an active user is online.
- For unattended scheduling without Firebase Cloud Functions, call `POST /api/maintenance/run` from an external cron and send `x-maintenance-secret`.

### Analytics, AI, and reports

- Administrator dashboards show student, teacher, department, evaluation, completed, pending, completion-rate, and average-rating totals.
- Charts include department averages, response distribution, period trends, and completed-versus-pending progress.
- HR sees only its assigned department.
- Performance reports include category averages, period trends, strengths, weaknesses, recommendations, graph insights, and consolidated anonymous comment themes.
- Exact duplicate comments are removed before analysis.
- Gemini analysis is optional. Without a key, WBTE generates deterministic rule-based analysis for free.
- Anonymous response reports and student completion reports export to PDF and Excel with friendly names.

### Administration and recovery

- Student records support self-registration monitoring, correction, search, automatic verified activation, deactivation, profile viewing, status tracking, and deletion.
- Staff records support administrator and HR creation, edit, activation, deactivation, verification email, username login, and deletion.
- Department assignments synchronize the department document, user profile, and Firebase custom claims.
- Audit logs include action, actor, role, time, IP where available, metadata, search, and filters.
- Manual and daily logical Firestore backups can be downloaded, restored, and deleted from `/admin/data`.

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env.local` or `.env` in the project root and add the Firebase client and Admin SDK values.

3. In Firebase Authentication, enable:

- Email/Password
- Google

4. Create Cloud Firestore and deploy the rules and indexes:

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

5. Start WBTE:

```bash
npm run dev
```

Open `http://localhost:3000`.

The Next.js application reads the root `.env.local` or `.env`. `functions/.env` is not used by the free Next.js SMTP and maintenance workflow.

HR email verification uses Firebase's hosted confirmation page, so links also work when opened on a phone. Set `NEXT_PUBLIC_APP_URL` to the deployed HTTPS address in production, then add that domain under Firebase Authentication > Settings > Authorized domains.

WBTE custom SMTP verification links can use a deliberate confirmation page on Firebase Hosting so email previews do not consume one-time codes. Set `FIREBASE_EMAIL_ACTION_URL` to the hosted `/verify-email` address and deploy the static handler with:

```bash
npm run deploy:verification
```

## SMTP

For Gmail or Google Workspace, enable 2-Step Verification and create an App Password. Put these values in the root environment file:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-address@gmail.com
SMTP_PASS=your-16-character-app-password
SMTP_FROM_EMAIL=your-address@gmail.com
SMTP_FROM_NAME=WBTE
CONTACT_EMAIL=your-address@gmail.com
```

Restart the Next.js server after changing environment values. The SMTP settings in Firebase Authentication Templates apply only to Firebase Auth messages; WBTE announcement and workflow email uses the root environment values above.

## Optional Gemini Analysis

```env
GEMINI_API_KEY=your-key
GEMINI_MODEL=gemini-3.1-flash-lite
```

Leave `GEMINI_API_KEY` empty to use the built-in analysis. Charts are generated locally from Firestore data and do not require AI or a paid Firebase plan.

## Free Scheduled Maintenance

Set a long random value:

```env
MAINTENANCE_SECRET=replace-with-a-long-random-secret
```

Configure an external scheduler to make this request every 5 minutes:

```text
POST https://your-domain.example/api/maintenance/run
x-maintenance-secret: your-secret
```

This path does not require Firebase Cloud Functions. The application server must be deployed and reachable for SMTP, AI generation, backups, and maintenance.

## School Branding

```env
NEXT_PUBLIC_SCHOOL_NAME=Your School Name
NEXT_PUBLIC_SCHOOL_LOGO_URL=/school-logo.png
NEXT_PUBLIC_CONTACT_EMAIL=feedback@school.edu
```

Place the logo in `public/school-logo.png`, or use an HTTPS image URL.

## Initial Data Order

1. Bootstrap the first administrator in Firebase Authentication, mark the Auth email as verified, and create `users/{uid}` with `role: "admin"` and `status: "active"`.
2. Create departments.
3. Create HR accounts from Admin > Users and assign departments.
4. Create Programs, subjects, and teacher records.
5. Ask students to use Create account. Registration signs them in and opens the student dashboard automatically.
6. Create questions and a reusable evaluation form.
7. Create a scheduled evaluation period.
8. Create eligible teacher assignments.
9. Open the period or let maintenance open it at the configured time.

## Verification Commands

```bash
npm run typecheck
npm run lint
npm run build
```

## Security Notes

- Keep Firebase Admin, SMTP, maintenance, and Gemini secrets server-side.
- Deploy `firestore.rules` before production use.
- Anonymous response documents contain no student UID or email.
- Completion records never contain ratings or comments.
- Firebase Admin SDK routes validate active roles and academic scope on the server.
- Logical backups are stored in Firestore and are useful for application recovery; production deployments should also maintain an independent off-project backup.
