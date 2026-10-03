// src/timetable/timetableModel.js
// Pure helpers for a faculty member's weekly timetable. No React, no Firebase.
//
// Model:  { slots: [{ start, dur, time }], cells: [ [cell|null, ...slots] x 6 days ] }
// slot:   start = minutes after midnight, dur = minutes, time = "9:00–10:00" (derived, kept in sync)
// cell:   { type: theory|lab|drawing|other|lunch, subject, section, room, span }
// A cell with span > 1 sits in its first slot; the slots it covers are null.
//
// Timings chain: each slot starts when the one before it ends, so changing the
// first start, any length, or adding / deleting a column re-times everything after it.

export const DAYS = [["Mon", "Monday"], ["Tue", "Tuesday"], ["Wed", "Wednesday"], ["Thu", "Thursday"], ["Fri", "Friday"], ["Sat", "Saturday"]];
export const TL = { theory: "Theory", lab: "Lab", drawing: "Drawing", other: "Other", lunch: "Lunch" };
export const COUNTED = ["theory", "lab", "drawing", "other"];
export const MAXSLOTS = 10;
export const DEFAULT_START = 9 * 60;
export const PERIOD_MIN = 60;
export const LUNCH_MIN = 40;
export const DUTIES = ["Mentoring", "Disciplinary duties", "NCC", "NSS", "Sports", "Other duties"];

// ── Timings ──────────────────────────────────────────────────────────────────
export function fmtMin(total) {
  const t = ((Math.round(total) % 1440) + 1440) % 1440;
  return (Math.floor(t / 60) % 12 || 12) + ":" + String(t % 60).padStart(2, "0");
}
// For <input type="time"> (24-hour "HH:MM") and back.
export function toHHMM(total) {
  const t = ((Math.round(total) % 1440) + 1440) % 1440;
  return String(Math.floor(t / 60)).padStart(2, "0") + ":" + String(t % 60).padStart(2, "0");
}
export function fromHHMM(str) {
  const mt = /^(\d{1,2}):(\d{2})$/.exec(str || "");
  return mt ? Number(mt[1]) * 60 + Number(mt[2]) : null;
}
function refresh(slot) { slot.time = fmtMin(slot.start) + "–" + fmtMin(slot.start + slot.dur); return slot; }
export function makeSlot(start, dur) { return refresh({ start, dur, time: "" }); }

// Re-time every slot from index `from` on so each begins when the previous one ends.
export function rechain(m, from) {
  for (let i = Math.max(from, 1); i < m.slots.length; i++) {
    const prev = m.slots[i - 1];
    m.slots[i].start = prev.start + prev.dur;
    refresh(m.slots[i]);
  }
}

// Older saved timetables only have text like "9:50–10:40" (afternoon hours without am/pm).
function parseRange(s) {
  const mt = /^\s*(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})\s*$/.exec(s || "");
  if (!mt) return null;
  const h24 = h => (h < 8 ? h + 12 : h);
  const a = h24(Number(mt[1])) * 60 + Number(mt[2]);
  const b = h24(Number(mt[3])) * 60 + Number(mt[4]);
  return b - a > 0 && b - a <= 240 ? { start: a, dur: b - a } : null;
}

export const TYPE_STYLE = {
  theory:  { bg: "#e3f1e9", fg: "#175c3a", dot: "#1f7a4d" },
  lab:     { bg: "#e9eaf7", fg: "#3c3e86", dot: "#4d4f9c" },
  drawing: { bg: "#f8ecd6", fg: "#80490a", dot: "#a15c07" },
  other:   { bg: "#edf0f3", fg: "#44505c", dot: "#5b6673" },
  lunch:   { bg: "#eef1f4", fg: "#5b6673", dot: "#9aa7b4" },
};

export function mkCell(type, subject, section, room, span, year) {
  return { type, subject: subject || "", section: section || "", room: room || "", span: span || 1, year: year || "" };
}

// "III YR I SEM SL-1" and "III-A" both start with year III; "SL-2" has no year in its name.
export function yearOf(sectionName) {
  const mt = /^\s*(IV|III|II|I)(?![A-Za-z])/i.exec(sectionName || "");
  return mt ? mt[1].toUpperCase() : "";
}

