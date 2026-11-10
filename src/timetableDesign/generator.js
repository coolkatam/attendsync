// src/timetableDesign/generator.js
// Builds timetables from the admin's answers. Pure logic: no React, no Firebase.
//
//   buildSpec(...)       turns the answers + what the portal knows into "units" to place and a list of problems
//   designVersions(...)  places every unit several ways and returns the best distinct, clash-free timetables
//
// A unit is one class to place: it covers `size` back-to-back periods and belongs to one or more sections
// (one for an ordinary class, several for a class joined across sections). It carries one block per section/subject
// that sits in it (several for labs that run together as batches). Rules that are never broken: nobody in two places
// at once, the daily limits, availability, clashes with timetables already published for other years, a section's
// one-class-at-a-time. Preferences (avoid first/last period, spread a subject over the week, ...) are weighed, and
// any that had to give way are reported.

import { detectOverlaps } from "../timetableUpload/overlapCheck";
import { buildTimings, periodsOn, contiguous, num, DAY_LONG } from "./designModel";
import { nameKey } from "../timetableUpload/smartParser";

const slug = s => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const lower = s => String(s || "").toLowerCase();

function splitSizes(total, block) {
  const out = [];
  let rem = total;
  const b = Math.max(1, block);
  while (rem >= b) { out.push(b); rem -= b; }
  if (rem > 0) out.push(rem);
  return out;
}

