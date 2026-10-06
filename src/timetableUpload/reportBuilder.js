// src/timetableUpload/reportBuilder.js
// Adds the generated sheets to the coordinator's own workbook so one file carries everything:
//   Sheet-3  every faculty member's individual timetable
//   Sheet-4  overlaps with the suggested changes
//   Workload Summary  teaching, other duties and overall per faculty

import * as XLSX from "xlsx";
import { DAY_NAMES, DAY_SHORT, fmtRange } from "./timeUtils";

export const SHEET3 = "Sheet-3 Individual";
export const SHEET4 = "Sheet-4 Overlaps";
export const SHEET5 = "Workload Summary";

function cellText(b, key) {
  const f = b.faculty.find(x => x.key === key);
  const role = f && f.role === "asst" ? " (Asst. Faculty)" : "";
  return b.token + role + " · " + b.sectionName + (b.combo ? " (" + b.combo + ")" : "");
}

export function addReportSheets(wb, { blocks, conflicts, suggestions, workload, publishedLabel }) {
  // ── Sheet-3 ──
  const s3 = [];
  workload.forEach(w => {
    const mine = blocks.filter(b => b.type !== "note" && b.faculty.some(f => f.key === w.key));
    const ranges = [];
    mine.forEach(b => { if (!ranges.some(r => r.start === b.start && r.end === b.end)) ranges.push({ start: b.start, end: b.end }); });
    ranges.sort((a, b) => a.start - b.start || a.end - b.end);
    s3.push([w.name + (w.external ? "  (faculty from outside the portal)" : ""), "", "Teaching " + w.teaching + " · Other duties " + w.other + " · Overall " + w.overall]);
    s3.push(["Day", ...ranges.map(r => fmtRange(r.start, r.end))]);
    DAY_NAMES.forEach((dn, d) => {
      const row = [dn];
      ranges.forEach(r => {
        const hit = mine.filter(b => b.day === d && b.start === r.start && b.end === r.end).map(b => cellText(b, w.key));
        row.push(hit.join("  |  "));
      });
      s3.push(row);
    });
    s3.push([]);
  });
  if (!s3.length) s3.push(["No faculty found in the timetable."]);
  const ws3 = XLSX.utils.aoa_to_sheet(s3);
  ws3["!cols"] = [{ wch: 14 }, ...Array.from({ length: 9 }, () => ({ wch: 26 }))];

  // ── Sheet-4 ──
  const s4 = [["#", "Faculty", "Day", "Class A", "Time A", "Class B", "Time B", "Class B is", "Suggested changes"]];
  conflicts.forEach((c, i) => {
    const sug = suggestions[i] || [];
    const lines = [];
    sug.forEach(s => s.options.forEach(o => lines.push("• " + (sug.length > 1 ? "(" + s.block.sectionName + " " + s.block.token + ") " : "") + o.text)));
    s4.push([
      i + 1, c.name, DAY_NAMES[c.day],
      c.a.sectionName + " · " + c.a.token, fmtRange(c.a.start, c.a.end),
      c.b.sectionName + " · " + c.b.token, fmtRange(c.b.start, c.b.end),
      c.b.source === "published" ? (publishedLabel ? publishedLabel(c.b) : "already published") : "in this upload",
      lines.join("\n"),
    ]);
  });
  if (conflicts.length === 0) s4.push(["", "No overlaps found. This timetable can be published."]);
  const ws4 = XLSX.utils.aoa_to_sheet(s4);
  ws4["!cols"] = [{ wch: 4 }, { wch: 24 }, { wch: 11 }, { wch: 28 }, { wch: 16 }, { wch: 28 }, { wch: 16 }, { wch: 26 }, { wch: 90 }];

  // ── Summary ──
  const s5 = [["Faculty", "In portal?", "Teaching workload", "Other duties", "Overall workload", "Of which assisting", "Theory", "Lab", "Drawing", ...DAY_SHORT]];
  workload.forEach(w => s5.push([w.name, w.external ? "No (outside)" : "Yes", w.teaching, w.other, w.overall, w.asst, w.theory, w.lab, w.drawing, ...w.perDay]));
  const ws5 = XLSX.utils.aoa_to_sheet(s5);
  ws5["!cols"] = [{ wch: 28 }, { wch: 13 }, ...Array.from({ length: 13 }, () => ({ wch: 12 }))];

  [[SHEET3, ws3], [SHEET4, ws4], [SHEET5, ws5]].forEach(([name, ws]) => {
    if (wb.SheetNames.includes(name)) { delete wb.Sheets[name]; wb.SheetNames = wb.SheetNames.filter(n => n !== name); }
    XLSX.utils.book_append_sheet(wb, ws, name);
  });
  return wb;
}
