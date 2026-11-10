// src/timetableUpload/editChecks.js
// Edits to a published timetable (move, swap, change faculty, add, remove) and the checks that run on every one.
// Each edit function returns { blocks, editedIds, text } or { error }; checkEdit then says whether the result is
// allowed: a faculty member may not be in two places at once (including other years' published timetables) and a
// section may not have two classes at the same time (except labs running together as batches).

import { detectOverlaps } from "./overlapCheck";
import { DAY_NAMES, fmtRange } from "./timeUtils";

const day3 = d => DAY_NAMES[d].slice(0, 3);
const LABISH = ["lab", "drawing"];
const mkId = b => b.sectionId + ":" + b.day + ":" + b.start + ":" + b.token;
const teachingOf = slots => (slots || []).filter(s => !s.brk).slice().sort((a, b) => a.start - b.start);

// where a block of k periods could start (index into the section's teaching periods)
export function startOptions(block, slots) {
  const t = teachingOf(slots);
  const k = block.periods || 1;
  // a block that already runs across a break (a lab, say) may keep doing so
  const first = t.findIndex(s => s.start === block.start);
  let gapOk = false;
  if (first >= 0) for (let x = first + 1; x < first + k && x < t.length; x++) if (t[x].start !== t[x - 1].end) gapOk = true;
  const out = [];
  for (let i = 0; i + k <= t.length; i++) {
    let ok = true;
    for (let x = i + 1; x < i + k; x++) if (t[x].start !== t[x - 1].end && !gapOk) ok = false;
    if (ok) out.push({ index: i, start: t[i].start, end: t[i + k - 1].end });
  }
  return out;
}

export function moveBlock(blocks, id, day, start, slots) {
  const b = blocks.find(x => x.id === id);
  if (!b) return { error: "That class could not be found." };
  const opt = startOptions(b, slots).find(o => o.start === start);
  if (!opt) return { error: "A " + (b.periods || 1) + "-period class can't start there." };
  if (b.day === day && b.start === start) return { error: "It is already there." };
  const text = "Moved " + b.token + " (" + b.sectionName + ") from " + day3(b.day) + " " + fmtRange(b.start, b.end) + " to " + day3(day) + " " + fmtRange(opt.start, opt.end) + ".";
  const moved = { ...b, day, start: opt.start, end: opt.end };
  moved.id = mkId(moved);
  return { blocks: blocks.map(x => (x.id === id ? moved : x)), editedIds: [moved.id], text };
}

export function swapBlocks(blocks, idA, idB) {
  const a = blocks.find(x => x.id === idA), b = blocks.find(x => x.id === idB);
  if (!a || !b) return { error: "A class could not be found." };
  if (a.sectionId !== b.sectionId) return { error: "Only two classes of the same section can be swapped." };
  if ((a.periods || 1) !== (b.periods || 1)) return { error: "These two classes have a different number of periods, so they can't swap places." };
  const na = { ...a, day: b.day, start: b.start, end: b.end }, nb = { ...b, day: a.day, start: a.start, end: a.end };
  na.id = mkId(na); nb.id = mkId(nb);
  return {
    blocks: blocks.map(x => (x.id === idA ? na : x.id === idB ? nb : x)), editedIds: [na.id, nb.id],
    text: "Swapped " + a.token + " (" + day3(a.day) + " " + fmtRange(a.start, a.end) + ") with " + b.token + " (" + day3(b.day) + " " + fmtRange(b.start, b.end) + ") in " + a.sectionName + ".",
  };
}

export function changeFaculty(blocks, id, faculty) {
  const b = blocks.find(x => x.id === id);
  if (!b) return { error: "That class could not be found." };
  const f = faculty.map((p, i) => ({ ...p, role: i === 0 ? "main" : "asst" }));
  const before = b.faculty.map(x => x.name).join(", ") || "nobody";
  return { blocks: blocks.map(x => (x.id === id ? { ...x, faculty: f } : x)), editedIds: [id], text: "Changed the faculty of " + b.token + " (" + b.sectionName + ", " + day3(b.day) + " " + fmtRange(b.start, b.end) + ") from " + before + " to " + (f.map(x => x.name).join(", ") || "nobody") + "." };
}