// ── spec ─────────────────────────────────────────────────────────────────────────────────
// sections: [{ id, name, subjects: [{ name, token, type, faculty: [phone, ...] }] }]
// people:   [{ phone, name }]
// published: blocks already published for OTHER years (they keep their real clock times)
export function buildSpec({ year, a, sections, people, published = [] }) {
  const problems = [];
  const timings = buildTimings(a);
  if (timings.error) return { spec: null, problems: [{ level: "error", text: timings.error }] };
  const D = Number(a.days);
  const P = Array.from({ length: D }, (_, d) => periodsOn(a, d));
  const personBy = new Map(people.map(p => [p.phone, p]));
  const facOf = (phone, i) => { const p = personBy.get(phone); return p ? { key: phone, name: p.name, phone, external: false, role: i === 0 ? "main" : "asst" } : null; };

  const maxTotal = num(a.maxTotalPerDay, 4), maxTheory = num(a.maxTheoryPerDay, 3), maxLab = num(a.maxLabPerDay, 1);
  const maxRun = a.consecutive ? Math.max(1, num(a.maxRun, 2)) : 1;

  let uid = 0;
  const units = [];
  const addUnit = u => { units.push({ id: "u" + (++uid), kind: "flex", fixedAt: null, avoidFirst: false, avoidLast: false, ...u }); return units[units.length - 1]; };

  const loadOf = name => a.loads[name] || {};
  const typeOf = sub => { const t = lower(sub.type); return t === "lab" ? "lab" : t === "drawing" ? "drawing" : "theory"; };

  // subjects that are handled by a parallel group or a joint class are skipped in the plain pass
  const consumed = new Set(); // sectionId|subject
  const comboOf = new Map();  // joint spec index -> "C1"..

  // joint classes
  (a.joint || []).forEach((j, ji) => {
    const secs = sections.filter(s => (j.sections || []).includes(s.id) && s.subjects.some(x => x.name === j.subject));
    if (secs.length < 2) { problems.push({ level: "warn", text: "The joint class \"" + j.subject + "\" needs at least two sections that have it. It is being placed separately in each section." }); return; }
    const first = secs[0].subjects.find(x => x.name === j.subject);
    const type = typeOf(first);
    const load = loadOf(j.subject);
    const total = num(load.periods, 0);
    const block = type === "theory" ? Math.max(1, num(load.block, 1)) : Math.max(1, num(load.block, num(a.labBlock, 3)));
    if (total <= 0) { problems.push({ level: "warn", text: "\"" + j.subject + "\" has no periods per week, so it isn't placed." }); secs.forEach(s => consumed.add(s.id + "|" + j.subject)); return; }
    const combo = "C" + (ji + 1);
    comboOf.set(ji, combo);
    splitSizes(total, block).forEach(size => {
      const blocks = secs.map(s => {
        const sub = s.subjects.find(x => x.name === j.subject);
        return { sectionId: s.id, sectionName: s.name, token: sub.token, subject: sub.name, type, faculty: sub.faculty.map((p, i) => facOf(p, i)).filter(Boolean), combo };
      });
      const facs = Array.from(new Set(blocks.flatMap(b => b.faculty.map(f => f.key))));
      addUnit({ size, type, teaching: true, sectionIds: secs.map(s => s.id), blocks, facs, avoidFirst: !!load.avoidFirst, avoidLast: !!load.avoidLast });
    });
    secs.forEach(s => consumed.add(s.id + "|" + j.subject));
  });

  // labs that run together as batches
  (a.parallel || []).forEach(group => {
    if (!group || group.length < 2) return;
    sections.forEach(s => {
      const subs = group.map(n => s.subjects.find(x => x.name === n));
      if (subs.some(x => !x) || subs.some(x => consumed.has(s.id + "|" + x.name))) return;
      const loads = subs.map(x => num(loadOf(x.name).periods, 0));
      if (new Set(loads).size > 1) problems.push({ level: "warn", text: "In " + s.name + " the labs " + group.join(" / ") + " run together but have different periods per week (" + loads.join(", ") + "). The first one's number is used." });
      const total = loads[0];
      if (total <= 0) return;
      const block = Math.max(1, num(loadOf(subs[0].name).block, num(a.labBlock, 3)));
      splitSizes(total, block).forEach(size => {
        const blocks = subs.map(sub => ({ sectionId: s.id, sectionName: s.name, token: sub.token, subject: sub.name, type: typeOf(sub), faculty: sub.faculty.map((p, i) => facOf(p, i)).filter(Boolean), combo: "" }));
        const facs = Array.from(new Set(blocks.flatMap(b => b.faculty.map(f => f.key))));
        addUnit({ size, type: "lab", teaching: true, sectionIds: [s.id], blocks, facs });
      });
      subs.forEach(x => consumed.add(s.id + "|" + x.name));
    });
  });

  // everything else: one subject in one section
  sections.forEach(s => s.subjects.forEach(sub => {
    if (consumed.has(s.id + "|" + sub.name)) return;
    const load = loadOf(sub.name);
    const total = num((load.perSection || {})[s.id], num(load.periods, 0));
    if (!(total > 0)) { if (!load.perSection || (load.perSection || {})[s.id] === undefined) problems.push({ level: "warn", text: s.name + ": \"" + sub.name + "\" has no periods per week, so it isn't placed." }); return; }
    const type = typeOf(sub);
    const block = type === "theory" ? Math.max(1, num(load.block, 1)) : Math.max(1, num(load.block, num(a.labBlock, 3)));
    const sizes = splitSizes(total, block);
    if (type !== "theory" && total % block !== 0) problems.push({ level: "warn", text: s.name + ": " + sub.name + " has " + total + " periods a week, which isn't a multiple of its " + block + "-period sessions. One shorter session of " + (total % block) + " is added." });
    const faculty = sub.faculty.map((p, i) => facOf(p, i)).filter(Boolean);
    if (faculty.length === 0) problems.push({ level: "warn", text: s.name + ": \"" + sub.name + "\" has no faculty assigned in the portal. It is placed without any faculty clash check." });
    sizes.forEach(size => addUnit({
      size, type, teaching: true, sectionIds: [s.id],
      blocks: [{ sectionId: s.id, sectionName: s.name, token: sub.token, subject: sub.name, type, faculty, combo: "" }],
      facs: faculty.map(f => f.key), avoidFirst: !!load.avoidFirst, avoidLast: !!load.avoidLast,
    }));
  }));

  // extra activities: CRT, sports, library ...
  (a.extras || []).forEach(e => {
    const token = String(e.name || "").trim().toUpperCase();
    if (!token) return;
    let trainer = null;
    if (e.sameTrainer && e.trainer) {
      if (e.trainer.kind === "portal" && personBy.has(e.trainer.phone)) trainer = facOf(e.trainer.phone, 0);
      else if (e.trainer.kind === "ext" && String(e.trainer.name || "").trim()) trainer = { key: "ext:" + (nameKey(e.trainer.name) || slug(e.trainer.name)), name: String(e.trainer.name).trim(), phone: null, external: true, role: "main" };
    }
    sections.forEach(s => {
      const n = num((e.perSection || {})[s.id], num(e.periods, 0));
      if (!(n > 0)) return;
      const mk = size => ({
        size, type: "other", teaching: false, sectionIds: [s.id],
        blocks: [{ sectionId: s.id, sectionName: s.name, token, subject: token, type: "other", faculty: trainer ? [trainer] : [], combo: "" }],
        facs: trainer ? [trainer.key] : [],
      });
      if (e.mode === "fixed") {
        const rows = (e.fixed || {})[s.id] || [];
        let filled = 0;
        rows.slice(0, n).forEach(r => {
          if (r.day === "" || r.day === undefined || r.period === "" || r.period === undefined) return;
          const d = Number(r.day), p = Number(r.period) - 1;
          if (!(d >= 0 && d < D) || !(p >= 0 && p < P[d])) { problems.push({ level: "error", text: s.name + ": the " + token + " slot " + DAY_LONG[d] + " period " + (p + 1) + " doesn't exist in your timetable." }); return; }
          filled++;
          addUnit({ ...mk(1), kind: "fixed", fixedAt: { d, p } });
        });
        if (filled < n) problems.push({ level: "error", text: s.name + ": " + token + " needs " + n + " fixed slot" + (n === 1 ? "" : "s") + " a week but only " + filled + " " + (filled === 1 ? "has" : "have") + " a day and period." });
      } else {
        splitSizes(n, Math.max(1, num(e.block, 1))).forEach(size => addUnit(mk(size)));
      }
    });
  });

  // per-subject, per-section cap on how many periods may fall on one day
  const dayCap = {};
  units.forEach(u => u.blocks.forEach(b => {
    const k = b.sectionId + "|" + b.subject;
    dayCap[k] = Math.max(dayCap[k] || 0, u.size);
  }));
  const totals = {};
  units.forEach(u => u.blocks.forEach(b => { const k = b.sectionId + "|" + b.subject; totals[k] = (totals[k] || 0) + u.size; }));
  Object.keys(dayCap).forEach(k => { dayCap[k] = a.repeatSameDay ? 99 : Math.max(dayCap[k], Math.ceil(totals[k] / D)); });

  // availability
  const blocked = {};
  (a.availability || []).forEach(r => {
    if (!r.phone) return;
    const grid = blocked[r.phone] || (blocked[r.phone] = P.map(n => new Array(n).fill(false)));
    for (let d = 0; d < D; d++) for (let p = 0; p < P[d]; p++) {
      const on = !!(r.cells || {})[d + "-" + p];
      if (r.mode === "only") { if (!on) grid[d][p] = true; } else if (on) grid[d][p] = true;
    }
  });

  // timetables already published for other years: faculty busy by clock time
  const pubBusy = {};
  published.forEach(b => (b.faculty || []).forEach(f => { (pubBusy[f.key] = pubBusy[f.key] || P.map(() => [])); if (b.day < D) pubBusy[f.key][b.day].push([b.start, b.end]); }));

  const spec = {
    year, a, timings, D, P, units, dayCap, blocked, pubBusy,
    sections: sections.map(s => ({ id: s.id, name: s.name })),
    publishedBlocks: published,
    limits: { maxTotal, maxTheory, maxLab, maxRun },
    adj: timings.periods.map((_, i) => contiguous(timings, i)),
  };

  precheck(spec, problems, people);
  return { spec, problems };
}

