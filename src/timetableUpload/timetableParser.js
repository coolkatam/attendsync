// src/timetableUpload/timetableParser.js
// Reads the filled-in template (Sheet-2) into normalised timetable entries.
// Nothing here talks to Firebase: it takes the workbook plus a description of what the
// portal already knows (the year's sections, their subjects, the people) and returns
//   { sections, entries, problems, facultyUsed }
// An entry is one class in one period: { sectionId, sectionName, day, col, start, end, token,
//   subject, type, faculty: [{ key, name, phone, external, role }], combo }.

import * as XLSX from "xlsx";
import { SHEET2 } from "./templateBuilder";
import { parseRangeLoose, dayIndex, normName, editDistance, BREAK_RE, DAY_NAMES } from "./timeUtils";
import { guessType } from "../sections/subjectUtils";

const COMBO_RE = /\(\s*C\s*(\d+)\s*\)/i;

function colLetter(c) {
  let s = "", n = c + 1;
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function sheetRows(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "", blankrows: true }).map(r => r.map(v => String(v == null ? "" : v)));
  const ref = ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]) : { s: { r: 0, c: 0 } };
  (ws["!merges"] || []).forEach(m => {
    const r0 = m.s.r - ref.s.r, c0 = m.s.c - ref.s.c;
    const v = rows[r0] && rows[r0][c0];
    if (!v) return;
    for (let r = m.s.r; r <= m.e.r; r++) {
      for (let c = m.s.c; c <= m.e.c; c++) {
        const rr = r - ref.s.r, cc = c - ref.s.c;
        if (!rows[rr]) continue;
        while (rows[rr].length <= cc) rows[rr].push("");
        if (rows[rr][cc] === "") rows[rr][cc] = v;
      }
    }
  });
  return rows;
}

function findSheet(wb) {
  if (wb.Sheets[SHEET2]) return wb.Sheets[SHEET2];
  const hit = wb.SheetNames.find(n => /sheet\s*-?\s*2|timetable/i.test(n) && !/guide/i.test(n));
  if (hit) return wb.Sheets[hit];
  return wb.SheetNames.length > 1 ? wb.Sheets[wb.SheetNames[1]] : null;
}

