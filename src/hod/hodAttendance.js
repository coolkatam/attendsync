// src/hod/hodAttendance.js
// Finds a student by roll number across all sections, computes:
//   - overallPct: single overall attendance % across all history, as on today
//   - daily: that week's OWN attendance % (present that week / held that week —
//     not a running total), oldest week first through the present week, grouped
//     by calendar week (Monday start) instead of by individual day. This is
//     what actually shows which specific week was good or bad; a cumulative
//     running total barely moves once there's a few weeks of history.

import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { readStatus, calcPct, parseKey, fmtDate } from "../utils";

// The Monday ("YYYY-MM-DD") of the calendar week a date falls in. Using the
// real date as the grouping key (rather than a week NUMBER) means a plain
// string sort is always correct chronological order, even across year
// boundaries or Jan-week-1 vs Dec-week-52 edge cases.
function mondayOf(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay(); // 0 = Sun .. 6 = Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export async function getAttendanceSummary(rollNumber) {
  const sectionsSnap = await getDocs(collection(db, "sections"));

  let section = null, student = null, serial = null;
  for (const sDoc of sectionsSnap.docs) {
    const sec = { id: sDoc.id, ...sDoc.data() };
    if (sec.deleted) continue;
    const idx = (sec.students || []).findIndex((st) => st.roll === rollNumber);
    if (idx !== -1) {
      section = sec;
      student = sec.students[idx];
      serial = idx + 1;
      break;
    }
  }
  if (!section || !student) return { overallPct: null, daily: [] };

  // Collect all periods across all subjects, keyed by date
  const byDate = {}; // "YYYY-MM-DD" -> { present: n, total: n }

  for (const sub of section.subjects || []) {
    const datesSnap = await getDocs(
      collection(db, "attendance", section.id, "subjects", sub.id, "dates")
    );
    datesSnap.forEach((dateDoc) => {
      const status = readStatus(dateDoc.data(), sub, student, serial);
      const { date } = parseKey(dateDoc.id);
      if (!byDate[date]) byDate[date] = { present: 0, total: 0 };
      byDate[date].total += 1;
      if (status !== "A") byDate[date].present += 1;
    });
  }

  // Roll each day up into its calendar week (Monday start).
  const byWeek = {}; // "YYYY-MM-DD" (that week's Monday) -> { present: n, total: n }
  Object.keys(byDate).forEach((date) => {
    const wk = mondayOf(date);
    if (!byWeek[wk]) byWeek[wk] = { present: 0, total: 0 };
    byWeek[wk].present += byDate[date].present;
    byWeek[wk].total += byDate[date].total;
  });

  // Monday dates sort correctly as plain strings, so this is always oldest
  // week first through the present week — first week nearest the origin.
  const sortedWeeks = Object.keys(byWeek).sort();
  const daily = sortedWeeks.map((weekStart) => {
    const { present, total } = byWeek[weekStart];
    return {
      date: weekStart,
      label: fmtDate(weekStart) + "–" + fmtDate(addDays(weekStart, 6)), // "DD/MM/YY–DD/MM/YY"
      pct: calcPct(present, total),
    };
  });

  // Overall (all-time) attendance is a separate figure from any single
  // week's — sum every week's present/held rather than reusing the loop.
  let totalPresent = 0, totalHeld = 0;
  Object.values(byWeek).forEach(w => { totalPresent += w.present; totalHeld += w.total; });
  const overallPct = totalHeld > 0 ? calcPct(totalPresent, totalHeld) : null;

  return { overallPct, daily };
}
