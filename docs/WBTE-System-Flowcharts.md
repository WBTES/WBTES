---
title: "WBTE System Workflow and Flowcharts"
subtitle: "Web-Based Teacher Evaluation"
author: "WBTE Project"
date: "September 12, 2026"
toc: true
toc-depth: 2
---

# Document Purpose

This document describes the implemented WBTE workflow from academic setup through evaluation, monitoring, and reporting. It identifies which role performs each action, how records move through the system, and which controls protect student identity and confidential data.

**Revision status:** The Department Head role and its school-wide, aggregate-only access boundary are represented in all 13 flowcharts in this document.

## Roles

| Role | Primary responsibility | Account workflow |
|---|---|---|
| Administrator | Configures academic data, periods, assignments, users, announcements, analytics, backups, and audit logs | Existing administrator account; administrator accounts cannot be deleted inside WBTE |
| Student | Registers, views assigned teachers, submits one evaluation per teacher and period, and reviews completion history | Self-registration; account becomes active and signs in automatically |
| Department Head | Reviews school-wide aggregate results, responsive charts, grouped comment themes, and exports without raw comments | Account created by an administrator; email verification is required; no department assignment |
| HR | Monitors school-wide teachers, reviews released results and anonymous comments, and exports detailed reports | Account created by an administrator; email verification is required; no department assignment |
| Teacher | Subject of an evaluation and owner of the department, subject, program, year-level, and section scope used for matching | Data record only; teachers do not sign in |

## Organizational Scope

- Teachers are assigned to departments because evaluation results must be grouped by the teacher's academic department.
- Students inherit a department through their selected program and retain program, year-level, and section data for assignment matching.
- Administrators, HR, and Department Heads are school-wide roles and are not assigned to a department.
- HR receives detailed released anonymous results. Department Heads receive only privacy-protected aggregates and grouped themes.

# 1. Overall System Flow

```mermaid
flowchart LR
    A[Admin setup<br/>Academic data, teachers, form, period, assignments]
    A --> B{Student matches<br/>assignment scope?}
    B -- No --> C[Evaluation hidden]
    B -- Yes --> D[Student submits evaluation]
    D --> E[Anonymous response plus separate completion receipt]
    E --> F[Admin monitors and closes period]
    F --> G{At least 5<br/>released responses?}
    G -- No --> H[Department Head charts protected]
    G -- Yes --> I[Department Head aggregate reports]
    F --> J[HR detailed anonymous reports]
```

**Core rule:** an evaluation is visible only when the period is available and the student's account ID is included in the assignment after academic-scope matching.

# 2. Administrator Setup and Evaluation Lifecycle

```mermaid
flowchart LR
    A[Staff setup<br/>Admin creates HR and Department Head<br/>Staff verify email]
    A --> B[Academic setup<br/>Departments, programs, subjects<br/>Teachers own department scope]
    B --> C[Evaluation setup<br/>Questions, form, period<br/>Teacher and student scope]
    C --> D[Evaluation cycle<br/>Assign, open, monitor<br/>Close and release reports]
```

## Administrator CRUD Rules

- Departments, programs, subjects, questions, forms, periods, teachers, and assignments support administrative management.
- Teacher edits synchronize non-closed assignments with the latest program, year-level, section, subject, and status scope.
- Existing assignments can be edited to change their selected students.
- A teacher with evaluation history should be marked inactive instead of deleted.
- An assignment with submissions cannot be deleted.
- Closed periods and completed student links are preserved for reporting and history.
- Administrator, HR, and Department Head staff accounts do not receive an assigned department.
- Administrator accounts cannot be deleted from the WBTE user-management interface.

# 3. Account Registration and Authentication

```mermaid
flowchart TD
    A[Account access workflow] --> B{Role}
    B -- Student --> C[Self-register with academic details]
    C --> D[Validate, create account, and synchronize assignments]
    D --> E[Automatic sign-in to Student dashboard]
    B -- HR --> F[Administrator creates school-wide HR account]
    B -- Department Head --> G[Administrator creates school-wide Department Head account]
    F --> H{Email verified?}
    G --> H
    H -- No --> I[Access denied and verification link provided]
    H -- Yes, HR --> J[School-wide HR dashboard]
    H -- Yes, Department Head --> K[School-wide aggregate dashboard]
```

**Authentication behavior:** student email verification is not required. HR and Department Head email verification is required. Disabled accounts are denied access, and route guards redirect each authenticated user to the dashboard for their role.

```mermaid
flowchart TD
    A[Staff submits username or email and password] --> B[Firebase Authentication validates credentials]
    B --> C[Server loads WBTE user profile]
    C --> D{Account active?}
    D -- No --> E[Deny access]
    D -- Yes --> F{Role}
    F -- Administrator --> G[Administrator dashboard]
    F -- HR --> H{Email verified?}
    F -- Department Head --> I{Email verified?}
    H -- No --> J[Send or reuse verification link and deny access]
    I -- No --> J
    H -- Yes --> K[School-wide HR dashboard]
    I -- Yes --> L[School-wide Department Head dashboard]
```

