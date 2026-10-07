// src/timetable/timetableModel.js
// A faculty member's week is a list of dated-less "entries": a day, a start and end time, what it is and how many
// periods it counts for. Entries come from two places:
//   - classes published from a coordinator's uploaded timetable (locked, read from masterTimetables), and
//   - the faculty member's own entries (duties, or classes of a year that isn't published yet), stored at
//     facultyTimetables/{phone} as { version: 2, items: [...] }.
// Timings can differ per section, so nothing here depends on a period grid. The only rule is that two
// entries of one person must not overlap in time; those are flagged and the own one is left out of the workload.

export const DAYS = [["Mon", "Monday"], ["Tue", "Tuesday"], ["Wed", "Wednesday"], ["Thu", "Thursday"], ["Fri", "Friday"], ["Sat", "Saturday"]];
export const TL = { theory: "Theory", lab: "Lab", drawing: "Drawing", other: "Other" };
export const COUNTED = ["theory", "lab", "drawing", "other"];
export const DUTIES = ["Mentoring", "Disciplinary duties", "NCC", "NSS", "Sports", "Other duties"];
export const DAY_CAP = 7; // periods that fill a day's bar on the HoD screen

export const TYPE_STYLE = {
  theory:  { bg: "#e3f1e9", fg: "#175c3a", dot: "#1f7a4d" },
  lab:     { bg: "#e9eaf7", fg: "#3c3e86", dot: "#4d4f9c" },
  drawing: { bg: "#f8ecd6", fg: "#80490a", dot: "#a15c07" },
  other:   { bg: "#edf0f3", fg: "#44505c", dot: "#5b6673" },
};

// Soft colours for each day: header, card body, text.
export const DAY_COLORS = [
  { head: "#FBD3E0", body: "#FEF0F5", ink: "#7A2B48" },
  { head: "#D8EDB0", body: "#F4FAE5", ink: "#43601A" },
  { head: "#C9E7F2", body: "#EBF6FA", ink: "#1F5870" },
  { head: "#FBE0A0", body: "#FEF6DE", ink: "#7A5A0C" },
  { head: "#DED6F3", body: "#F3F0FB", ink: "#4B3A82" },
  { head: "#F9D6C0", body: "#FEF1E9", ink: "#8A4420" },
];

// ── Times ────────────────────────────────────────────────────────────────────
export function toHHMM(total) {
  const t = ((Math.round(total) % 1440) + 1440) % 1440;
  return String(Math.floor(t / 60)).padStart(2, "0") + ":" + String(t % 60).padStart(2, "0");
}
export function fromHHMM(str) {
  const mt = /^(\d{1,2}):(\d{2})$/.exec(str || "");
  return mt ? Number(mt[1]) * 60 + Number(mt[2]) : null;
}
export const fmtSpan = (a, b) => toHHMM(a) + "–" + toHHMM(b);

// "III YR I SEM SL-1" and "III-A" both start with year III; "SL-2" has no year in its name.
export function yearOf(sectionName) {
  const mt = /^\s*(IV|III|II|I)(?![A-Za-z])/i.exec(sectionName || "");
  return mt ? mt[1].toUpperCase() : "";
}

let seq = 0;
export const newItemId = () => "i" + Date.now().toString(36) + (seq++).toString(36);

export function mkItem(day, patch) {
  return { id: newItemId(), day, start: 9 * 60, end: 9 * 60 + 50, type: "other", subject: "", section: "", year: "", room: "", periods: 1, ...patch };
}

// Section and year as shown under a subject. The year is left out when the section name already starts with it.
export function metaOf(e) {
  const yr = e.year && !String(e.section || "").toUpperCase().startsWith(e.year) ? e.year + " Yr" : "";
  return [yr, e.section, e.room].filter(Boolean).join(" · ");
}

// ── Firestore shape ──────────────────────────────────────────────────────────
// Older saves were a periods grid ({ slots, cells }). Each filled cell becomes one entry.
function parseRange(s) {
  const mt = /^\s*(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})\s*$/.exec(s || "");
  if (!mt) return null;
  const h24 = h => (h < 8 ? h + 12 : h);
  const a = h24(Number(mt[1])) * 60 + Number(mt[2]);
  const b = h24(Number(mt[3])) * 60 + Number(mt[4]);
  return b - a > 0 && b - a <= 240 ? { start: a, dur: b - a } : null;
}