// Things that make a timetable impossible whatever the arrangement, said in plain words before any searching.
function precheck(spec, problems, people) {
  const { units, D, P, blocked, limits, a } = spec;
  const nameOf = new Map(people.map(p => [p.phone, p.name]));

  spec.sections.forEach(s => {
    const need = units.filter(u => u.sectionIds.includes(s.id)).reduce((t, u) => t + u.size, 0);
    const have = P.reduce((t, n) => t + n, 0);
    if (need > have) problems.push({ level: "error", text: s.name + " needs " + need + " periods a week but the week has only " + have + ". Reduce some subjects' periods or add periods." });
  });

  // faculty: weekly demand against what the daily limits and availability allow
  const per = {};
  units.forEach(u => u.facs.forEach(key => {
    if (key.startsWith("ext:") || !u.teaching) return;
    const r = per[key] || (per[key] = { total: 0, theory: 0, lab: 0 });
    r.total += u.size;
    if (u.type === "theory") r.theory += u.size; else r.lab += 1;
  }));
  Object.keys(per).forEach(key => {
    const free = d => { let n = 0; for (let p = 0; p < P[d]; p++) if (!(blocked[key] && blocked[key][d][p])) n++; return n; };
    let capTotal = 0, capTheory = 0, capLab = 0;
    for (let d = 0; d < D; d++) { const f = free(d); capTotal += Math.min(limits.maxTotal, f); capTheory += Math.min(limits.maxTheory, f); capLab += Math.min(limits.maxLab, f); }
    const nm = nameOf.get(key) || key, r = per[key];
    if (r.total > capTotal) problems.push({ level: "error", text: nm + " has " + r.total + " periods to teach a week, but with at most " + limits.maxTotal + " a day (and the days they are unavailable) no more than " + capTotal + " fit. Move a subject to another faculty or raise the daily limit." });
    else if (r.theory > capTheory) problems.push({ level: "error", text: nm + " has " + r.theory + " theory periods a week, but at most " + capTheory + " fit within " + limits.maxTheory + " theory periods a day." });
    else if (r.lab > capLab) problems.push({ level: "error", text: nm + " has " + r.lab + " lab sessions a week, but at most " + capLab + " fit within " + limits.maxLab + " a day." });
  });

  // fixed slots must not collide with each other
  const seen = new Map();
  units.filter(u => u.kind === "fixed").forEach(u => {
    const { d, p } = u.fixedAt;
    u.sectionIds.forEach(sid => {
      const k = "s|" + sid + "|" + d + "|" + p;
      if (seen.has(k)) problems.push({ level: "error", text: DAY_LONG[d] + " period " + (p + 1) + " is given to two fixed activities in " + u.blocks[0].sectionName + " (" + seen.get(k) + " and " + u.blocks[0].token + ")." });
      seen.set(k, u.blocks[0].token);
    });
    u.facs.forEach(key => {
      const k = "f|" + key + "|" + d + "|" + p;
      if (seen.has(k)) problems.push({ level: "error", text: "The trainer for " + u.blocks[0].token + " is given " + DAY_LONG[d] + " period " + (p + 1) + " in two sections (" + seen.get(k) + " and " + u.blocks[0].sectionName + "). One trainer can't be in two sections at once." });
      seen.set(k, u.blocks[0].sectionName);
    });
  });
  if (D < 1) problems.push({ level: "error", text: "There are no working days." });
  if (units.length === 0) problems.push({ level: "error", text: "There is nothing to place: no subject has any periods per week." });
  void a;
}

