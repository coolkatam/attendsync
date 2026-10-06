// src/timetableUpload/timeUtils.js
// Small helpers shared by the timetable template, parser and overlap checker.

export const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Hours 1-7 are afternoon (a college day runs about 8:30 to 4:30), so "1:20" means 13:20.
function hour24(h) { return h >= 1 && h <= 7 ? h + 12 : h; }

// "9:00", "09.00", "0900" and the typo-prone "1240" all read as clock times.
export function parseTimeToken(tok) {
  const m = /^\s*(\d{1,2})\s*[:.]?\s*(\d{2})\s*$/.exec(String(tok || ""));
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return hour24(h) * 60 + min;
}

// "09:00-09:50", "9:00 – 9:50", "11:50-1240" → { start, end } in minutes, or null.
export function parseRangeLoose(text) {
  const parts = String(text || "").split(/\s*(?:-|–|—|\bto\b)\s*/i).filter(p => p !== "");
  if (parts.length !== 2) return null;
  const a = parseTimeToken(parts[0]), b = parseTimeToken(parts[1]);
  if (a === null || b === null || b <= a) return null;
  return { start: a, end: b };
}

export function fmtClock(total) {
  const t = Math.round(total);
  const h = Math.floor(t / 60) % 24, m = t % 60;
  return (h % 12 || 12) + ":" + String(m).padStart(2, "0");
}
export function fmtRange(start, end) { return fmtClock(start) + "–" + fmtClock(end); }
export function fmt24(total) {
  const t = Math.round(total);
  return String(Math.floor(t / 60)).padStart(2, "0") + ":" + String(t % 60).padStart(2, "0");
}
export function fmtRange24(start, end) { return fmt24(start) + "-" + fmt24(end); }

// "Mon", "monday", "MON." → 0..5, or -1
export function dayIndex(text) {
  const t = String(text || "").trim().toLowerCase().slice(0, 3);
  return DAY_SHORT.findIndex(d => d.toLowerCase() === t);
}

export function normName(s) {
  return String(s || "").toLowerCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
}

export function editDistance(a, b) {
  a = normName(a); b = normName(b);
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

// "III YR I SEM SL-1" and "III-A" start with year III; "SL-2" has none.
export function yearFromName(sectionName) {
  const m = /^\s*(IV|III|II|I)(?![A-Za-z])/i.exec(sectionName || "");
  return m ? m[1].toUpperCase() : "";
}
export function yearOfSection(sec) { return (sec && sec.year) || yearFromName(sec && sec.name); }

export const BREAK_RE = /^\s*(break|lunch|tea|interval|recess)\s*$/i;
