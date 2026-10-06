// src/timetableUpload/overlapCheck.js
// Works on "blocks": runs of back-to-back periods with the same class in one section on one day.
//   block = { id, sectionId, sectionName, day, start, end, token, subject, type, faculty, combo, periods, source }
// A faculty member is double-booked when two of their blocks overlap in real clock time on the same day,
// unless the two blocks carry the same clubbed-class code (C1, C2 ...) in different sections.

import { DAY_NAMES, fmtRange } from "./timeUtils";

export function groupBlocks(entries, source) {
  const sorted = entries.slice().sort((a, b) =>
    a.sectionId.localeCompare(b.sectionId) || a.day - b.day || a.token.localeCompare(b.token) || a.start - b.start);
  const blocks = [];
  sorted.forEach(e => {
    const last = blocks[blocks.length - 1];
    const sameFaculty = last && last.faculty.map(f => f.key).join("|") === e.faculty.map(f => f.key).join("|");
    if (last && last.sectionId === e.sectionId && last.day === e.day && last.token === e.token && last.combo === e.combo && sameFaculty && e.start <= last.end) {
      last.end = Math.max(last.end, e.end);
      last.periods += 1;
      return;
    }
    blocks.push({
      id: e.sectionId + ":" + e.day + ":" + e.start + ":" + e.token,
      sectionId: e.sectionId, sectionName: e.sectionName, day: e.day, start: e.start, end: e.end,
      token: e.token, subject: e.subject, type: e.type, faculty: e.faculty, combo: e.combo, periods: 1, source,
    });
  });
  return blocks;
}

const clash = (a, b) => a.start < b.end && b.start < a.end;
const exempt = (a, b) => !!a.combo && a.combo === b.combo && a.sectionId !== b.sectionId;
const label = b => b.sectionName + " · " + DAY_NAMES[b.day].slice(0, 3) + " " + fmtRange(b.start, b.end) + " · " + b.token;

// All blocks of every faculty member, with the upload's blocks tagged so only clashes that involve them are reported.
export function detectOverlaps(uploadBlocks, publishedBlocks) {
  const all = uploadBlocks.map(b => ({ ...b, source: "upload" })).concat(publishedBlocks.map(b => ({ ...b, source: "published" })));
  const byFaculty = new Map();
  all.forEach(b => b.faculty.forEach(f => {
    if (!byFaculty.has(f.key)) byFaculty.set(f.key, { name: f.name, blocks: [] });
    byFaculty.get(f.key).blocks.push(b);
  }));
  const conflicts = [], seen = new Set();
  byFaculty.forEach((v, key) => {
    const list = v.blocks.slice().sort((a, b) => a.day - b.day || a.start - b.start);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (a.day !== b.day) break;
        if (b.start >= a.end) break;
        if (a.source === "published" && b.source === "published") continue;
        if (!clash(a, b) || exempt(a, b)) continue;
        const id = key + "|" + [a.id + a.source, b.id + b.source].sort().join("|");
        if (seen.has(id)) continue;
        seen.add(id);
        conflicts.push({ key, name: v.name, day: a.day, a, b });
      }
    }
  });
  return conflicts.sort((x, y) => x.name.localeCompare(y.name) || x.day - y.day || x.a.start - y.a.start);
}

// Clubbed-class markers must pair up: the same code in 2+ sections, at the same time.
export function checkCombos(uploadBlocks) {
  const problems = [];
  const byCode = new Map();
  uploadBlocks.filter(b => b.combo).forEach(b => { if (!byCode.has(b.combo)) byCode.set(b.combo, []); byCode.get(b.combo).push(b); });
  byCode.forEach((list, code) => {
    const sections = new Set(list.map(b => b.sectionId));
    if (sections.size < 2) {
      problems.push({ level: "warn", text: "Clubbed marker (" + code + ") is used in only one section (" + list[0].sectionName + "). Use the same code in every section that is joined." });
      return;
    }
    list.forEach(b => {
      const mate = list.some(o => o.sectionId !== b.sectionId && o.day === b.day && clash(o, b));
      if (!mate) problems.push({ level: "warn", text: "Clubbed marker (" + code + ") in " + label(b) + " has no matching class at the same time in another section." });
    });
  });
  return problems;
}

// ── Suggestions ──────────────────────────────────────────────────────────────
function freeFor(blocks, faculty, day, start, end, ignoreIds, combo, sectionId) {
  return faculty.every(f => !blocks.some(o =>
    !ignoreIds.includes(o.id + o.source) && o.day === day && o.start < end && start < o.end &&
    o.faculty.some(x => x.key === f.key) && !(combo && o.combo === combo && o.sectionId !== sectionId)));
}

