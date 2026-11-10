// src/timetableDesign/designModel.js
// The admin's answers for "Design a timetable", the period timings they produce, and the checks run on the answers
// before anything is generated. Everything here is plain data and plain functions (no React, no Firebase).

import { parseTimeToken, fmtClock } from "../timetableUpload/timeUtils";

export const DAY_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const DAY_ABBR = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const EXTRA_PRESETS = ["CRT", "Sports", "Library", "Mentoring", "Seminar", "Club activity"];

export function defaultAnswers() {
  return {
    days: 6,                 // 5 = Monday to Friday, 6 = Monday to Saturday
    satHalf: true,           // Saturday is a half day
    satPeriods: 4,           // periods on a half-day Saturday
    periodsPerDay: 7,
    firstStart: "09:00",
    periodMins: 50,
    periodOverrides: {},     // { "1": 60 } period number -> minutes
    breaks: [{ after: 2, mins: 10, label: "Break" }, { after: 4, mins: 40, label: "Lunch" }],
    timingsConfirmed: false,

    labAcrossBreak: false,   // may a lab block run across a break
    labBlock: 3,             // periods in one lab session
    labPref: "any",          // any | morning | afternoon
    repeatSameDay: false,    // may the same subject appear twice in a day for a section
    labOnceADay: true,       // at most one lab/drawing session a day for a section
    loads: {},               // subject name -> { periods, block, avoidFirst, avoidLast, perSection: { [sectionId]: n } }
    parallel: [],            // [[subjectName, ...]] lab subjects that run together as batches
    joint: [],               // [{ subject, sections: [sectionId, ...] }] one class for several sections together

    maxTheoryPerDay: 3,
    maxLabPerDay: 1,
    maxTotalPerDay: 4,
    consecutive: true,       // may a faculty member have back-to-back classes
    maxRun: 2,

    availability: [],        // [{ phone, mode: "blocked" | "only", cells: { "d-p": true } }]
    extras: [],              // see newExtra()
    notes: "",
    sectionIds: [],          // sections being designed; empty = the first section of the year
    allowBlank: false,       // a timetable may not have blank periods (only tests switch this on)
  };
}

export function newExtra(name) {
  return {
    id: "x" + Date.now() + Math.floor(Math.random() * 1000),
    name,
    periods: 2,              // per week, per section
    perSection: {},          // { [sectionId]: n }
    mode: "flex",            // flex = the system places it | fixed = the admin gives day and period
    block: 1,                // periods together (flexible only)
    fixed: {},               // { [sectionId]: [{ day, period }, ...] }
    sameTrainer: false,
    trainer: { kind: "none", phone: "", name: "" },   // none | portal | ext
  };
}

export function periodsOn(a, d) {
  if (d === 5 && a.days === 6 && a.satHalf) return Math.max(1, Math.min(Number(a.periodsPerDay) || 1, Number(a.satPeriods) || 1));
  return Number(a.periodsPerDay) || 1;
}

// The day's grid: each period's clock time, with the breaks between them.
//   periods: [{ n, start, end, mins }]   breaks: [{ after, start, end, label }]
//   slots:   periods and breaks in order, as published timetables store them: [{ start, end, brk, label?, n? }]
export function buildTimings(a) {
  const start = parseTimeToken(a.firstStart);
  if (start === null) return { error: "The first period's start time isn't a time I can read (try 9:00 or 09.00)." };
  const N = Number(a.periodsPerDay);
  if (!(N >= 1 && N <= 12)) return { error: "Periods per day must be between 1 and 12." };
  const periods = [], breaks = [], slots = [];
  let t = start;
  for (let n = 1; n <= N; n++) {
    const mins = Number(a.periodOverrides[n]) || Number(a.periodMins);
    if (!(mins >= 5 && mins <= 240)) return { error: "Period " + n + " has an unusable length." };
    const p = { n, start: t, end: t + mins, mins };
    periods.push(p);
    slots.push({ start: p.start, end: p.end, brk: false, n });
    t = p.end;
    const b = (a.breaks || []).find(x => Number(x.after) === n);
    if (b && n < N) {
      const m = Number(b.mins);
      if (!(m >= 1 && m <= 180)) return { error: "The break after period " + n + " has an unusable length." };
      const br = { after: n, start: t, end: t + m, label: b.label || "Break" };
      breaks.push(br);
      slots.push({ start: br.start, end: br.end, brk: true, label: br.label });
      t = br.end;
    }
  }
  return { periods, breaks, slots, dayEnd: t };
}

// true when period i and the next one follow each other with no break between
export function contiguous(timings, i) {
  const p = timings.periods;
  return i >= 0 && i + 1 < p.length && p[i].end === p[i + 1].start;
}

export function fmtPeriod(p) { return fmtClock(p.start) + "–" + fmtClock(p.end); }

// What the admin told us, checked for things that can't work. Returns [{ level, text }].
export function validateTimings(a) {
  const out = [];
  const T = buildTimings(a);
  if (T.error) { out.push({ level: "error", text: T.error }); return out; }
  const N = Number(a.periodsPerDay);
  const seen = new Set();
  (a.breaks || []).forEach(b => {
    const after = Number(b.after);
    if (!(after >= 1 && after < N)) out.push({ level: "error", text: "A break is set after period " + (b.after || "?") + ", but it must come after a period from 1 to " + (N - 1) + "." });
    else if (seen.has(after)) out.push({ level: "error", text: "Two breaks are set after period " + after + "." });
    seen.add(after);
  });
  if (T.dayEnd > 20 * 60) out.push({ level: "warn", text: "The day runs until " + fmtClock(T.dayEnd) + ". Check the period lengths." });
  if (a.days === 6 && a.satHalf && !(Number(a.satPeriods) >= 1)) out.push({ level: "error", text: "Enter how many periods there are on Saturday." });
  return out;
}

// Normalise a typed number: blank or junk becomes the fallback.
export function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) && v !== "" && v !== null ? n : fallback;
}
