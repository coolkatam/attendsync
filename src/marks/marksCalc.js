// src/marks/marksCalc.js
// Pure calculation helpers — no Firebase, no React.
// Used by both InternalMarksPage (faculty) and MarksAdminTab (admin workbook).

export const THEORY_MAX_PART_A = 10;
export const THEORY_MAX_PART_B_RAW = 30;
export const THEORY_MAX_PART_B_CONV = 15;
export const THEORY_MAX_MID = 25; // Part A + Part B converted
export const THEORY_MAX_FINAL = 25;
export const THEORY_MAX_ASSIGNMENT = 5;
export const THEORY_MAX_TOTAL = 30;

export const DRAWING_MAX_MID_RAW = 30;
export const DRAWING_MAX_MID_CONV = 15;
export const DRAWING_MAX_DAYDAY = 15;
export const DRAWING_MAX_TOTAL = 30;

export const LAB_MAX_TOTAL = 40;

// Part A total — sum of 1A..1E (blank treated as 0)
export function calcPartA(marks) {
  // marks = { a1, a2, a3, a4, a5 }
  return ['a1','a2','a3','a4','a5'].reduce((s, k) => s + (Number(marks?.[k]) || 0), 0);
}

// Question total — qA + qB (blank = 0), capped at 10
export function calcQ(qA, qB) {
  return Math.min(10, (Number(qA) || 0) + (Number(qB) || 0));
}

// Part B raw total — best of (Q2,Q3) + best of (Q4,Q5) + best of (Q6,Q7)
export function calcPartBRaw(marks) {
  // marks = { b2a,b2b, b3a,b3b, b4a,b4b, b5a,b5b, b6a,b6b, b7a,b7b }
  const q = (n) => calcQ(marks?.[`b${n}a`], marks?.[`b${n}b`]);
  return Math.max(q(2),q(3)) + Math.max(q(4),q(5)) + Math.max(q(6),q(7));
}

// Part B converted to 15
export function calcPartBConv(marks) {
  return calcPartBRaw(marks) * 15 / 30;
}

// Theory MID total (out of 25)
export function calcMidTotal(marks) {
  return calcPartA(marks) + calcPartBConv(marks);
}

// Drawing MID: same as Theory Part B (Q1-Q6, best of pairs) → converted to 15
export function calcDrawingMidRaw(marks) {
  // marks = { b1a,b1b, b2a,b2b, b3a,b3b, b4a,b4b, b5a,b5b, b6a,b6b }
  const q = (n) => calcQ(marks?.[`b${n}a`], marks?.[`b${n}b`]);
  return Math.max(q(1),q(2)) + Math.max(q(3),q(4)) + Math.max(q(5),q(6));
}
export function calcDrawingMidConv(marks) {
  return calcDrawingMidRaw(marks) * 15 / 30;
}

// Final internal = CEILING(MAX×0.8 + MIN×0.2)
export function calcFinalInternal(mid1Total, mid2Total) {
  const hi = Math.max(mid1Total, mid2Total);
  const lo = Math.min(mid1Total, mid2Total);
  return Math.ceil(hi * 0.8 + lo * 0.2);
}

// Assignment: if any student has a2 entered → both assignments exist → use average
// Detect at section level: hasA2 = at least one student has a non-blank a2
export function calcAssignment(a1, a2, hasA2) {
  const v1 = Number(a1) || 0;
  if (!hasA2) return v1; // only one assignment
  const v2 = Number(a2) || 0;
  return Math.ceil((v1 + v2) / 2);
}

// Theory grand total
export function calcTheoryTotal(mid1Marks, mid2Marks, a1, a2, hasA2) {
  const final = calcFinalInternal(calcMidTotal(mid1Marks), calcMidTotal(mid2Marks));
  const assign = calcAssignment(a1, a2, hasA2);
  return Math.min(THEORY_MAX_TOTAL, final + assign);
}

// Drawing grand total
export function calcDrawingTotal(mid1Marks, mid2Marks, dayDay) {
  const final = calcFinalInternal(calcDrawingMidConv(mid1Marks), calcDrawingMidConv(mid2Marks));
  return Math.min(DRAWING_MAX_TOTAL, final + (Number(dayDay) || 0));
}