// ── plan ─────────────────────────────────────────────────────────────────────────────────
function mulberry32(seed) {
  let t = seed >>> 0;
  return () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
}

class Plan {
  constructor(spec) {
    this.s = spec;
    this.D = spec.D; this.P = spec.P;
    this.per = spec.timings.periods;
    this.sec = {}; this.secDay = {};
    spec.sections.forEach(x => { this.sec[x.id] = this.P.map(n => new Array(n).fill(null)); this.secDay[x.id] = this.P.map(() => new Set()); });
    this.fac = {}; this.facDay = {};
    this.pos = new Map();
  }
  facRow(key) {
    if (!this.fac[key]) { this.fac[key] = this.P.map(n => new Array(n).fill(null)); this.facDay[key] = this.P.map(() => new Set()); }
    return this.fac[key];
  }
  fits(u, d, p) {
    if (p < 0 || p + u.size > this.P[d]) return false;
    const crossOk = this.s.a.labAcrossBreak && (u.type === "lab" || u.type === "drawing");
    for (let i = p; i < p + u.size - 1; i++) if (!this.s.adj[i] && !crossOk) return false;
    return true;
  }
  // who is in the way (null when something that can't be moved is: availability, a published class)
  inTheWay(u, d, p) {
    const k = u.size, start = this.per[p].start, end = this.per[p + k - 1].end;
    const out = new Set();
    for (const sid of u.sectionIds) for (let q = p; q < p + k; q++) { const o = this.sec[sid][d][q]; if (o && o !== u) out.add(o); }
    for (const key of u.facs) {
      const bl = this.s.blocked[key];
      if (bl) for (let q = p; q < p + k; q++) if (bl[d][q]) return null;
      const pb = this.s.pubBusy[key];
      if (pb && pb[d].some(([x, y]) => x < end && start < y)) return null;
      const row = this.facRow(key)[d];
      for (let q = p; q < p + k; q++) { const o = row[q]; if (o && o !== u) out.add(o); }
    }
    return out;
  }
  // limits that depend on what else is placed that day (ignoring the units in `ignore`)
  limitsOk(u, d, p, ignore) {
    const L = this.s.limits;
    if (u.teaching) {
      for (const key of u.facs) {
        if (key.startsWith("ext:")) continue;
        this.facRow(key);
        let th = 0, lab = 0, tot = 0;
        this.facDay[key][d].forEach(o => { if (ignore.has(o) || !o.teaching) return; tot += o.size; if (o.type === "theory") th += o.size; else lab += 1; });
        tot += u.size; if (u.type === "theory") th += u.size; else lab += 1;
        if (th > L.maxTheory || lab > L.maxLab || tot > L.maxTotal) return false;
        if (!this.runOk(key, d, u, p, ignore)) return false;
      }
    }
    for (const b of u.blocks) {
      const k = b.sectionId + "|" + b.subject;
      let have = 0;
      this.secDay[b.sectionId][d].forEach(o => { if (ignore.has(o)) return; o.blocks.forEach(x => { if (x.sectionId === b.sectionId && x.subject === b.subject) have += o.size; }); });
      if (have + u.size > (this.s.dayCap[k] || 99)) return false;
    }
    return true;
  }
  runOk(key, d, u, p, ignore) {
    const n = this.P[d], occ = new Array(n).fill(null), row = this.fac[key][d];
    for (let q = 0; q < n; q++) { const o = row[q]; if (o && !ignore.has(o) && o.teaching) occ[q] = o; }
    for (let q = p; q < p + u.size; q++) occ[q] = u;
    let chain = 0, prev = null;
    for (let q = 0; q < n; q++) {
      if (q > 0 && !this.s.adj[q - 1]) { chain = 0; prev = null; }
      const o = occ[q];
      if (o) { if (o !== prev) { chain++; prev = o; } if (chain > this.s.limits.maxRun) return false; } else { chain = 0; prev = null; }
    }
    return true;
  }
  cost(u, d, p, rnd) {
    const a = this.s.a;
    let c = 0;
    const last = p + u.size - 1 === this.P[d] - 1;
    if (u.avoidFirst && p === 0) c += 60;
    if (u.avoidLast && last) c += 60;
    for (const b of u.blocks) {
      let today = 0;
      this.secDay[b.sectionId][d].forEach(o => o.blocks.forEach(x => { if (x.sectionId === b.sectionId && x.subject === b.subject) today += o.size; }));
      c += today * 40;
      for (const dd of [d - 1, d + 1]) if (dd >= 0 && dd < this.D) this.secDay[b.sectionId][dd].forEach(o => o.blocks.forEach(x => { if (x.sectionId === b.sectionId && x.subject === b.subject) c += 3; }));
      let filled = 0;
      this.sec[b.sectionId][d].forEach(o => { if (o) filled++; });
      c += filled * 1.2;
    }
    for (const key of u.facs) {
      if (key.startsWith("ext:")) continue;
      this.facRow(key);
      let tot = 0;
      this.facDay[key][d].forEach(o => { if (o.teaching) tot += o.size; });
      c += tot * 3;
    }
    if (u.type === "lab" || u.type === "drawing") {
      const half = Math.ceil(this.P[d] / 2);
      if (a.labPref === "morning" && p >= half) c += 25;
      if (a.labPref === "afternoon" && p < half) c += 25;
    }
    c += p * 0.8 + rnd() * 7;
    return c;
  }
  place(u, d, p) {
    for (const sid of u.sectionIds) { for (let q = p; q < p + u.size; q++) this.sec[sid][d][q] = u; this.secDay[sid][d].add(u); }
    for (const key of u.facs) { const row = this.facRow(key)[d]; for (let q = p; q < p + u.size; q++) row[q] = u; this.facDay[key][d].add(u); }
    this.pos.set(u, { d, p });
  }
  unplace(u) {
    const at = this.pos.get(u);
    if (!at) return;
    const { d, p } = at;
    for (const sid of u.sectionIds) { for (let q = p; q < p + u.size; q++) this.sec[sid][d][q] = null; this.secDay[sid][d].delete(u); }
    for (const key of u.facs) { const row = this.fac[key][d]; for (let q = p; q < p + u.size; q++) row[q] = null; this.facDay[key][d].delete(u); }
    this.pos.delete(u);
  }
  positions(u) {
    const out = [];
    for (let d = 0; d < this.D; d++) for (let p = 0; p + u.size <= this.P[d]; p++) if (this.fits(u, d, p)) out.push([d, p]);
    return out;
  }
  // the cheapest place that breaks no rule
  bestFree(u, rnd) {
    let best = null;
    for (const [d, p] of this.positions(u)) {
      const way = this.inTheWay(u, d, p);
      if (!way || way.size > 0) continue;
      if (!this.limitsOk(u, d, p, EMPTY)) continue;
      const c = this.cost(u, d, p, rnd);
      if (!best || c < best.c) best = { d, p, c };
    }
    return best;
  }
  // when nothing is free: the place that needs the fewest other classes moved out of the way
  bestByMoving(u, rnd) {
    let best = null;
    for (const [d, p] of this.positions(u)) {
      const way = this.inTheWay(u, d, p);
      if (!way || way.size === 0 || way.size > 3) continue;
      let ok = true;
      way.forEach(o => { if (o.kind === "fixed") ok = false; });
      if (!ok || !this.limitsOk(u, d, p, way)) continue;
      let pen = way.size * 200;
      way.forEach(o => { pen += (o.moved || 0) * 40; });
      const c = pen + this.cost(u, d, p, rnd);
      if (!best || c < best.c) best = { d, p, c, way };
    }
    return best;
  }
  // why a unit has nowhere to go, in plain words
  why(u) {
    const reasons = { section: 0, faculty: 0, away: 0, limit: 0 };
    let who = null;
    for (const [d, p] of this.positions(u)) {
      const k = u.size, start = this.per[p].start, end = this.per[p + k - 1].end;
      let secBusy = false;
      for (const sid of u.sectionIds) for (let q = p; q < p + k; q++) if (this.sec[sid][d][q]) secBusy = true;
      if (secBusy) { reasons.section++; continue; }
      let away = false, busy = false;
      for (const key of u.facs) {
        const bl = this.s.blocked[key];
        if (bl) for (let q = p; q < p + k; q++) if (bl[d][q]) { away = true; who = who || key; }
        const pb = this.s.pubBusy[key];
        if (pb && pb[d].some(([x, y]) => x < end && start < y)) { away = true; who = who || key; }
        const row = this.facRow(key)[d];
        for (let q = p; q < p + k; q++) if (row[q]) { busy = true; who = who || key; }
      }
      if (away) { reasons.away++; continue; }
      if (busy) { reasons.faculty++; continue; }
      reasons.limit++;
    }
    return { reasons, who };
  }
}
const EMPTY = new Set();

