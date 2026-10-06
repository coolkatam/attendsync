// src/timetableUpload/reportBuilder.js
// Adds the generated sheets to the coordinator's own workbook so one file carries everything:
//   Sheet-3   every faculty member's individual timetable (green grids, colour-coded by subject)
//   Sheet-3B  every section's timetable (blue grids, vertical Break / Lunch columns, colour-coded by subject)
//   Sheet-4   overlaps with the suggested changes
//   Workload Summary  teaching, other duties and overall per faculty
// Written with xlsx-js-style (same file format as xlsx, but it can also write colours, borders and merged cells).

import * as XLSX from "xlsx-js-style";
import { DAY_NAMES, DAY_SHORT, fmtRange, fmtRange24 } from "./timeUtils";

export const SHEET3 = "Sheet-3 Individual";
export const SHEET3B = "Sheet-3B Sections";
export const SHEET4 = "Sheet-4 Overlaps";
export const SHEET5 = "Workload Summary";

// One soft background + one dark text colour per subject.
const PALETTE = [
  ["DDEBF7", "1F4E79"], ["E2F0D9", "375623"], ["FFF2CC", "7F6000"], ["FCE4D6", "843C0C"],
  ["E4DFEC", "4B2E83"], ["D9F2F0", "0F5F5A"], ["F8E1F4", "8A2B7E"], ["FDE2E4", "9B2C3B"],
  ["DCE6F9", "2B4C9B"], ["F3E5C8", "6B4E16"], ["D5EFD9", "1B6B3A"], ["F9D9C2", "8F3A0B"],
  ["E8E4F8", "40358C"], ["FFE0B2", "8A4B00"], ["D6EAF8", "154360"], ["EAD9E8", "6C3461"],
];
const NAVY = "16324F", BLUE = "2C5C94", GREEN = "1E5E3A", ZEBRA = "F3F6F4", WHITE = "FFFFFF", GREY_TXT = "7A8794";

const thin = { style: "thin", color: { rgb: "B8C2CC" } };
const BORDER = { top: thin, bottom: thin, left: thin, right: thin };

function st({ bg, fg = "1A2230", bold = false, size = 10, h = "center", v = "center", wrap = true, rot, border = true, italic = false } = {}) {
  const s = { font: { name: "Calibri", sz: size, bold, italic, color: { rgb: fg } }, alignment: { horizontal: h, vertical: v, wrapText: wrap } };
  if (bg) s.fill = { patternType: "solid", fgColor: { rgb: bg } };
  if (rot != null) s.alignment.textRotation = rot;
  if (border) s.border = BORDER;
  return s;
}

// A small sheet builder: set cells, merge ranges (every cell of a merge keeps the style so borders show), emit a worksheet.
class Grid {
  constructor() { this.cells = new Map(); this.merges = []; this.cols = []; this.rows = []; this.maxR = 0; this.maxC = 0; }
  set(r, c, v, s) { this.cells.set(r + ":" + c, { v, s }); this.maxR = Math.max(this.maxR, r); this.maxC = Math.max(this.maxC, c); }
  merge(r1, c1, r2, c2, v, s) {
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) this.set(r, c, r === r1 && c === c1 ? v : "", s);
    if (r1 !== r2 || c1 !== c2) this.merges.push({ s: { r: r1, c: c1 }, e: { r: r2, c: c2 } });
  }
  sheet() {
    const ws = {};
    this.cells.forEach(({ v, s }, key) => {
      const [r, c] = key.split(":").map(Number);
      const isNum = typeof v === "number";
      ws[XLSX.utils.encode_cell({ r, c })] = { v: v == null ? "" : v, t: isNum ? "n" : "s", s };
    });
    ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: this.maxR, c: this.maxC } });
    if (this.merges.length) ws["!merges"] = this.merges;
    ws["!cols"] = this.cols;
    ws["!rows"] = this.rows;
    return ws;
  }
}

function subjectColours(blocks) {
  const map = new Map();
  Array.from(new Set(blocks.map(b => b.token))).sort().forEach((t, i) => map.set(t, PALETTE[i % PALETTE.length]));
  return t => map.get(t) || PALETTE[0];
}

const namesOf = b => b.faculty.map(f => f.name).join(" / ").toUpperCase();

// The distinct non-break periods across every section, in time order.
function globalColumns(sections) {
  const cols = [];
  sections.forEach(s => s.slots.filter(x => !x.brk).forEach(x => {
    if (!cols.some(c => c.start === x.start && c.end === x.end)) cols.push({ start: x.start, end: x.end });
  }));
  return cols.sort((a, b) => a.start - b.start || a.end - b.end);
}