// Year, section and room as shown under a cell's subject. The year is left out when the section name already starts with it.
export function cellMeta(c) {
  const yr = c.year && !String(c.section || "").toUpperCase().startsWith(c.year) ? c.year + " Yr" : "";
  return [yr, c.section, c.room].filter(Boolean);
}

// `spec` is a column count (or an array whose length is used). Every column is one period long.
export function blankModel(spec) {
  const n = Array.isArray(spec) ? spec.length : spec;
  const m = { slots: [], cells: DAYS.map(() => []) };
  for (let i = 0; i < n; i++) {
    m.slots.push(makeSlot(DEFAULT_START + i * PERIOD_MIN, PERIOD_MIN));
    m.cells.forEach(row => row.push(null));
  }
  return m;
}

// 9:00 start, 7 one-hour periods plus a 40-minute lunch column after period 4, lunch filled on every day.
export function defaultModel() {
  const m = blankModel(8);
  m.slots[4].dur = LUNCH_MIN;
  refresh(m.slots[4]);
  rechain(m, 1);
  for (let d = 0; d < DAYS.length; d++) m.cells[d][4] = mkCell("lunch");
  return m;
}

export function cloneModel(m) { return JSON.parse(JSON.stringify(m)); }

// The cell that covers slot i on day d, with the slot it starts in.
export function cellAt(m, d, i) {
  const row = m.cells[d];
  for (let s = 0; s <= i; s++) {
    const c = row[s];
    if (c && s + c.span - 1 >= i) return { cell: c, start: s };
  }
  return null;
}

// A column that is Lunch on every day is labelled "Lunch"; the rest are P1, P2…
export function labelsOf(m) {
  const out = [];
  let k = 0;
  m.slots.forEach((_, i) => {
    const allLunch = DAYS.every((_d, d) => { const h = cellAt(m, d, i); return h && h.cell.type === "lunch"; });
    out.push(allLunch ? { text: "Lunch", lunch: true } : { text: "P" + (++k), lunch: false });
  });
  return out;
}

export function stats(m) {
  const n = m.slots.length;
  const counts = { theory: 0, lab: 0, drawing: 0, other: 0 };
  let lunch = 0, total = 0;
  const perDay = [];
  m.cells.forEach(row => {
    let k = 0;
    row.forEach(c => {
      if (!c) return;
      if (c.type === "lunch") lunch += c.span;
      else { counts[c.type] += c.span; k += c.span; total += c.span; }
    });
    perDay.push(k);
  });
  const lunchCols = labelsOf(m).filter(l => l.lunch).length;
  const cap = DAYS.length * n;
  return { counts, total, lunch, perDay, free: cap - total - lunch, cap, dayCap: Math.max(n - lunchCols, 1) };
}

export function maxSpan(m, i) { return Math.min(3, m.slots.length - i); }

// ── Edits (each returns a new model) ─────────────────────────────────────────
export function applyType(model, d, i, type) {
  const m = cloneModel(model);
  const c = m.cells[d][i];
  if (type === "free") m.cells[d][i] = null;
  else if (type === "lunch") m.cells[d][i] = mkCell("lunch", "", "", "", c ? Math.min(c.span, maxSpan(m, i)) : 1);
  else if (!c) m.cells[d][i] = mkCell(type, "", "", "", type === "lab" ? maxSpan(m, i) : 1);
  else c.type = type;
  const cur = m.cells[d][i];
  if (cur) for (let k = 1; k < cur.span; k++) m.cells[d][i + k] = null;
  return m;
}

export function applySpan(model, d, i, span) {
  const m = cloneModel(model);
  const c = m.cells[d][i];
  if (!c) return m;
  c.span = Math.min(span, maxSpan(m, i));
  for (let k = 1; k < c.span; k++) m.cells[d][i + k] = null;
  return m;
}

// Replace the cell that starts at (d, i); null makes it Free. Slots a longer block covers are emptied.
export function setCell(model, d, i, cell) {
  const m = cloneModel(model);
  m.cells[d][i] = cell ? { ...cell, span: Math.min(cell.span || 1, maxSpan(m, i)) } : null;
  const cur = m.cells[d][i];
  if (cur) for (let k = 1; k < cur.span; k++) m.cells[d][i + k] = null;
  return m;
}

export function setField(model, d, i, field, value) {
  const m = cloneModel(model);
  const c = m.cells[d][i];
  if (c) c[field] = value;
  return m;
}