// ── generation ───────────────────────────────────────────────────────────────────────────
function difficulty(spec, u, rnd, load) {
  let w = u.size * 10 + u.facs.length * 3 + u.sectionIds.length * 4;
  u.facs.forEach(k => { w += (load[k] || 0) / 6; });
  if (u.type === "lab" || u.type === "drawing") w += 8;
  if (u.avoidFirst || u.avoidLast) w += 2;
  return w + rnd() * 4;
}

export function generate(spec, seed) {
  const rnd = mulberry32(seed);
  const plan = new Plan(spec);
  const load = {};
  spec.units.forEach(u => u.facs.forEach(k => { load[k] = (load[k] || 0) + u.size; }));
  const units = spec.units.map(u => { u.moved = 0; return u; });

  const failures = [];
  units.filter(u => u.kind === "fixed").forEach(u => {
    const { d, p } = u.fixedAt;
    const way = plan.inTheWay(u, d, p);
    if (!way || way.size > 0 || !plan.fits(u, d, p)) failures.push(u); else plan.place(u, d, p);
  });

  const queue = units.filter(u => u.kind !== "fixed").map(u => ({ u, w: difficulty(spec, u, rnd, load) })).sort((x, y) => y.w - x.w).map(x => x.u);
  let steps = 0;
  const MAX = 4000 + units.length * 60;
  const stuck = [];
  while (queue.length && steps < MAX) {
    steps++;
    const u = queue.shift();
    const free = plan.bestFree(u, rnd);
    if (free) { plan.place(u, free.d, free.p); continue; }
    const mv = u.moved > 40 ? null : plan.bestByMoving(u, rnd);
    if (!mv) { stuck.push(u); continue; }
    mv.way.forEach(o => { plan.unplace(o); o.moved = (o.moved || 0) + 1; queue.push(o); });
    u.moved++;
    plan.place(u, mv.d, mv.p);
  }
  const unplaced = failures.concat(queue, stuck);
  return { plan, unplaced };
}