// Groups blocks starting together on one day (parallel labs share a cell) and gives each group the columns it spans.
function placeBlocks(list, cols) {
  const groups = new Map();
  list.forEach(b => {
    const key = b.day + ":" + b.start;
    if (!groups.has(key)) groups.set(key, { day: b.day, start: b.start, end: b.end, blocks: [] });
    const g = groups.get(key);
    g.end = Math.max(g.end, b.end);
    g.blocks.push(b);
  });
  const placed = [];
  groups.forEach(g => {
    const idx = cols.map((c, i) => (c.start < g.end && c.end > g.start ? i : -1)).filter(i => i >= 0);
    if (idx.length) placed.push({ ...g, c1: idx[0], c2: idx[idx.length - 1] });
  });
  return placed;
}

// ── Sheet-3: one green grid per faculty member ──
function facultySheet(blocks, workload, sections, colourOf) {
  const g = new Grid();
  const cols = globalColumns(sections);
  const n = Math.max(cols.length, 1);
  g.cols = [{ wch: 14 }, ...Array.from({ length: n }, () => ({ wch: 22 }))];
  let r = 0;
  workload.forEach(w => {
    const mine = blocks.filter(b => b.type !== "note" && b.faculty.some(f => f.key === w.key));
    g.merge(r, 0, r, n, "Faculty: " + w.name.toUpperCase() + " (Total Load: " + w.overall + " Periods)" + (w.external ? "  · from outside the portal" : ""),
      st({ bg: GREEN, fg: WHITE, bold: true, size: 12, h: "left" }));
    g.rows[r] = { hpt: 24 };
    r++;
    g.set(r, 0, "Day", st({ bg: "2E7D4F", fg: WHITE, bold: true }));
    cols.forEach((c, i) => g.set(r, i + 1, "P" + (i + 1) + " (" + fmtRange24(c.start, c.end) + ")", st({ bg: "2E7D4F", fg: WHITE, bold: true })));
    g.rows[r] = { hpt: 22 };
    r++;
    DAY_NAMES.forEach((dn, d) => {
      const zebra = d % 2 === 1 ? ZEBRA : WHITE;
      g.set(r, 0, dn, st({ bg: "E3EFE7", bold: true, h: "left" }));
      const taken = new Array(n).fill(false);
      placeBlocks(mine.filter(b => b.day === d), cols).forEach(p => {
        let c2 = p.c2;
        for (let c = p.c1; c <= p.c2; c++) if (taken[c]) { c2 = c - 1; break; }
        if (c2 < p.c1) return;
        for (let c = p.c1; c <= c2; c++) taken[c] = true;
        const [bg, fg] = colourOf(p.blocks[0].token);
        const text = p.blocks.map(b => {
          const me = b.faculty.find(f => f.key === w.key);
          return b.token + (me && me.role === "asst" ? " (Asst. Faculty)" : "") + "\n" + b.sectionName + (b.combo ? " (" + b.combo + ")" : "");
        }).join("\n");
        g.merge(r, p.c1 + 1, r, c2 + 1, text, st({ bg, fg, bold: true }));
      });
      for (let c = 0; c < n; c++) if (!taken[c]) g.set(r, c + 1, "-", st({ bg: zebra, fg: GREY_TXT }));
      g.rows[r] = { hpt: 40 };
      r++;
    });
    r++;
  });
  if (workload.length === 0) g.set(0, 0, "No faculty found in the timetable.", st({ border: false, h: "left" }));
  return g.sheet();
}

// ── Sheet-3B: one blue grid per section ──
function sectionSheet(blocks, sections, colourOf) {
  const g = new Grid();
  const widest = Math.max(1, ...sections.map(s => s.slots.length));
  g.cols = [{ wch: 13 }, ...Array.from({ length: widest }, () => ({ wch: 20 }))];
  let r = 0;
  sections.forEach(sec => {
    const n = sec.slots.length;
    if (n === 0) return;
    g.merge(r, 0, r, n, "SECTION: " + sec.name.toUpperCase(), st({ bg: NAVY, fg: WHITE, bold: true, size: 13, h: "left" }));
    g.rows[r] = { hpt: 26 };
    r++;
    g.set(r, 0, "Day", st({ bg: BLUE, fg: WHITE, bold: true }));
    let period = 0;
    sec.slots.forEach((s, i) => {
      if (s.brk) g.set(r, i + 1, s.start >= 690 ? "Lunch" : "Break", st({ bg: "8A6D1D", fg: WHITE, bold: true }));
      else { period++; g.set(r, i + 1, "Period " + period + "\n" + fmtRange24(s.start, s.end), st({ bg: BLUE, fg: WHITE, bold: true })); }
    });
    g.rows[r] = { hpt: 32 };
    r++;
    const first = r;
    // break / lunch columns run down every day as one vertical block
    sec.slots.forEach((s, i) => {
      if (s.brk) g.merge(first, i + 1, first + 5, i + 1, s.start >= 690 ? "L U N C H" : "B R E A K", st({ bg: "F1E6C4", fg: "6B4E16", bold: true, size: 11, rot: 90 }));
    });
    const dataCols = sec.slots.map((s, i) => ({ ...s, i })).filter(s => !s.brk);
    const secBlocks = blocks.filter(b => b.sectionId === sec.id);
    DAY_NAMES.forEach((dn, d) => {
      g.set(r, 0, dn, st({ bg: "DCE6F2", bold: true, h: "left" }));
      const taken = new Set();
      const colsForPlace = dataCols.map(s => ({ start: s.start, end: s.end }));
      placeBlocks(secBlocks.filter(b => b.day === d), colsForPlace).forEach(p => {
        const from = dataCols[p.c1].i, to = dataCols[p.c2].i;
        // a block never swallows a neighbour: stop at the first column already used
        let end = to;
        for (let c = from; c <= to; c++) if (taken.has(c)) { end = c - 1; break; }
        if (end < from) return;
        for (let c = from; c <= end; c++) taken.add(c);
        const [bg, fg] = colourOf(p.blocks[0].token);
        const text = p.blocks.map(b => {
          const who = namesOf(b);
          return b.token + (b.combo ? " (" + b.combo + ")" : "") + (who ? "\n(" + who + ")" : "");
        }).join("\n");
        g.merge(r, from + 1, r, end + 1, text, st({ bg, fg, bold: true }));
      });
      dataCols.forEach(s => { if (!taken.has(s.i)) g.set(r, s.i + 1, "-", st({ bg: d % 2 ? ZEBRA : WHITE, fg: GREY_TXT })); });
      g.rows[r] = { hpt: 54 };
      r++;
    });
    r += 2;
  });
  if (r === 0) g.set(0, 0, "No sections found.", st({ border: false, h: "left" }));
  return g.sheet();
}