export function removeBlock(blocks, id) {
  const b = blocks.find(x => x.id === id);
  if (!b) return { error: "That class could not be found." };
  return { blocks: blocks.filter(x => x.id !== id), editedIds: [], text: "Removed " + b.token + " (" + b.sectionName + ", " + day3(b.day) + " " + fmtRange(b.start, b.end) + ")." };
}

// section: { id, name, slots }; item: { token, subject, type, faculty, periods }
export function addBlock(blocks, section, day, start, item) {
  const probe = { id: "", sectionId: section.id, sectionName: section.name, day, start, end: start, token: item.token, subject: item.subject || item.token, type: item.type || "other", combo: "", periods: item.periods || 1, faculty: item.faculty || [] };
  const opt = startOptions(probe, section.slots).find(o => o.start === start);
  if (!opt) return { error: "A " + probe.periods + "-period class can't start there: it would run past the day or across a break." };
  const nb = { ...probe, end: opt.end };
  nb.id = mkId(nb);
  if (blocks.some(x => x.id === nb.id)) return { error: "That class is already there." };
  return { blocks: blocks.concat(nb), editedIds: [nb.id], text: "Added " + nb.token + " to " + section.name + " on " + day3(day) + " " + fmtRange(nb.start, nb.end) + "." };
}

// is the changed timetable allowed? published = blocks of OTHER years' published timetables
export function checkEdit(blocks, editedIds, published) {
  const tagged = blocks.map(b => ({ ...b, source: "upload" }));
  const facultyClashes = detectOverlaps(tagged, published)
    .filter(c => editedIds.includes(c.a.id) || editedIds.includes(c.b.id))
    .map(c => ({
      text: c.name + " would be in two places on " + DAY_NAMES[c.day] + ": " + c.a.sectionName + " · " + c.a.token + " (" + fmtRange(c.a.start, c.a.end) + ") and " + c.b.sectionName + " · " + c.b.token + " (" + fmtRange(c.b.start, c.b.end) + ")" +
        (c.b.source === "published" ? ", which is already published for Year " + (c.b.publishedYear || "?") : "") + ".",
    }));
  const sectionClashes = [];
  editedIds.forEach(id => {
    const b = blocks.find(x => x.id === id);
    if (!b) return;
    const o = blocks.find(x => x.id !== id && x.sectionId === b.sectionId && x.day === b.day && x.start < b.end && b.start < x.end
      && !(x.start === b.start && x.end === b.end && LABISH.includes(x.type) && LABISH.includes(b.type)));
    if (o) sectionClashes.push({ text: b.sectionName + " would have two classes at once on " + DAY_NAMES[b.day] + ": " + b.token + " and " + o.token + " (" + fmtRange(Math.max(b.start, o.start), Math.min(b.end, o.end)) + ")." });
  });
  const problems = facultyClashes.concat(sectionClashes);
  return { ok: problems.length === 0, problems };
}

// not a rule, a heads-up: a faculty member now has more than the usual in a day
export function loadWarnings(blocks, editedIds, limits = { maxTotal: 4, maxTheory: 3, maxLab: 1 }) {
  const keys = new Set();
  blocks.filter(b => editedIds.includes(b.id)).forEach(b => b.faculty.forEach(f => { if (!f.external) keys.add(f.key); }));
  const per = new Map();
  const counted = new Set();
  blocks.forEach(b => {
    if (b.type === "other" || b.type === "note") return;
    b.faculty.forEach(f => {
      if (!keys.has(f.key)) return;
      if (b.combo) { const id = f.key + "|" + b.day + "|" + b.start + "|" + b.combo; if (counted.has(id)) return; counted.add(id); }
      const k = f.key + "|" + b.day;
      const r = per.get(k) || { name: f.name, day: b.day, tot: 0, th: 0, lab: 0 };
      r.tot += b.periods; if (b.type === "theory") r.th += b.periods; else r.lab += 1;
      per.set(k, r);
    });
  });
  const out = [];
  per.forEach(r => {
    if (r.tot > limits.maxTotal) out.push(r.name + " now has " + r.tot + " periods on " + DAY_NAMES[r.day] + ".");
    else if (r.th > limits.maxTheory) out.push(r.name + " now has " + r.th + " theory periods on " + DAY_NAMES[r.day] + ".");
    else if (r.lab > limits.maxLab) out.push(r.name + " now has " + r.lab + " lab sessions on " + DAY_NAMES[r.day] + ".");
  });
  return out;
}