// blocks in the same shape the upload reads, so the same overlap check and publish steps work on them
function toBlocks(spec, plan) {
  const out = [];
  plan.pos.forEach((at, u) => {
    const { d, p } = at;
    const start = spec.timings.periods[p].start, end = spec.timings.periods[p + u.size - 1].end;
    u.blocks.forEach(b => out.push({
      id: b.sectionId + ":" + d + ":" + start + ":" + b.token,
      sectionId: b.sectionId, sectionName: b.sectionName, day: d, start, end,
      token: b.token, subject: b.subject, type: b.type, faculty: b.faculty, combo: b.combo || "", periods: u.size, source: "design",
    }));
  });
  return out.sort((x, y) => x.sectionId.localeCompare(y.sectionId) || x.day - y.day || x.start - y.start);
}

// preferences that had to give way
function relaxed(spec, plan) {
  const out = [];
  const last = d => spec.P[d] - 1;
  plan.pos.forEach((at, u) => {
    const { d, p } = at;
    u.blocks.forEach(b => {
      if (u.avoidFirst && p === 0) out.push(b.sectionName + ": " + b.token + " is in the first period on " + DAY_LONG[d] + ".");
      if (u.avoidLast && p + u.size - 1 === last(d)) out.push(b.sectionName + ": " + b.token + " is in the last period on " + DAY_LONG[d] + ".");
    });
  });
  const seen = new Set();
  plan.pos.forEach((at, u) => {
    u.blocks.forEach(b => {
      const k = b.sectionId + "|" + b.subject + "|" + at.d;
      if (u.size === 1 && !spec.a.repeatSameDay) {
        const n = Array.from(plan.secDay[b.sectionId][at.d]).filter(o => o.blocks.some(x => x.subject === b.subject)).length;
        if (n > 1 && !seen.has(k)) { seen.add(k); out.push(b.sectionName + ": " + b.token + " comes twice on " + DAY_LONG[at.d] + "."); }
      }
    });
  });
  return out;
}