export function itemsFromStore(data) {
  if (!data) return [];
  if (Array.isArray(data.items)) {
    return data.items.filter(x => x && typeof x.start === "number" && typeof x.end === "number" && x.day >= 0 && x.day < 6)
      .map(x => ({ id: x.id || newItemId(), day: x.day, start: x.start, end: x.end, type: COUNTED.includes(x.type) ? x.type : "other", subject: x.subject || "", section: x.section || "", year: x.year || "", room: x.room || "", periods: Math.max(1, Math.min(3, Number(x.periods) || 1)) }));
  }
  if (!Array.isArray(data.slots) || !data.cells) return [];
  let prevEnd = 9 * 60;
  const slots = data.slots.map(s => {
    let start, dur;
    if (s && typeof s.start === "number" && typeof s.dur === "number" && s.dur > 0) { start = s.start; dur = s.dur; }
    else { const p = parseRange(s && s.time); if (p) { start = p.start; dur = p.dur; } else { start = prevEnd; dur = 60; } }
    prevEnd = start + dur;
    return { start, dur };
  });
  const out = [];
  DAYS.forEach((_, d) => {
    const row = data.cells[String(d)] || [];
    slots.forEach((s, i) => {
      const c = row[i];
      if (!c || c.type === "lunch" || !COUNTED.includes(c.type)) return;
      const span = Math.max(1, Math.min(c.span || 1, slots.length - i));
      const last = slots[i + span - 1];
      out.push({ id: newItemId(), day: d, start: s.start, end: last.start + last.dur, type: c.type, subject: c.subject || "", section: c.section || "", year: c.year || "", room: c.room || "", periods: span });
    });
  });
  return out;
}

export function toStore(items) {
  return { version: 2, items: items.map(x => ({ id: x.id, day: x.day, start: x.start, end: x.end, type: x.type, subject: x.subject || "", section: x.section || "", year: x.year || "", room: x.room || "", periods: x.periods || 1 })) };
}

// ── Putting a person's week together ─────────────────────────────────────────
const clash = (a, b) => a.start < b.end && b.start < a.end;

// published: blocks from masterTimetables (all years). Returns the six days, each a time-ordered list of entries:
//   { id, locked, day, start, end, type, subject, section, year, room, periods, asst, conflicts: [entries], excluded }
// `excluded` marks an own entry that overlaps a published class: it is shown with an error and not counted.
export function buildWeek(items, published, key) {
  const entries = [];
  const comboSeen = new Map();
  (published || []).forEach(b => {
    if (b.type === "note" || !(b.faculty || []).some(f => f.key === key)) return;
    const me = b.faculty.find(f => f.key === key);
    if (b.combo) {
      const id = b.day + "|" + b.start + "|" + b.combo;
      if (comboSeen.has(id)) { const e = comboSeen.get(id); e.section += " + " + b.sectionName; return; }
    }
    const e = {
      id: "p:" + b.id + ":" + (b.publishedYear || ""), locked: true, day: b.day, start: b.start, end: b.end,
      type: COUNTED.includes(b.type) ? b.type : "other", subject: b.token, section: b.sectionName, year: "", room: "",
      periods: b.periods || 1, asst: me.role === "asst", conflicts: [], excluded: false,
    };
    if (b.combo) comboSeen.set(b.day + "|" + b.start + "|" + b.combo, e);
    entries.push(e);
  });
  (items || []).forEach(x => entries.push({ ...x, locked: false, asst: false, conflicts: [], excluded: false }));
  entries.forEach((a, i) => {
    for (let j = i + 1; j < entries.length; j++) {
      const b = entries[j];
      if (a.day !== b.day || !clash(a, b)) continue;
      a.conflicts.push(b); b.conflicts.push(a);
    }
  });
  entries.forEach(e => { if (!e.locked && e.conflicts.some(c => c.locked)) e.excluded = true; });
  const week = DAYS.map(() => []);
  entries.forEach(e => week[e.day].push(e));
  week.forEach(list => list.sort((a, b) => a.start - b.start || a.end - b.end));
  return week;
}

export function stats(week) {
  const counts = { theory: 0, lab: 0, drawing: 0, other: 0 };
  const perDay = week.map(list => {
    let k = 0;
    list.forEach(e => { if (e.excluded) return; counts[e.type] += e.periods; k += e.periods; });
    return k;
  });
  const total = perDay.reduce((a, n) => a + n, 0);
  return { counts, total, perDay };
}

export const conflictCount = week => week.reduce((n, list) => n + list.filter(e => e.conflicts.length).length, 0);

export function entryLine(e) {
  return fmtSpan(e.start, e.end) + " · " + (e.subject || TL[e.type]) + (metaOf(e) ? " · " + metaOf(e) : "") + (e.asst ? " (Asst.)" : "");
}