// Up to three conflict-free places to move `block`, then up to two swaps, all inside the same section.
export function suggestMoves(block, sectionSlots, allBlocks) {
  if (block.combo) return [{ text: "This is a clubbed class (" + block.combo + "). Change it in every joined section together, then upload again." }];
  const teaching = sectionSlots.filter(s => !s.brk).sort((a, b) => a.start - b.start);
  const secBlocks = allBlocks.filter(b => b.sectionId === block.sectionId && b.source === "upload");
  const k = block.periods;
  const selfId = block.id + block.source;

  // which teaching slot indexes does a block of this section occupy?
  const occupied = (d, i) => secBlocks.some(b => b.id + b.source !== selfId && b.day === d && b.start <= teaching[i].start && teaching[i].end <= b.end);
  const runOk = (i) => { for (let x = i; x < i + k; x++) { if (!teaching[x]) return false; if (x > i && teaching[x].start !== teaching[x - 1].end) return false; } return true; };

  const moves = [];
  for (let d = 0; d < DAY_NAMES.length; d++) {
    for (let i = 0; i + k <= teaching.length; i++) {
      if (!runOk(i)) continue;
      const start = teaching[i].start, end = teaching[i + k - 1].end;
      if (d === block.day && start === block.start) continue;
      let free = true;
      for (let x = i; x < i + k; x++) if (occupied(d, x)) free = false;
      if (!free) continue;
      if (!freeFor(allBlocks, block.faculty, d, start, end, [selfId], block.combo, block.sectionId)) continue;
      moves.push({ d, start, end, score: (d === block.day ? 0 : 1000) + Math.abs(start - block.start) });
    }
  }
  moves.sort((x, y) => x.score - y.score);
  const out = moves.slice(0, 3).map(m => ({
    text: "Move " + block.token + " from " + DAY_NAMES[block.day].slice(0, 3) + " " + fmtRange(block.start, block.end) + " to " + DAY_NAMES[m.d].slice(0, 3) + " " + fmtRange(m.start, m.end) +
      " — " + (block.faculty.length ? block.faculty.map(f => f.name).join(", ") + " and the section are free then." : "the section is free then."),
  }));

  if (out.length === 0) {
    secBlocks.filter(o => o.id !== block.id && o.periods === k && !o.combo).some(o => {
      const ignore = [selfId, o.id + o.source];
      const xOk = freeFor(allBlocks, block.faculty, o.day, o.start, o.end, ignore, block.combo, block.sectionId);
      const yOk = freeFor(allBlocks, o.faculty, block.day, block.start, block.end, ignore, o.combo, o.sectionId);
      if (xOk && yOk) out.push({ text: "Swap " + block.token + " (" + DAY_NAMES[block.day].slice(0, 3) + " " + fmtRange(block.start, block.end) + ") with " + o.token + " (" + DAY_NAMES[o.day].slice(0, 3) + " " + fmtRange(o.start, o.end) + ") — both faculty are free at the new times." });
      return out.length >= 2;
    });
  }
  if (out.length === 0) out.push({ text: "No free slot in this section suits all the faculty. Try changing the other section's class, or the faculty." });
  return out;
}

// One suggestion list per conflict: the upload's own side is moved; if both sides are in the upload, either can move.
export function suggestionsFor(conflict, slotsBySection, allBlocks) {
  const movable = [conflict.a, conflict.b].filter(b => b.source === "upload");
  return movable.map(b => ({ block: b, options: suggestMoves(b, slotsBySection[b.sectionId] || [], allBlocks) }));
}

// ── Workload ─────────────────────────────────────────────────────────────────
export function computeWorkload(blocks) {
  const rows = new Map();
  const counted = new Set();
  blocks.forEach(b => {
    if (b.type === "note") return;
    b.faculty.forEach(f => {
      if (b.combo) { const id = f.key + "|" + b.day + "|" + b.start + "|" + b.combo; if (counted.has(id)) return; counted.add(id); }
      if (!rows.has(f.key)) rows.set(f.key, { key: f.key, name: f.name, phone: f.phone, external: f.external, theory: 0, lab: 0, drawing: 0, other: 0, asst: 0, perDay: [0, 0, 0, 0, 0, 0] });
      const r = rows.get(f.key);
      r[b.type] = (r[b.type] || 0) + b.periods;
      r.perDay[b.day] += b.periods;
      if (f.role === "asst") r.asst += b.periods;
    });
  });
  return Array.from(rows.values()).map(r => ({ ...r, teaching: r.theory + r.lab + r.drawing, overall: r.theory + r.lab + r.drawing + r.other }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