// every hard rule, re-checked on the finished blocks (the generator's own bookkeeping isn't trusted)
export function verify(spec, blocks) {
  const issues = [];
  const conflicts = detectOverlaps(blocks, spec.publishedBlocks.map(b => ({ ...b })));
  conflicts.forEach(c => issues.push(c.name + " is double-booked on " + DAY_LONG[c.day] + " (" + c.a.sectionName + " " + c.a.token + " and " + c.b.sectionName + " " + c.b.token + ")."));
  const L = spec.limits;
  const per = {};
  const counted = new Set();
  blocks.forEach(b => {
    if (b.type === "other") return;
    b.faculty.forEach(f => {
      if (f.external) return;
      if (b.combo) { const id = f.key + "|" + b.day + "|" + b.start + "|" + b.combo; if (counted.has(id)) return; counted.add(id); }
      const r = per[f.key + "|" + b.day] || (per[f.key + "|" + b.day] = { name: f.name, day: b.day, th: 0, lab: 0, tot: 0 });
      r.tot += b.periods;
      if (b.type === "theory") r.th += b.periods; else r.lab += 1;
    });
  });
  Object.values(per).forEach(r => {
    if (r.th > L.maxTheory) issues.push(r.name + " has " + r.th + " theory periods on " + DAY_LONG[r.day] + ".");
    if (r.lab > L.maxLab) issues.push(r.name + " has " + r.lab + " lab sessions on " + DAY_LONG[r.day] + ".");
    if (r.tot > L.maxTotal) issues.push(r.name + " has " + r.tot + " periods on " + DAY_LONG[r.day] + ".");
  });
  return issues;
}

