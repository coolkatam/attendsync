# AttendSync

A period-based attendance tracking and student management system built for an engineering college department, designed as a Progressive Web App (installable on Android/iOS with offline support).

**Live app:** https://attendsync-66e55.web.app

## Overview

AttendSync replaces manual attendance registers with a role-based digital system covering attendance marking, reporting, and a department-level student information dashboard ("HoD Dashboard") for academic oversight.

## Features

- **Period-aware attendance marking** — faculty mark present/absent per subject, per period, with batch support for subjects split across multiple faculty/groups
- **Role-based access** — Master Admin (department-wide oversight), Section Admin (manages one section's roster, subjects, and faculty), and Faculty (marks attendance for assigned subjects)
- **PIN-based login** — lightweight phone-number + PIN authentication, no passwords to manage
- **Excel reporting** — color-coded, date-wise attendance export per subject and a consolidated section-wide report, generated client-side
- **HoD Dashboard** — search any student by roll number to view a consolidated profile: live attendance percentage, SGPA/CGPA (credit-weighted), backlog history, hostel/transport status, parent and contact details, and fee balance
- **Bulk data tools** — section-scoped, pre-filled Excel templates for entering student academic/personal records, with safe partial-merge uploads (re-uploading never overwrites fields left blank)
- **Offline support** — installable as a PWA with offline-aware UI banners
- **Self-service faculty onboarding** — admins share an invite link; new faculty register and await approval

## Tech stack

- **Frontend:** React (Create React App)
- **Backend:** Firebase (Firestore for data, Firebase Hosting for deployment)
- **Excel handling:** SheetJS (xlsx)
- **Charts:** Chart.js (attendance and academic performance trends)

## Project structure

```
src/
├── App.js              # Root component, role-based routing
├── AdminApp.js          # Master Admin & Section Admin screens
├── FacultyApp.js         # Faculty attendance-marking screens
├── utils.js              # Attendance calculation, Excel export, shared helpers
├── firebase.js            # Firebase initialization
├── components/UI.js        # Shared UI primitives
└── hod/                     # HoD Dashboard: student lookup, attendance aggregation, Excel upload parsing
```

## Status

Actively developed and in production use for departmental attendance and academic record-keeping.

---

*Built and maintained by [Arun Kumar](https://github.com/coolkatam).*
