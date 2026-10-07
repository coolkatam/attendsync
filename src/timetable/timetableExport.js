// src/timetable/timetableExport.js — Excel downloads for the timetable and the HoD workload.

import * as XLSX from "xlsx";
import { DAYS, COUNTED, TL, entryLine, stats } from "./timetableModel";

function safeName(s) { return String(s || "Timetable").replace(/[\\/:*?"<>|]/g, "").trim() || "Timetable"; }

// One column per day, one line per class or duty, the day's total periods at the bottom.
export function exportTimetableXLSX(personName, term, week) {
  const rows = [[personName + " - Weekly Timetable" + (term ? " (" + term + ")" : "")], [], DAYS.map(d => d[1])];
  const depth = Math.max(1, ...week.map(l => l.length));
  for (let i = 0; i < depth; i++) rows.push(week.map(l => (l[i] ? entryLine(l[i]) + (l[i].locked ? " [published]" : "") : "")));
  const st = stats(week);
  rows.push([], st.perDay.map(n => "Total: " + n + (n === 1 ? " period" : " periods")));
  rows.push([], ["Periods per week", st.total], ...COUNTED.map(k => [TL[k], st.counts[k]]));
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = DAYS.map(() => ({ wch: 36 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Timetable");
  XLSX.writeFile(wb, safeName(personName) + " - Timetable.xlsx");
}

export function exportWorkloadXLSX(list) {
  const header = ["Faculty", "Designation", "Teaching workload", "Other duties", "Overall workload", "Theory", "Lab", "Drawing", ...DAYS.map(d => d[1])];
  const rows = list.map(f => f.none
    ? [f.name, f.desig, "No timetable filled yet"]
    : [f.name, f.desig, f.teach, f.other, f.s.total, f.s.counts.theory, f.s.counts.lab, f.s.counts.drawing, ...f.s.perDay]);
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  ws["!cols"] = header.map((h, i) => ({ wch: i < 2 ? 26 : 14 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Faculty Workload");
  XLSX.writeFile(wb, "Faculty Workload.xlsx");
}
