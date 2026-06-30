# HoD Student Lookup — Integration Guide (v2)

## Files
- `StudentRecords_Template.xlsx` — one row per student: basic info, parent/contact info, category, hostel type, attendance (reference only), SGPA + backlogs for all 8 semesters, fee balance
- `FeeBalance_Template.xlsx` — roll no, fee balance, as-on-date (re-upload anytime accounts office sends a new sheet — overwrites only the fee fields)
- `studentDataUpload.js` — parses each sheet (SheetJS) and upserts to Firestore `students/{rollNumber}` using merge writes. Blank cells are never written, so they never overwrite existing data with 0/"".
- `hodAttendance.js` — finds a student across all sections and computes live attendance % using your existing `readStatus`/`calcPct` helpers
- `HoDStudentLookup.jsx` — search-by-roll-number screen with header/logout, attendance %, auto-calculated CGPA, semester-wise SGPA/backlogs table, parent/contact info, hostel, fee balance

## Steps to wire into your existing project

1. Copy all three `.js`/`.jsx` files into `src/hod/`.
2. Role gating already done in `App.js` — `user.role === "hod"` routes to this screen.
3. **Still missing — upload UI.** None of the files above give you a button to actually pick and upload an Excel file yet. Next step is adding an "Upload Student Data" panel (likely inside `AdminApp`, admin/master-admin only) with two file inputs:
   ```js
   import { uploadStudentRecords, uploadFeeBalance } from "./hod/studentDataUpload";

   <input type="file" onChange={e => uploadStudentRecords(e.target.files[0]).then(r => alert(`Updated ${r.count} students`))} />
   <input type="file" onChange={e => uploadFeeBalance(e.target.files[0]).then(r => alert(`Updated ${r.count} fee records`))} />
   ```
4. Firestore security rules — only `hod`/`masterAdmin`/`admin` roles should be able to read the full `students` collection; only `admin`/`masterAdmin` should write to it.

## Data notes
- Semester columns map: I-I→1, I-II→2, II-I→3, II-II→4, III-I→5, III-II→6, IV-I→7, IV-II→8.
- CGPA is **not stored** — the app computes it live as the average of whichever semester SGPAs have been entered so far.
- The `AttendanceRef` column in the Excel is for your own bookkeeping only; the app always shows live computed attendance from AttendSync's actual attendance records, not this column.
- Leave fee balance blank (not 0) for students whose dues haven't been confirmed yet — 0 will display as "paid up," blank displays as "—".
