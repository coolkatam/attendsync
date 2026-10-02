// src/timetable/timetableModel.js
// Pure helpers for a faculty member's weekly timetable. No React, no Firebase.
//
// Model:  { slots: [{ time }], cells: [ [cell|null, ...slots] x 6 days ] }
// cell:   { type: theory|lab|drawing|other|lunch, subject, section, room, span }
// A cell with span > 1 sits in its first slot; the slots it covers are null.

export const DAYS = [["Mon", "Monday"], ["Tue", "Tuesday"], ["Wed", "Wednesday"], ["Thu", "Thursday"], ["Fri", "Friday"], ["Sat", "Saturday"]];
export const TL = { theory: "Theory", lab: "Lab", drawing: "Drawing", other: "Other", lunch: "Lunch" };
export const COUNTED = ["theory", "lab", "drawing", "other"];
export const MAXSLOTS = 10;
export const DEFAULT_TIMES = ["9:00–9:50", "9:50–10:40", "10:40–11:30", "11:30–12:20", "12:20–1:10", "1:10–2:00", "2:00–2:50", "2:50–3:40"];

export const TYPE_STYLE = {
  theory:  { bg: "#e3f1e9", fg: "#175c3a", dot: "#1f7a4d" },
  lab:     { bg: "#e9eaf7", fg: "#3c3e86", dot: "#4d4f9c" },
  drawing: { bg: "#f8ecd6", fg: "#80490a", dot: "#a15c07" },
  other:   { bg: "#edf0f3", fg: "#44505c", dot: "#5b6673" },
  lunch:   { bg: "#eef1f4", fg: "#5b6673", dot: "#9aa7b4" },
};

export function mkCell(type, subject, section, room, span) {
  return { type, subject: subject || "", section: section || "", room: room || "", span: span || 1 };
}

export function blankModel(times) {
  return {
    slots: times.map(t => ({ time: t })),
    cells: DAYS.map(() => times.map(() => null)),
  };
}

// 7 periods plus one lunch column after period 4, lunch filled on every day.
export function defaultModel() {
  const m = blankModel(DEFAULT_TIMES);
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

export function setTime(model, i, time) {
  const m = cloneModel(model);
  m.slots[i].time = time;
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
  m.slots.splice(at, 0, { time: kind === "lunch" ? "12:20–1:10" : "Set time" });
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
  m.slots.splice(i, 1);
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
  const slots = data.slots.map(s => ({ time: (s && s.time) || "" }));
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
  return [c.subject || TL[c.type], c.section, c.room].filter(Boolean).join(" · ");
}