function signature(plan) {
  const parts = [];
  plan.pos.forEach((at, u) => parts.push(u.id + "@" + at.d + "," + at.p));
  return parts.sort().join("|");
}
function similarity(a, b) {
  const A = new Set(a.split("|")), B = b.split("|");
  let same = 0;
  B.forEach(x => { if (A.has(x)) same++; });
  return same / Math.max(1, B.length);
}

// Reasons, in plain words, why these units could not be placed.
function explain(spec, plan, unplaced, people) {
  const nameOf = new Map(people.map(p => [p.phone, p.name]));
  return unplaced.slice(0, 12).map(u => {
    const b = u.blocks[0];
    const { reasons, who } = plan.why(u);
    const total = reasons.section + reasons.faculty + reasons.away + reasons.limit;
    let why = "";
    if (total === 0) why = "no place has " + u.size + " free back-to-back period" + (u.size === 1 ? "" : "s") + " in a row";
    else {
      const top = Object.entries(reasons).sort((x, y) => y[1] - x[1])[0][0];
      const person = who ? (nameOf.get(who) || who) : "a faculty member";
      why = top === "section" ? "the section's periods are already full where " + person + " could take it"
        : top === "faculty" ? person + " is already teaching in every period that is free for the section"
        : top === "away" ? person + " is unavailable, or busy in another year's published timetable, in every period that is free"
        : "every free period would break a daily limit (theory, lab, total or back-to-back) for " + person;
    }
    return "Could not place " + b.token + " (" + u.blocks.map(x => x.sectionName).filter((v, i, arr) => arr.indexOf(v) === i).join(", ") + ", " + u.size + " period" + (u.size === 1 ? "" : "s") + "): " + why + ".";
  });
}

// Several distinct, clash-free versions. `skip` are signatures of versions already shown.
export function designVersions(spec, people, { count = 3, tries = 60, skip = [], timeMs = 8000, seed = Date.now() } = {}) {
  const t0 = Date.now();
  const found = [];
  let bestPartial = null, attempts = 0, completes = 0;
  for (let i = 0; i < tries && Date.now() - t0 < timeMs; i++) {
    attempts++;
    const { plan, unplaced } = generate(spec, seed + i * 7919);
    if (unplaced.length) {
      if (!bestPartial || unplaced.length < bestPartial.unplaced.length) bestPartial = { plan, unplaced };
      continue;
    }
    const blocks = toBlocks(spec, plan);
    const issues = verify(spec, blocks);
    if (issues.length) continue;
    completes++;
    const sig = signature(plan);
    if (skip.includes(sig) || found.some(f => f.sig === sig)) continue;
    const rel = relaxed(spec, plan);
    found.push({ sig, blocks, relaxed: rel, cost: rel.length });
    if (found.length >= count * 4) break;
  }
  found.sort((x, y) => x.cost - y.cost);
  const chosen = [];
  [0.85, 0.95, 1.01].forEach(limit => {
    found.forEach(f => {
      if (chosen.length >= count || chosen.includes(f)) return;
      if (chosen.every(c => similarity(c.sig, f.sig) < limit)) chosen.push(f);
    });
  });
  const result = { versions: chosen, attempts, completes, problems: [] };
  if (chosen.length === 0 && bestPartial) result.problems = explain(spec, bestPartial.plan, bestPartial.unplaced, people);
  return result;
}
