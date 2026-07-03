// src/hod/hodAttendance.js
// Finds a student by roll number across all sections, computes:
//   - overallPct: single overall attendance % as on today
//   - daily: day-by-day CUMULATIVE attendance % (running total present / running total held)
//     plotted only for days where attendance was actually taken (weekends/holidays absent naturally)

import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { readStatus, calcPct, parseKey, fmtDate } from "../utils";

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

  const sortedDates = Object.keys(byDate).sort();
  let cumPresent = 0, cumTotal = 0;
  const daily = sortedDates.map((date) => {
    cumPresent += byDate[date].present;
    cumTotal += byDate[date].total;
    return {
      date,
      label: fmtDate(date), // "DD/MM/YY" for chart X-axis
      pct: calcPct(cumPresent, cumTotal),
    };
  });

  const overallPct = cumTotal > 0 ? calcPct(cumPresent, cumTotal) : null;
  return { overallPct, daily };
}
