// src/hod/hodAttendance.js
// Finds a student by roll number across all sections, then sums their
// present/total periods across every subject in their section — same
// readStatus()/batch logic AdminApp.js already uses for reports.
// Also returns a month-by-month breakdown for the attendance trend chart
// (since attendance isn't tagged by semester, month is the natural grouping
// we already have real date data for).

import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { readStatus, calcPct, parseKey } from "../utils";

// Returns { overallPct: number|null, monthly: [{ month: "2026-01", pct: number }] }
export async function getAttendanceSummary(rollNumber) {
  const sectionsSnap = await getDocs(collection(db, "sections"));

  let section = null, student = null, serial = null;
  for (const sDoc of sectionsSnap.docs) {
    const sec = { id: sDoc.id, ...sDoc.data() };
    const idx = (sec.students || []).findIndex((st) => st.roll === rollNumber);
    if (idx !== -1) {
      section = sec;
      student = sec.students[idx];
      serial = idx + 1;
      break;
    }
  }
  if (!section || !student) return { overallPct: null, monthly: [] };

  let present = 0, total = 0;
  const byMonth = {}; // "YYYY-MM" -> { present, total }

  for (const sub of section.subjects || []) {
    const datesSnap = await getDocs(
      collection(db, "attendance", section.id, "subjects", sub.id, "dates")
    );
    datesSnap.forEach((dateDoc) => {
      const status = readStatus(dateDoc.data(), sub, student, serial);
      total += 1;
      const isPresent = status !== "A";
      if (isPresent) present += 1;

      const { date } = parseKey(dateDoc.id); // "YYYY-MM-DD_period" -> date
      const month = date.slice(0, 7); // "YYYY-MM"
      if (!byMonth[month]) byMonth[month] = { present: 0, total: 0 };
      byMonth[month].total += 1;
      if (isPresent) byMonth[month].present += 1;
    });
  }

  const monthly = Object.keys(byMonth)
    .sort()
    .map((month) => ({ month, pct: calcPct(byMonth[month].present, byMonth[month].total) }));

  return {
    overallPct: total > 0 ? calcPct(present, total) : null,
    monthly,
  };
}