# 4. Assignment Visibility Decision

```mermaid
flowchart LR
    A[Student opens My Evaluations] --> B{Active student, active teacher,<br/>and UID in assignment?}
    B -- No --> C[Hide evaluation]
    B -- Yes --> D{Department, program,<br/>year, and section match?}
    D -- No --> C
    D -- Yes --> E{Period status}
    E -- Scheduled --> F[Upcoming]
    E -- Open and pending --> G[Pending]
    E -- Open and submitted --> H[Completed]
    E -- Closed --> I[Closed or History]
    G -. open task count .-> J[Department Head overview]
    H -. completion count .-> J
    I -. after threshold .-> K[Department Head aggregate reports]
```

## Section Matching

- Leaving **Assigned sections** empty includes every section within the selected programs and year levels.
- Entering `A, B, C` includes only those sections.
- Section comparison is case-insensitive.
- Newly registered eligible students are synchronized into existing open or scheduled assignments automatically.

## Assignment Count Meaning

An assignment record connects one teacher, subject, evaluation period, and a set of eligible students. Dashboard **Open evaluation tasks** count each student-to-teacher obligation, not only the number of assignment documents.

```mermaid
flowchart TD
    A[5 teacher assignment records] --> C[Task calculation]
    B[3 eligible students per teacher] --> C
    C --> D[5 teachers x 3 students]
    D --> E[15 open evaluation tasks]
    E --> F[Department Head overview displays 15]
```

Each assigned student therefore sees one pending evaluation for each included teacher. Completing one teacher evaluation removes one task from the pending total.

# 5. Student Evaluation Submission and Anonymity

```mermaid
sequenceDiagram
    actor Student
    participant UI as WBTE Student UI
    participant API as Evaluation API
    participant Auth as Firebase Auth
    participant DB as Firestore
    participant Head as Department Head Dashboard

    Student->>UI: Open assigned evaluation
    UI->>DB: Load assignment, period, form, and questions
    DB-->>UI: Return permitted records
    Student->>UI: Complete required answers
    UI->>API: Submit answers with ID token
    API->>Auth: Verify student identity and active status
    API->>DB: Validate assignment scope and open period
    API->>DB: Check one-response rule
    API->>DB: Save anonymous evaluation response
    API->>DB: Save separate completion receipt
    API-->>UI: Submission accepted
    UI-->>Student: Move evaluation to Completed
    Head->>API: Request school-wide overview
    API->>DB: Count tasks and completion receipts
    API-->>Head: Return aggregate counts only
```

## Privacy Controls

- Evaluation response documents do not contain the student's identity.
- Completion receipts retain identity separately so WBTE can prevent duplicate submissions and calculate progress.
- HR sees released anonymous comments school-wide.
- Department Heads receive only grouped themes and counts; raw comments are not sent to their browser.
- Rating and comment results are protected until the evaluation period closes.
- Department Head charts additionally require at least five submitted responses in the selected released view. Five closed periods do not satisfy this rule unless those periods contain at least five released responses in total.

# 6. HR and Department Head Reporting Boundaries

```mermaid
flowchart TD
    A[Verified school-wide staff sign in] --> B{Role}
    B -- HR --> C[Load released anonymous responses]
    B -- Department Head --> D[Load aggregate report API]
    C --> E[Detailed teacher, period, subject, and anonymous comment review]
    D --> F{At least 5 responses?}
    F -- No --> G[Show protected state and response progress]
    F -- Yes --> H[Show ratings, trends, classifications, and grouped themes]
    E --> I[HR detailed PDF and Excel report]
    H --> J[Department Head aggregate PDF and Excel report]
    D -. never returns raw comments .-> K[Privacy boundary]
```

## Reporting Data Boundary

HR can review school-wide released anonymous responses and detailed reports. Department Heads can review school-wide aggregate metrics, grouped comment themes, and counts through a protected server API, but cannot read raw evaluation or report documents.

# 7. Department Head Overview and Reporting

```mermaid
flowchart TD
    A[Department Head signs in with verified email] --> B[Load school-wide overview]
    B --> C[Count active teachers]
    B --> D[Count open evaluation tasks]
    B --> E[Count open-period responses]
    D --> F[Calculate open completion rate]
    E --> F
    B --> G[Count closed periods and released responses]
    G --> H{Released responses at least 5?}
    H -- No --> I[Show response progress and protected state]
    H -- Yes --> J[Show category rating chart]
    H -- Yes --> K[Show comment classification chart]
    H -- Yes --> L[Show period trend chart]
    H -- Yes --> M[Show teacher comparison]
    J --> N[PDF or Excel aggregate export]
    K --> N
    L --> N
    M --> N
```

## Dashboard Metric Definitions

| Metric | Meaning |
|---|---|
| Active teachers | Teacher records not marked inactive |
| Open evaluation tasks | Unique student-to-teacher obligations belonging to currently open periods |
| Open-period responses | Completed tasks that belong to currently open periods |
| Open completion rate | Open-period responses divided by open evaluation tasks |
| Closed periods | Evaluation periods whose status is closed |
| Released responses | Anonymous evaluation responses belonging to closed periods |
| Released average | Average of released ratings, shown only when the five-response privacy threshold is met |