export function clearCell(model, d, i) {
  const m = cloneModel(model);
  m.cells[d][i] = null;
  return m;
}

// Change one column's start and/or length (minutes). Every column after it moves to follow.
// A new length on a period carries to every later period; lunch columns keep their own length.
// Any single column can still be edited again afterwards.
export function setSlotTiming(model, i, patch) {
  const m = cloneModel(model);
  const lunch = labelsOf(m).map(l => l.lunch);
  const s = m.slots[i];
  if (typeof patch.start === "number") s.start = Math.max(0, Math.min(patch.start, 1439));
  if (typeof patch.dur === "number") {
    s.dur = Math.max(5, Math.min(Math.round(patch.dur), 240));
    if (!lunch[i]) for (let j = i + 1; j < m.slots.length; j++) if (!lunch[j]) m.slots[j].dur = s.dur;
  }
  refresh(s);
  rechain(m, i + 1);
  return m;
}

// Insert a column so it ends up at index `at`. kind: "period" | "lunch".
export function insertCol(model, at, kind) {
  if (model.slots.length >= MAXSLOTS) return model;
  const m = cloneModel(model);
  m.cells.forEach(row => {
    for (let s = 0; s < at; s++) {
      const c = row[s];
      if (c && s + c.span - 1 >= at) {
        // A block that straddles the new column either grows over it or is trimmed to stop before it.
        if (kind === "lunch" || c.span + 1 > 3) c.span = at - s; else c.span += 1;
      }
    }
    row.splice(at, 0, null);
  });
  const start = at > 0 ? m.slots[at - 1].start + m.slots[at - 1].dur : m.slots[0].start;
  // A new period is as long as the nearest period before it (or after it, at the start).
  const wasLunch = labelsOf(model).map(l => l.lunch);
  let near = -1;
  for (let j = at - 1; j >= 0 && near < 0; j--) if (!wasLunch[j]) near = j;
  for (let j = at; j < model.slots.length && near < 0; j++) if (!wasLunch[j]) near = j;
  const periodLen = near >= 0 ? model.slots[near].dur : PERIOD_MIN;
  m.slots.splice(at, 0, makeSlot(start, kind === "lunch" ? LUNCH_MIN : periodLen));
  rechain(m, at + 1);
  if (kind === "lunch") for (let d = 0; d < DAYS.length; d++) m.cells[d][at] = mkCell("lunch");
  return m;
}

export function deleteCol(model, i) {
  if (model.slots.length <= 1) return model;
  const m = cloneModel(model);
  m.cells.forEach(row => {
    for (let s = 0; s < i; s++) {
      const c = row[s];
      if (c && s + c.span - 1 >= i) c.span -= 1;
    }
    const own = row[i];
    row.splice(i, 1);
    if (own && own.span > 1) { own.span -= 1; row[i] = own; }
  });
  const removed = m.slots.splice(i, 1)[0];
  if (i === 0) { m.slots[0].start = removed.start; refresh(m.slots[0]); }
  rechain(m, i === 0 ? 1 : i);
  return m;
}

// ── Firestore shape ──────────────────────────────────────────────────────────
// Firestore cannot hold an array of arrays, so days are stored as a map: { "0": [...], "1": [...] }.
export function toStore(m) {
  const cells = {};
  m.cells.forEach((row, d) => { cells[String(d)] = row; });
  return { slots: m.slots, cells };
}

export function fromStore(data) {
  if (!data || !Array.isArray(data.slots) || !data.cells) return null;
  let prevEnd = DEFAULT_START;
  const slots = data.slots.map(s => {
    let start, dur;
    if (s && typeof s.start === "number" && typeof s.dur === "number" && s.dur > 0) { start = s.start; dur = s.dur; }
    else {
      const p = parseRange(s && s.time);
      if (p) { start = p.start; dur = p.dur; } else { start = prevEnd; dur = PERIOD_MIN; }
    }
    prevEnd = start + dur;
    return makeSlot(start, dur);
  });
  const cells = DAYS.map((_, d) => {
    const row = data.cells[String(d)] || [];
    return slots.map((_s, i) => row[i] || null);
  });
  return { slots, cells };
}

// Plain-text version of a cell, for Excel / print.
export function cellText(c) {
  if (!c) return "";
  if (c.type === "lunch") return "Lunch";
  return [c.subject || TL[c.type], ...cellMeta(c)].join(" · ");
}
