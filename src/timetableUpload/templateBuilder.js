// src/timetableUpload/templateBuilder.js
// Builds the downloadable Excel template for one year:
//   Sheet-1  a sample timetable, the year's subjects with short names, its faculty with Employee IDs, and the instructions
//   Sheet-2  one blank timetable block per section, each followed by a Subject -> Main / Assisting faculty table
// Subjects and faculty come from what is already set up in the portal, so the coordinator copies names across.

import * as XLSX from "xlsx";
import { DAY_NAMES, DAY_SHORT, fmtRange24 } from "./timeUtils";
import { facultyListOf, shortOf } from "../sections/subjectUtils";

export const SHEET1 = "Sheet-1 Guide";
export const SHEET2 = "Sheet-2 Timetable";
export const FACULTY_COLS = 4; // Main + 3 assisting columns in the faculty table

// 9:00 start, 50-minute periods, a 20-minute break after the second and a 40-minute lunch after the fifth.
const DEFAULT_COLUMNS = [
  { start: 540, end: 590 }, { start: 590, end: 640 }, { start: 640, end: 660, brk: "Break" },
  { start: 660, end: 710 }, { start: 710, end: 760 }, { start: 760, end: 800, brk: "Lunch" },
  { start: 800, end: 850 }, { start: 850, end: 900 }, { start: 900, end: 950 },
];

const INSTRUCTIONS = [
  "HOW TO FILL THIS WORKBOOK",
  "1. Sheet-2 has one blank timetable block for every section of this year. Fill in each block. Change any timing, break or lunch to match that section; you can add or remove columns.",
  "2. In the timetable cells write the SHORT NAME of the subject exactly as listed on this sheet (for example TD, MOS). Do not use full names.",
  "3. Two labs or batches running at the same time: separate them with a slash, e.g. MOS/MMS LAB means MOS LAB and MMS LAB together.",
  "4. A class that lasts several periods: merge the cells, or write the same short name in each period.",
  "5. Write Break or Lunch in the break columns. Anything else that is not a subject (for example LIB or SPORTS) stays on the section's timetable and is not counted as a subject.",
  "6. Under every block is a table: SUB | MAIN FACULTY | ASSISTING 1 | ASSISTING 2 | ASSISTING 3. It is pre-filled from the faculty assigned in the portal. You can change it: copy names from the faculty list on this sheet. Spare rows at the bottom are for extra labels such as SPORTS.",
  "7. The FIRST name in a row is the Main faculty, the others are Assisting faculty. Only the faculty written in this table get workload for that subject; a faculty member assigned in the portal but not written here gets none. Attendance and marks always stay with the Main faculty assigned in the portal.",
  "8. A faculty member from another department who is not in the portal can be typed as they are; they appear on the section timetable but have no portal of their own.",
  "9. Sections joined together for one class: add a marker such as (C1) after the short name in every joined section, e.g. MOS (C1). The same code at the same time in two sections is one class, so it is not an overlap and counts once for the faculty.",
  "10. Do not rename the sheets and keep the SECTION: line above each block. Upload this file back in the portal; any overlaps are listed there before anything is published.",
];