// Lab total
export function calcLabTotal(marks) {
  // marks = { practical, script, viva, record }
  const t = ['practical','script','viva','record'].reduce((s,k) => s + (Number(marks?.[k]) || 0), 0);
  return Math.min(LAB_MAX_TOTAL, t);
}

// Validate: returns error string or null
export function validateTheory(marks, isMid1) {
  const partA = calcPartA(marks);
  if (partA > THEORY_MAX_PART_A) return `Part A total (${partA}) exceeds maximum ${THEORY_MAX_PART_A}`;
  for (let n = 2; n <= 7; n++) {
    const q = calcQ(marks?.[`b${n}a`], marks?.[`b${n}b`]);
    if (q > 10) return `Q${n} total (${q}) exceeds maximum 10`;
  }
  return null;
}

export function validateLab(marks) {
  const t = calcLabTotal(marks);
  if (t > LAB_MAX_TOTAL) return `Total (${t}) exceeds maximum ${LAB_MAX_TOTAL}`;
  return null;
}

export function isLabSubject(sub) {
  return sub?.type === 'Lab';
}
export function isDrawingSubject(sub) {
  return sub?.type === 'Drawing';
}

// ── Real-time entry validation ──────────────────────────────────────────────
// Every field is checked against its OWN actual maximum (not one blanket
// cap) so a wrong entry is flagged the moment it's made, instead of being
// silently rolled up into a total that still looks like a normal number.

export const PART_A_QUESTION_MAX = 2;   // each of 1A..1E
export const PART_B_QUESTION_MAX = 10;  // each question n = best/sum of (nA, nB)

// Which of a1..a5 are individually over their own max (2 each)
export function partAFieldErrors(marks) {
  const errs = {};
  ['a1', 'a2', 'a3', 'a4', 'a5'].forEach(k => {
    const v = Number(marks?.[k]) || 0;
    if (v < 0 || v > PART_A_QUESTION_MAX) errs[k] = true;
  });
  return errs;
}

// Is question n (its pair nA+nB) over its own max (10)?
export function pairHasError(marks, n) {
  const a = Number(marks?.[`b${n}a`]) || 0;
  const b = Number(marks?.[`b${n}b`]) || 0;
  return a < 0 || b < 0 || a > PART_B_QUESTION_MAX || b > PART_B_QUESTION_MAX || (a + b) > PART_B_QUESTION_MAX;
}

// Theory MID-1/MID-2 sheet: Part A (a1-a5) + Part B pairs (Q2-Q7)
export function validateTheoryMid(marks) {
  const partA = partAFieldErrors(marks);
  const pairs = {};
  [2, 3, 4, 5, 6, 7].forEach(n => { pairs[n] = pairHasError(marks, n); });
  const hasError = Object.keys(partA).length > 0 || Object.values(pairs).some(Boolean);
  return { partA, pairs, hasError };
}

// Drawing MID-1/MID-2 sheet: pairs Q1-Q6
export function validateDrawingMid(marks) {
  const pairs = {};
  [1, 2, 3, 4, 5, 6].forEach(n => { pairs[n] = pairHasError(marks, n); });
  const hasError = Object.values(pairs).some(Boolean);
  return { pairs, hasError };
}

// Assignment sheet: a1/a2 each capped at THEORY_MAX_ASSIGNMENT (5)
export function validateAssignmentEntry(marks) {
  const errs = {};
  const a1 = Number(marks?.a1) || 0;
  if (a1 < 0 || a1 > THEORY_MAX_ASSIGNMENT) errs.a1 = true;
  if (marks?.a2 !== undefined && marks?.a2 !== "") {
    const a2 = Number(marks.a2) || 0;
    if (a2 < 0 || a2 > THEORY_MAX_ASSIGNMENT) errs.a2 = true;
  }
  return { errs, hasError: Object.keys(errs).length > 0 };
}

// Day-to-day sheet: single value capped at DRAWING_MAX_DAYDAY (15)
export function validateDayDayEntry(value) {
  const v = Number(value) || 0;
  return { hasError: v < 0 || v > DRAWING_MAX_DAYDAY };
}