// A plain table with a coloured header, borders and zebra rows (used for Sheet-4 and the summary).
function tableSheet(head, rows, widths, { numFrom = -1, headBg = NAVY, rowStyle } = {}) {
  const g = new Grid();
  g.cols = widths.map(w => ({ wch: w }));
  head.forEach((h, c) => g.set(0, c, h, st({ bg: headBg, fg: WHITE, bold: true })));
  g.rows[0] = { hpt: 30 };
  rows.forEach((row, i) => {
    const extra = rowStyle ? rowStyle(row, i) : null;
    const base = (i % 2 ? ZEBRA : WHITE);
    row.forEach((v, c) => {
      const num = numFrom >= 0 && c >= numFrom;
      g.set(i + 1, c, v, st({ bg: (extra && extra.bg) || base, h: num || c === 0 ? "center" : "left", wrap: true, bold: !!(extra && extra.boldCols && extra.boldCols.includes(c)) }));
    });
    const lines = Math.max(1, ...row.map((v, c) => String(v == null ? "" : v).split("\n").reduce((a, ln) => a + Math.max(1, Math.ceil(ln.length / (widths[c] * 1.05))), 0)));
    g.rows[i + 1] = { hpt: Math.min(300, 16 * lines + 6) };
  });
  return g.sheet();
}

export function addReportSheets(wb, { blocks, conflicts, suggestions, workload, publishedLabel, sections = [] }) {
  const colourOf = subjectColours(blocks);
  const ws3 = facultySheet(blocks, workload, sections, colourOf);
  const ws3b = sectionSheet(blocks, sections, colourOf);

  const s4 = [];
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
  if (conflicts.length === 0) s4.push(["", "No overlaps found. This timetable can be published.", "", "", "", "", "", "", ""]);
  const ws4 = tableSheet(["#", "Faculty", "Day", "Class A", "Time A", "Class B", "Time B", "Class B is", "Suggested changes"], s4,
    [5, 24, 12, 28, 16, 28, 16, 26, 90], { headBg: "9B2C3B", rowStyle: () => ({ bg: conflicts.length ? "FDF1F1" : "E6F2EA", boldCols: [1] }) });

  const s5 = workload.map(w => [w.name, w.external ? "No (outside)" : "Yes", w.teaching, w.other, w.overall, w.asst, w.theory, w.lab, w.drawing, ...w.perDay]);
  const ws5 = tableSheet(["Faculty", "In portal?", "Teaching workload", "Other duties", "Overall workload", "Of which assisting", "Theory", "Lab", "Drawing", ...DAY_SHORT], s5,
    [30, 13, ...Array.from({ length: 13 }, () => 12)], { numFrom: 1, headBg: GREEN, rowStyle: () => ({ boldCols: [0, 4] }) });

  [[SHEET3, ws3], [SHEET3B, ws3b], [SHEET4, ws4], [SHEET5, ws5]].forEach(([name, ws]) => {
    if (wb.SheetNames.includes(name)) { delete wb.Sheets[name]; wb.SheetNames = wb.SheetNames.filter(n => n !== name); }
    XLSX.utils.book_append_sheet(wb, ws, name);
  });
  return wb;
}

// Written with the styled library so the colours survive.
export function writeReport(wb, fileName) {
  XLSX.writeFile(wb, fileName);
}