export function buildTemplate({ year, sections, facultyByPhone }) {
  const wb = XLSX.utils.book_new();

  // ── distinct subjects and faculty for the year ──
  const subjects = [];
  const seen = new Map();
  sections.forEach(sec => (sec.subjects || []).forEach(sub => {
    const key = sub.name.trim().toLowerCase();
    if (!seen.has(key)) { const e = { name: sub.name, short: shortOf(sub), type: sub.type || "Theory", sections: [] }; seen.set(key, e); subjects.push(e); }
    seen.get(key).sections.push(sec.name);
  }));
  const phones = [];
  sections.forEach(sec => (sec.subjects || []).forEach(sub => facultyListOf(sub).forEach(p => { if (!phones.includes(p)) phones.push(p); })));
  const faculty = phones.map(p => facultyByPhone[p] || { name: p, employeeId: "" }).sort((a, b) => a.name.localeCompare(b.name));

  // ── Sheet-1 ──
  const s1 = [];
  const put = (r, c, v) => { while (s1.length <= r) s1.push([]); s1[r][c] = v; };
  put(0, 0, "Sample format of the timetable for Year " + year + " (write your own in Sheet-2)");
  put(1, 0, "Day/Time");
  DEFAULT_COLUMNS.forEach((col, i) => put(1, i + 1, fmtRange24(col.start, col.end)));
  const sampleNames = subjects.filter(s => !/lab$/i.test(s.short)).map(s => s.short);
  const pick = k => sampleNames.length ? sampleNames[k % sampleNames.length] : "SUB" + (k + 1);
  DAY_SHORT.forEach((d, r) => {
    put(r + 2, 0, d);
    DEFAULT_COLUMNS.forEach((col, i) => {
      if (col.brk) put(r + 2, i + 1, col.brk);
      else if (i >= 6 && r % 2 === 0) put(r + 2, i + 1, i === 6 ? pick(r) + "/" + pick(r + 1) + " LAB" : "");
      else put(r + 2, i + 1, pick(r + i));
    });
  });
  const merges1 = [];
  for (let r = 0; r < 6; r += 2) merges1.push({ s: { r: r + 2, c: 7 }, e: { r: r + 2, c: 9 } });

  const SUBJ_COL = 12, FAC_COL = 17;
  put(1, SUBJ_COL, "S.No"); put(1, SUBJ_COL + 1, "List of assigned subjects"); put(1, SUBJ_COL + 2, "Short name"); put(1, SUBJ_COL + 3, "Type"); put(1, SUBJ_COL + 4, "Sections");
  subjects.forEach((s, i) => {
    put(i + 2, SUBJ_COL, i + 1); put(i + 2, SUBJ_COL + 1, s.name); put(i + 2, SUBJ_COL + 2, s.short);
    put(i + 2, SUBJ_COL + 3, s.type); put(i + 2, SUBJ_COL + 4, s.sections.join(", "));
  });
  put(1, FAC_COL + 4, "S.No"); put(1, FAC_COL + 5, "List of Faculty"); put(1, FAC_COL + 6, "Employee ID");
  faculty.forEach((f, i) => { put(i + 2, FAC_COL + 4, i + 1); put(i + 2, FAC_COL + 5, f.name); put(i + 2, FAC_COL + 6, f.employeeId || ""); });

  const instrRow = Math.max(10, subjects.length + 4, faculty.length + 4);
  INSTRUCTIONS.forEach((t, i) => put(instrRow + i, 0, t));
  const ws1 = XLSX.utils.aoa_to_sheet(s1);
  ws1["!merges"] = merges1;
  ws1["!cols"] = [{ wch: 10 }, ...DEFAULT_COLUMNS.map(() => ({ wch: 13 })), { wch: 3 }, { wch: 5 }, { wch: 34 }, { wch: 12 }, { wch: 9 }, { wch: 30 }, { wch: 4 }, { wch: 4 }, { wch: 6 }, { wch: 30 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws1, SHEET1);

  // ── Sheet-2: one block per section ──
  const s2 = [];
  const merges2 = [];
  sections.forEach(sec => {
    s2.push(["SECTION:", sec.name]);
    s2.push(["Day/Time", ...DEFAULT_COLUMNS.map(c => fmtRange24(c.start, c.end))]);
    DAY_NAMES.forEach(dn => s2.push([dn.slice(0, 3), ...DEFAULT_COLUMNS.map(c => c.brk || "")]));
    s2.push([]);
    s2.push(["SUB", "MAIN FACULTY", "ASSISTING 1", "ASSISTING 2", "ASSISTING 3"]);
    (sec.subjects || []).forEach(sub => {
      const names = facultyListOf(sub).map(p => (facultyByPhone[p] || { name: p }).name);
      s2.push([shortOf(sub), ...Array.from({ length: FACULTY_COLS }, (_, i) => names[i] || "")]);
    });
    for (let k = 0; k < 3; k++) s2.push(["", "", "", "", ""]);
    s2.push([]); s2.push([]);
  });
  const ws2 = XLSX.utils.aoa_to_sheet(s2);
  ws2["!merges"] = merges2;
  ws2["!cols"] = [{ wch: 14 }, ...DEFAULT_COLUMNS.map(() => ({ wch: 16 }))];
  XLSX.utils.book_append_sheet(wb, ws2, SHEET2);
  return wb;
}
