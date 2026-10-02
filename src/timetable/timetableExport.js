// src/timetable/timetableExport.js — Excel downloads for the timetable and the HoD workload.

import * as XLSX from "xlsx";
import { DAYS, COUNTED, TL, labelsOf, cellText, stats } from "./timetableModel";

function safeName(s) { return String(s || "Timetable").replace(/[\\/:*?"<>|]/g, "").trim() || "Timetable"; }

export function exportTimetableXLSX(personName, term, model) {
  const labs = labelsOf(model);
  const n = model.slots.length;
  const title = personName + " - Weekly Timetable" + (term ? " (" + term + ")" : "");
  const rows = [[title], [], ["Day", ...model.slots.map((s, i) => labs[i].text + " " + s.time)]];
  const merges = [];
  DAYS.forEach((day, d) => {
    const row = [day[1]];
    let covered = -1;
    for (let i = 0; i < n; i++) {
      if (i <= covered) { row.push(""); continue; }
      const c = model.cells[d][i];
      row.push(cellText(c));
      if (c && c.span > 1) {
        covered = i + c.span - 1;
        merges.push({ s: { r: rows.length, c: i + 1 }, e: { r: rows.length, c: Math.min(covered, n - 1) + 1 } });
      }
    }
    rows.push(row);
  });
  const st = stats(model);
  rows.push([], ["Teaching periods per week", st.total], ...COUNTED.map(k => [TL[k], st.counts[k]]));
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 14 }, ...model.slots.map(() => ({ wch: 24 }))];
  ws["!merges"] = merges;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Timetable");
  XLSX.writeFile(wb, safeName(personName) + " - Timetable.xlsx");
}

export function exportWorkloadXLSX(list) {
  const header = ["Faculty", "Designation", "Periods per week", "Theory", "Lab", "Drawing", "Other", "Free slots", ...DAYS.map(d => d[1])];
  const rows = list.map(f => f.none
    ? [f.name, f.desig, "No timetable filled yet"]
    : [f.name, f.desig, f.s.total, f.s.counts.theory, f.s.counts.lab, f.s.counts.drawing, f.s.counts.other, f.s.free, ...f.s.perDay]);
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  ws["!cols"] = header.map((h, i) => ({ wch: i < 2 ? 26 : 14 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Faculty Workload");
  XLSX.writeFile(wb, "Faculty Workload.xlsx");
}