export function parseWorkbook(wb, ctx) {
  const problems = [];
  const warn = (level, text, section) => problems.push({ level, text, section: section || "" });
  const result = { sections: [], entries: [], problems, facultyUsed: {} };

  const ws = findSheet(wb);
  if (!ws) { warn("error", "Sheet-2 (the timetable sheet) was not found in this file. Download the template again and keep its sheets."); return result; }
  const rows = sheetRows(ws);

  // ── people lookup ──
  const byName = new Map(), byEmp = new Map();
  ctx.people.forEach(p => { byName.set(normName(p.name), p); if (p.employeeId) byEmp.set(String(p.employeeId).trim().toLowerCase(), p); });
  const externals = new Map();
  function resolve(raw) {
    const name = String(raw || "").trim();
    const hit = byName.get(normName(name)) || byEmp.get(name.toLowerCase());
    if (hit) { const f = { key: hit.phone, name: hit.name, phone: hit.phone, external: false }; result.facultyUsed[f.key] = f; return f; }
    const f = { key: "ext:" + normName(name), name, phone: null, external: true };
    result.facultyUsed[f.key] = f;
    if (!externals.has(f.key)) {
      let best = null, bd = 99;
      ctx.people.forEach(p => { const d = editDistance(name, p.name); if (d < bd) { bd = d; best = p; } });
      externals.set(f.key, { name, suggestion: best && bd > 0 && bd <= Math.max(2, Math.ceil(name.length * 0.15)) ? best.name : "" });
    }
    return f;
  }

  // ── blocks ──
  const starts = [];
  rows.forEach((r, i) => { if (/^\s*section\b/i.test(r[0] || "")) starts.push(i); });
  if (starts.length === 0) { warn("error", "No \"SECTION:\" lines were found in Sheet-2. Each timetable block must start with a SECTION: line."); return result; }

  const sectionByName = new Map(ctx.sections.map(s => [normName(s.name), s]));
  const seenSections = new Set();

  starts.forEach((si, bi) => {
    const end = bi + 1 < starts.length ? starts[bi + 1] : rows.length;
    const head = rows[si];
    let secName = String(head[1] || "").trim();
    if (!secName) { const after = String(head[0] || "").split(":")[1]; secName = (after || "").trim(); }
    const sec = sectionByName.get(normName(secName));
    if (!sec) { warn("error", "Section \"" + (secName || "(blank)") + "\" is not one of Year " + ctx.year + "'s sections in the portal. Check the name after SECTION:."); return; }
    if (seenSections.has(sec.id)) { warn("error", "Section " + sec.name + " appears twice in Sheet-2.", sec.name); return; }
    seenSections.add(sec.id);

    // header row with the period timings
    let hdr = -1;
    for (let r = si + 1; r < end; r++) if (/^\s*day\b/i.test(rows[r][0] || "")) { hdr = r; break; }
    if (hdr < 0) { warn("error", "Section " + sec.name + ": the Day/Time row with the period timings was not found.", sec.name); return; }

    const dayRows = {};
    let r = hdr + 1;
    for (; r < end; r++) {
      const d = dayIndex(rows[r][0]);
      if (d < 0 || /^\s*sub\b/i.test(rows[r][0] || "")) break;
      dayRows[d] = rows[r];
    }
    const tableAt = (() => { for (let k = r; k < end; k++) if (/^\s*sub\b/i.test(rows[k][0] || "")) return k; return -1; })();

    // columns: timings, break columns
    const hRow = rows[hdr];
    const width = Math.max(hRow.length, ...Object.values(dayRows).map(x => x.length));
    const cols = [];
    for (let c = 1; c < width; c++) {
      const text = String(hRow[c] || "").trim();
      const cells = DAY_NAMES.map((_, d) => String((dayRows[d] || [])[c] || "").trim());
      const any = cells.filter(Boolean);
      if (!text && any.length === 0) continue;
      const brk = any.length > 0 && any.every(v => BREAK_RE.test(v));
      cols.push({ c, text, range: parseRangeLoose(text), brk });
    }
    cols.forEach((col, i) => {
      if (col.range) return;
      if (col.brk) {
        const prev = cols.slice(0, i).reverse().find(x => x.range), next = cols.slice(i + 1).find(x => x.range);
        if (prev && next && prev.range.end < next.range.start) { col.range = { start: prev.range.end, end: next.range.start }; return; }
      }
      warn("error", "Section " + sec.name + ": cannot read the timing in column " + colLetter(col.c) + " (\"" + col.text + "\"). Write it like 09:00-09:50.", sec.name);
    });
    const slots = cols.filter(x => x.range).map(x => ({ col: x.c, start: x.range.start, end: x.range.end, brk: x.brk }));
    result.sections.push({ id: sec.id, name: sec.name, slots });

    // faculty table: label -> names in order
    const table = new Map();
    if (tableAt < 0) warn("warn", "Section " + sec.name + ": the SUB / MAIN FACULTY table was not found, so no faculty are attached to its classes.", sec.name);
    else {
      for (let k = tableAt + 1; k < end; k++) {
        const label = String(rows[k][0] || "").trim().toUpperCase().replace(/\s+/g, " ");
        const names = rows[k].slice(1).map(v => String(v || "").trim()).filter(Boolean);
        if (!label && names.length === 0) continue;
        if (!label) { warn("warn", "Section " + sec.name + ": faculty " + names.join(", ") + " have no subject written next to them in the table.", sec.name); continue; }
        table.set(label, (table.get(label) || []).concat(names));
      }
    }

    // subject lookup for this section
    const known = new Map(); // UPPER short -> subject
    (sec.subjects || []).forEach(s => { if (s.short) known.set(s.short.toUpperCase().replace(/\s+/g, " "), s); });
    const infoSeen = new Set();
    const noteOnce = (level, key, text) => { if (infoSeen.has(key)) return; infoSeen.add(key); warn(level, text, sec.name); };

    slots.filter(s => !s.brk).forEach(slot => {
      DAY_NAMES.forEach((_, d) => {
        const raw = String((dayRows[d] || [])[slot.col] || "").trim();
        if (!raw || BREAK_RE.test(raw)) return;
        const cm = COMBO_RE.exec(raw);
        const combo = cm ? "C" + cm[1] : "";
        const text = raw.replace(COMBO_RE, "").replace(/\s+/g, " ").trim();
        const hasLab = /\blab\b/i.test(text);
        text.split("/").map(p => p.trim().toUpperCase().replace(/\s+/g, " ")).filter(Boolean).forEach(tok => {
          let label = tok;
          // "MOS/MMS LAB" means MOS LAB and MMS LAB: when the cell says LAB, a bare name is read as that subject's lab if one exists.
          if (hasLab && !/\bLAB$/.test(label) && (known.has(label + " LAB") || table.has(label + " LAB"))) label = label + " LAB";
          const subj = known.get(label);
          const names = table.get(label) || [];
          const faculty = names.map((n, i) => ({ ...resolve(n), role: i === 0 ? "main" : "asst" }));
          let type = "note";
          if (subj) type = String(subj.type || guessType(subj.name)).toLowerCase();
          else if (names.length) type = "other";
          if (!subj && names.length === 0) noteOnce("info", "note:" + label, "\"" + label + "\" is not in the subject list and has no faculty. It stays on the section timetable and adds to nobody's workload.");
          if (subj && names.length === 0) {
            const assigned = (subj.faculty || []).length > 0;
            noteOnce(assigned ? "warn" : "info", "nofac:" + label, label + " has no faculty written in the table" + (assigned ? " although faculty are assigned in the portal" : "") + ", so it adds to nobody's workload.");
          }
          if (!subj && names.length) noteOnce("info", "extra:" + label, "\"" + label + "\" is not in the subject list but has faculty, so it is accepted as a duty and counted for them.");
          result.entries.push({
            sectionId: sec.id, sectionName: sec.name, day: d, col: slot.col, start: slot.start, end: slot.end,
            token: label, subject: subj ? subj.name : label, type, faculty, combo,
          });
        });
      });
    });
  });

  ctx.sections.forEach(s => { if (!seenSections.has(s.id)) warn("warn", "No timetable block was found for section " + s.name + ".", s.name); });

  externals.forEach(e => {
    warn(e.suggestion ? "warn" : "info",
      "\"" + e.name + "\" is not in the portal's faculty list, so they are treated as faculty from outside (no portal)." + (e.suggestion ? " Did you mean \"" + e.suggestion + "\"?" : ""));
  });
  return result;
}
