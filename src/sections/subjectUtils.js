// src/sections/subjectUtils.js
// Small helpers for a section's subjects. A subject keeps an ordered list of
// faculty phones: the first is the Main faculty (the only one who marks
// attendance and enters marks, through the long-standing `facultyPhone`
// field), the rest are Assisting faculty who only share the timetable load.

export const SUBJECT_TYPES = ["Theory", "Lab", "Drawing"];

// Ordered faculty phones for a subject, Main first. Older subjects only have facultyPhone.
export function facultyListOf(sub) {
  if (sub && Array.isArray(sub.faculty) && sub.faculty.length) return sub.faculty.filter(Boolean);
  return sub && sub.facultyPhone ? [sub.facultyPhone] : [];
}

export function sameList(a, b) {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

// Returns a copy of the subject carrying this faculty list, with facultyPhone kept equal to the Main faculty.
export function withFaculty(sub, list) {
  const clean = [];
  (list || []).forEach(p => { if (p && !clean.includes(p)) clean.push(p); });
  return { ...sub, faculty: clean, facultyPhone: clean[0] || "" };
}

const SMALL_WORDS = new Set(["and", "the", "for", "a", "an", "&"]);

// "Mechanics of Solids" -> "MOS", "ThermoDynamics" -> "TD", "Fluid Mechanics Lab" -> "FM LAB".
export function suggestShort(name) {
  let n = String(name || "").trim();
  if (!n) return "";
  const isLab = /\blab(oratory)?$/i.test(n);
  if (isLab) n = n.replace(/\s*\blab(oratory)?$/i, "").trim();
  const words = n.replace(/([a-z])([A-Z])/g, "$1 $2").split(/[\s\-/]+/).filter(w => w && !SMALL_WORDS.has(w.toLowerCase()));
  let short = words.length > 1 ? words.map(w => w[0]).join("") : (words[0] || "").slice(0, 4);
  short = short.toUpperCase();
  return isLab ? (short + " LAB").trim() : short;
}

export function shortOf(sub) {
  return (sub && sub.short && sub.short.trim()) || suggestShort(sub && sub.name);
}

export function guessType(name) {
  const n = String(name || "");
  if (/\blab(oratory)?\b/i.test(n)) return "Lab";
  if (/drawing|graphics/i.test(n)) return "Drawing";
  return "Theory";
}
