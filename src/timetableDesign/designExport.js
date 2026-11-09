// src/timetableDesign/designExport.js
// One workbook for the versions the designer produced: TT-1 (every section's timetable), Ind-1 (every faculty member's
// own timetable), TT-2, Ind-2, TT-3, Ind-3. Same coloured layout as the upload report.

import * as XLSX from "xlsx-js-style";
import { computeWorkload } from "../timetableUpload/overlapCheck";
import { sectionSheet, facultySheet, subjectColours } from "../timetableUpload/reportBuilder";

export function sectionsOf(spec) {
  return spec.sections.map(s => ({ id: s.id, name: s.name, slots: spec.timings.slots.map(x => ({ start: x.start, end: x.end, brk: !!x.brk, label: x.label })) }));
}

export function buildDesignWorkbook(spec, versions) {
  const wb = XLSX.utils.book_new();
  const sections = sectionsOf(spec);
  const colourOf = subjectColours(versions.flatMap(v => v.blocks));
  versions.forEach((v, i) => {
    const n = i + 1;
    XLSX.utils.book_append_sheet(wb, sectionSheet(v.blocks, sections, colourOf, spec.D), "TT-" + n);
    XLSX.utils.book_append_sheet(wb, facultySheet(v.blocks, computeWorkload(v.blocks), sections, colourOf, spec.D), "Ind-" + n);
  });
  return wb;
}

export function writeDesignWorkbook(spec, versions, fileName) {
  XLSX.writeFile(buildDesignWorkbook(spec, versions), fileName);
}