The five-response threshold counts submitted anonymous responses, not periods, teachers, assignment records, or selected sections.

# 8. Announcement and Email Delivery

```mermaid
flowchart TD
    A[Administrator creates announcement] --> B[Choose audience and academic target]
    B --> C{Publish now or schedule?}
    C -- Schedule --> D[Maintenance process publishes at scheduled time]
    C -- Publish now --> E[Announcement becomes active]
    D --> E
    E --> F[Create in-app notifications]
    E --> G{Send email enabled?}
    G -- No --> H[Dashboard notification only]
    G -- Yes --> I[Resolve matching active users]
    I --> J[Send through server SMTP]
    J --> K[Record delivery result]
    F --> L{Recipient role}
    L -- Student --> M[Student announcements]
    L -- HR --> N[HR announcements]
    L -- Department Head --> O[Department Head announcements]
```

**SMTP boundary:** announcement and workflow email uses the SMTP values in the root server environment. Firebase Authentication SMTP settings apply only to Firebase Authentication templates.

# 9. Data and Security Architecture

```mermaid
flowchart LR
    subgraph Client[Next.js Client]
        A[Admin UI]
        B[Student UI]
        C[HR UI]
        D[Department Head UI]
    end

    subgraph Server[Next.js Server Routes]
        E[Authentication and role validation]
        F[Evaluation submission]
        G[Assignment synchronization]
        H[Reports and email]
        I[Aggregate report API]
        J[Audit and maintenance]
    end

    subgraph Firebase[Firebase]
        K[Firebase Authentication]
        L[(Firestore)]
        M[Security Rules]
    end

    A --> M
    B --> M
    C --> M
    M --> L
    A --> E
    B --> E
    C --> E
    D --> E
    D --> I
    E --> K
    E --> L
    F --> L
    G --> L
    H --> L
    I --> L
    J --> L
```

## Primary Collections

| Collection | Purpose | Main access |
|---|---|---|
| `users` | Role, status, profile, and student academic scope | Self and administrator, with server-side role controls |
| `studentRegistry` | Student registration source and account link | Server only |
| `departments`, `programs`, `subjects` | Academic structure | Role-filtered read; administrator write |
| `teachers` | Teacher records and teaching scope | Role-filtered read; administrator write |
| `evaluationQuestions`, `evaluationForms` | Question bank and reusable forms | Active users read; administrator write |
| `evaluationPeriods` | Schedule, form, and release state | Active users read; administrator write |
| `teacherAssignments` | Teacher, subject, period, scope, and student UID list | Assigned student or administrator |
| `evaluations` | Anonymous answers and scores | Administrator; HR after release |
| `evaluationCompletions` | Identity-bearing completion receipt | Owning student or administrator |
| `announcements`, `notifications` | Targeted notices and delivery state | Server-filtered or owning user |
| `performanceReports` | Generated closed-period summaries | Administrator and verified HR |
| `activityLogs`, `systemBackups` | Auditability and recovery | Administrator or server only |

# 10. Recommended Operating Sequence

1. Configure departments and active programs.
2. Add subjects under the correct department.
3. Add teachers and select their subjects, programs, year levels, and sections.
4. Create active questions and assemble an active evaluation form.
5. Create a period, attach the form, and confirm its dates.
6. Create individual or bulk teacher assignments.
7. Open the period and confirm that matching students see Pending evaluations.
8. Monitor completion without exposing response identity.
9. Close the period to release anonymous responses to authorized HR.
10. Confirm that a released report view has at least five submitted responses before expecting Department Head charts.
11. Generate PDF or Excel reports and retain audit and backup records.

# 11. Troubleshooting Path

```mermaid
flowchart TD
    A[Troubleshooting entry] --> B{Affected role}
    B -- Student --> C{Active, assigned, and scope matches?}
    C -- No --> D[Correct account, teacher scope, or assignment]
    C -- Yes --> E{Period open with active form?}
    E -- No --> F[Correct period, form, or questions]
    E -- Yes --> G[Refresh and inspect permissions]
    B -- Department Head --> H{Verified and active?}
    H -- No --> I[Verify email or activate account]
    H -- Yes --> J{Closed view has at least 5 responses?}
    J -- No --> K[Protected state is expected]
    J -- Yes --> L[Refresh aggregate report API]
```

## Protected Department Head Charts

```mermaid
flowchart TD
    A[Department Head chart is protected] --> B{Selected period closed?}
    B -- No --> C[Close the period after evaluation ends]
    B -- Yes --> D[Count submitted responses in selected view]
    D --> E{Count at least 5?}
    E -- No --> F[Wait for enough submissions in an open period, then close it]
    E -- Yes --> G[Refresh report and display aggregate charts]
```

---

**Document control:** This workflow reflects the WBTE implementation as reviewed on September 12, 2026.
