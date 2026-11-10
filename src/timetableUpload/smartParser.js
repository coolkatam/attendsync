// src/timetableUpload/smartParser.js
// Reads any coordinator's Excel timetable without a template.
//   * finds every timetable block: a header row of time ranges, day names down the side, a section title above
//   * matches the section title to the portal's sections, cell text to the section's subjects, and names to the portal's faculty
//   * subjects with no faculty written in the cell take them from the sheet's own SUBJECT / FACULTY table, then from the portal
// Anything it cannot match with confidence is returned in `pending` for the coordinator to settle on screen
// (`res` carries those answers back in on the next run), and everything else becomes entries as before:
//   { sectionId, sectionName, day, col, start, end, token, subject, type, faculty: [{ key, name, phone, external, role }], combo }.

import * as XLSX from "xlsx";
import { dayIndex, parseRangeLoose, editDistance, BREAK_RE } from "./timeUtils";
import { guessType } from "../sections/subjectUtils";

const COMBO_RE = /\(\s*C\s*(\d+)\s*\)/i;
const TITLES = new Set(["dr", "mr", "mrs", "ms", "miss", "prof", "professor", "sri", "shri", "smt", "mx", "er"]);
const TITLE_IN_TEXT = /\b(dr|mr|mrs|ms|miss|prof|professor|sri|shri|smt|mx)\b\.?/i;
const STOP = new Set(["and", "of", "the", "for", "to", "in", "a", "an"]);
const EXTRAS = /^(crt|lib|library|sports?|games?|mentoring|counsell?ing|ncc|nss|seminar|tutorial|remedial|yoga|project|mini\s*project|placement|training|proctoring|club|assembly|zero\s*hour)\b/i;

// ── small helpers ──
const alnum = s => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const clean = s => String(s == null ? "" : s).replace(/\s+/g, " ").trim();

function sheetRows(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "", blankrows: true }).map(r => r.map(v => String(v == null ? "" : v)));
  const ref = ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]) : { s: { r: 0, c: 0 } };
  (ws["!merges"] || []).forEach(m => {
    const v = rows[m.s.r - ref.s.r] && rows[m.s.r - ref.s.r][m.s.c - ref.s.c];
    if (!v) return;
    for (let r = m.s.r; r <= m.e.r; r++) {
      for (let c = m.s.c; c <= m.e.c; c++) {
        const rr = r - ref.s.r, cc = c - ref.s.c;
        if (!rows[rr]) continue;
        while (rows[rr].length <= cc) rows[rr].push("");
        if (rows[rr][cc] === "") rows[rr][cc] = v;
      }
    }
  });
  return rows;
}

function toMin(h, m) {
  h = Number(h); m = Number(m);
  if (h > 23 || m > 59) return null;
  return (h >= 1 && h <= 7 ? h + 12 : h) * 60 + m;
}
// "Period 1 08:50 - 09:50", "8.30-9.30", "12:30–1:15" → { start, end } (minutes) or null
export function extractRange(text) {
  const s = clean(text);
  const m = /(\d{1,2})\s*[:.]\s*(\d{2})\s*(?:-|–|—|\bto\b)\s*(\d{1,2})\s*[:.]\s*(\d{2})/i.exec(s);
  if (m) {
    const a = toMin(m[1], m[2]), b = toMin(m[3], m[4]);
    return a !== null && b !== null && b > a ? { start: a, end: b } : null;
  }
  return parseRangeLoose(s);
}

const isBreakWord = v => { const t = clean(v); return BREAK_RE.test(t) || BREAK_RE.test(t.replace(/\s+/g, "")); };
const isFree = v => { const t = clean(v); return t === "" || /^[-–—.]+$/.test(t) || /^free$/i.test(t); };
const isBreakCell = v => { const t = clean(v); return isBreakWord(t) || /^[A-Za-z*•]$/.test(t); };

// ── names ──
function nameTokens(raw) {
  return String(raw || "").toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter(t => t && !TITLES.has(t));
}
export const nameKey = raw => nameTokens(raw).join(" ");
const isInitial = t => t.length <= 2;
const wordsOf = t => t.filter(x => !isInitial(x));
const initialsOf = t => t.filter(isInitial);
function mergeInitials(t) {
  const out = [];
  for (let i = 0; i < t.length; i++) {
    if (isInitial(t[i]) && i + 1 < t.length && !isInitial(t[i + 1])) { out.push(t[i] + t[i + 1]); i++; } else out.push(t[i]);
  }
  return out;
}

function scoreTokens(a, b) {
  const wa = wordsOf(a), wb = wordsOf(b);
  if (!wa.length || !wb.length) return 0;
  if (a.join(" ") === b.join(" ")) return 100;
  const used = new Set(), usedA = new Set();
  let exact = 0, fuzzy = 0;
  wa.forEach((w, i) => {
    let j = wb.findIndex((x, k) => !used.has(k) && x === w);
    if (j >= 0) { used.add(j); usedA.add(i); exact++; return; }
    j = wb.findIndex((x, k) => !used.has(k) && Math.max(x.length, w.length) >= 5 && editDistance(x, w) <= 1);
    if (j >= 0) { used.add(j); usedA.add(i); fuzzy++; }
  });
  const matched = exact + fuzzy;
  if (!matched) return 0;
  const sCov = matched / wa.length, pCov = matched / wb.length;
  // one side writes initials where the other spells the words out: "K P V Krishna Varma" and "Kola Poornodaya Venkata Krishna Varma"
  if (!fuzzy && pCov === 1 && sCov < 1 && initialsOf(b).length) {
    const rest = wa.filter((_w, i) => !usedA.has(i));
    if (initialsOf(b).every(x => rest.some(w => w[0] === x[0]))) return 90;
  }
  if (!fuzzy && sCov === 1 && pCov < 1 && initialsOf(a).length) {
    const rest = wb.filter((_w, k) => !used.has(k));
    if (initialsOf(a).every(x => rest.some(w => w[0] === x[0]))) return 90;
  }
  let s = sCov === 1 && pCov === 1 ? 92 : sCov === 1 ? 80 : pCov === 1 ? 68 : 70 * matched / Math.max(wa.length, wb.length);
  s -= 20 * fuzzy;
  const ia = initialsOf(a), ib = initialsOf(b);
  if (ia.length && ib.length) {
    const have = new Set(ib.map(x => x[0]).concat(wb.filter((_w, k) => !used.has(k)).map(x => x[0])));
    if (have.size && ia.some(x => !have.has(x[0]))) s -= 30;
  }
  return Math.max(0, s);
}
export function scoreNames(sheetName, personName) {
  const a = nameTokens(sheetName), b = nameTokens(personName);
  const am = mergeInitials(a), bm = mergeInitials(b);
  let s = scoreTokens(a, b);
  if (am.join(" ") !== a.join(" ")) s = Math.max(s, scoreTokens(am, b) - 12);
  if (bm.join(" ") !== b.join(" ")) s = Math.max(s, scoreTokens(a, bm) - 12);
  if (am.join(" ") !== a.join(" ") && bm.join(" ") !== b.join(" ")) s = Math.max(s, scoreTokens(am, bm) - 12);
  return s;
}

// ── subjects ──
function stripLab(k) { return k.replace(/LABORATORY$|LAB$/, ""); }
function initialsKey(name, dropStops) {
  return String(name || "").replace(/\blab(oratory)?\b/gi, " ").split(/[^A-Za-z0-9]+/).filter(w => w && !(dropStops && STOP.has(w.toLowerCase()))).map(w => w[0]).join("").toUpperCase();
}
function vocabItem(label, isLab, extra) {
  const keys = new Set([alnum(label)]);
  const full = alnum(label);
  const stripped = new Set([stripLab(full)]);
  const initials = new Set([initialsKey(label, true), initialsKey(label, false)].filter(Boolean));
  return { label, isLab, keys, stripped, initials, fullKey: stripLab(full), ...extra };
}
function matchVocab(vocab, text, wantLab) {
  const t = alnum(text), tn = stripLab(t);
  if (!t) return [];
  const scored = vocab.map(it => {
    let s = 0;
    if (it.keys.has(t)) s = 100;
    else if (tn && (wantLab ? it.isLab : true) && it.stripped.has(tn)) s = wantLab ? 95 : 88;
    else if (tn.length >= 2 && it.initials.has(tn) && (!wantLab || it.isLab)) s = 85;
    else if (tn.length >= 3 && it.fullKey.startsWith(tn)) s = 75;
    else if (tn.length >= 5 && Math.max(tn.length, it.fullKey.length) >= 5 && editDistance(tn, it.fullKey) <= 1) s = 70;
    else if (tn.length >= 4 && it.fullKey.length >= 4 && (it.fullKey.includes(tn) || tn.includes(it.fullKey))) s = 55;
    if (s) { if (wantLab && !it.isLab) s -= 30; else if (!wantLab && it.isLab) s -= 25; }
    return { it, s };
  }).filter(x => x.s > 0).sort((a, b) => b.s - a.s);
  return scored;
}

function splitNames(cell) {
  return String(cell || "").split(/[\/;\n]+| and /i).map(s => clean(s).replace(/[,\s]+$/, "")).filter(Boolean);
}

// ── main ──
export function parseSmart(wb, ctx, res) {
  res = res || {};
  const resFac = res.faculty || {}, resSub = res.subject || {}, resSec = res.section || {};
  const problems = [];
  const warn = (level, text, section) => problems.push({ level, text, section: section || "" });
  const result = { sections: [], entries: [], problems, facultyUsed: {}, pending: [], skipped: [] };
  const pendingMap = new Map();
  const addPending = (id, item, where) => {
    if (!pendingMap.has(id)) { pendingMap.set(id, { id, ...item, where: new Set(), count: 0 }); result.pending.push(pendingMap.get(id)); }
    const p = pendingMap.get(id);
    if (where) p.where.add(where);
    p.count++;
  };

  const people = ctx.people || [];
  const personByPhone = new Map(people.map(p => [p.phone, p]));
  const infoSeen = new Set();
  const noteOnce = (level, key, text, sec) => { if (infoSeen.has(key)) return; infoSeen.add(key); warn(level, text, sec); };

  // ── faculty resolution ──
  const facCache = new Map();
  function personFacultyObj(p) { return { key: p.phone, name: p.name, phone: p.phone, external: false }; }
  function externalObj(name) { return { key: "ext:" + (nameKey(name) || clean(name).toLowerCase()), name: clean(name), phone: null, external: true }; }
  function resolveFaculty(raw, hints, secName) {
    const name = clean(raw);
    const nk = nameKey(name);
    if (!nk) return null;
    const ck = nk + "|" + (hints ? Array.from(hints).sort().join(",") : "");
    if (facCache.has(ck)) { const hit = facCache.get(ck); if (hit.pendingId) addPending(hit.pendingId, hit.pending, secName); return hit.f; }
    let out = { f: null };
    const answer = resFac[nk];
    if (answer === "ext") out.f = externalObj(name);
    else if (answer && personByPhone.has(answer)) out.f = personFacultyObj(personByPhone.get(answer));
    else {
      let sc = people.map(p => ({ p, s: scoreNames(name, p.name) })).sort((a, b) => b.s - a.s);
      // people assigned to this section only break a tie between equally good name matches
      if (hints && sc[1] && sc[0].s - sc[1].s < 12) sc = sc.map(x => ({ p: x.p, s: Math.min(100, x.s + (hints.has(x.p.phone) ? 15 : 0)) })).sort((a, b) => b.s - a.s);
      const best = sc[0], second = sc[1];
      if (best && best.s >= 70 && (!second || best.s - second.s >= 12)) {
        out.f = personFacultyObj(best.p);
        if (scoreNames(name, best.p.name) < 100 && nameKey(best.p.name) !== nk) noteOnce("info", "fz:" + nk, "\"" + name + "\" was read as " + best.p.name + ".", secName);
      } else if (best && best.s >= 50) {
        const pend = { kind: "faculty", key: nk, text: name, options: sc.filter(x => x.s >= 30).slice(0, 5).map(x => ({ value: x.p.phone, label: x.p.name })) };
        out = { f: null, pendingId: "fac:" + nk, pending: pend };
        addPending(out.pendingId, pend, secName);
      } else {
        out.f = externalObj(name);
        noteOnce("info", "ext:" + nk, "\"" + name + "\" is not in the portal's faculty list, so they are treated as faculty from outside (no portal).", secName);
      }
    }
    facCache.set(ck, out);
    if (out.f) result.facultyUsed[out.f.key] = out.f;
    return out.f;
  }
  function looksLikeName(g) {
    if (TITLE_IN_TEXT.test(g)) return true;
    if (/^(all|nil|na|n\/a)$/i.test(clean(g)) || /^[A-Za-z]{0,5}[-\s]?\d+$/.test(clean(g))) return false;
    return people.some(p => scoreNames(g, p.name) >= 85);
  }

  // ── sections ──
  const sectionKeys = ctx.sections.map(s => ({ s, k: alnum(s.name) }));
  function matchSection(titleName) {
    const k = alnum(titleName);
    if (!k) return null;
    const exact = sectionKeys.filter(x => x.k === k);
    if (exact.length === 1) return exact[0].s;
    const loose = sectionKeys.filter(x => (k.length >= 3 && x.k.includes(k)) || (x.k.length >= 3 && k.includes(x.k)));
    if (loose.length === 1) return loose[0].s;
    const ends = loose.filter(x => x.k.endsWith(k));
    return ends.length === 1 ? ends[0].s : null;
  }

  const seenSections = new Set();
  const skippedTitles = [];
  let blocksFound = 0;

  // the generated Ind-n / report sheets repeat a timetable; only the section sheets (or the ones asked for) are read
  const GENERATED = /^(Ind-\d+|Sheet-3 Individual|Sheet-4 Overlaps|Workload Summary)$/i;
  const sheetNames = ctx.sheets ? wb.SheetNames.filter(n => ctx.sheets.includes(n)) : wb.SheetNames.filter(n => !GENERATED.test(n));
  sheetNames.forEach(sheetName => {
    const ws = wb.Sheets[sheetName];
    if (!ws || !ws["!ref"]) return;
    const rows = sheetRows(ws);
    // header rows: three or more time ranges, with a day name in the next row
    const headers = [];
    rows.forEach((row, i) => {
      let n = 0;
      for (let c = 1; c < row.length; c++) if (extractRange(row[c])) n++;
      if (n >= 3 && rows[i + 1] && dayIndex(rows[i + 1][0]) >= 0) headers.push(i);
    });
    const titleRowOf = h => { for (let r = h - 1; r >= Math.max(0, h - 3); r--) if (rows[r] && rows[r].some(v => clean(v))) return r; return -1; };

    headers.forEach((hdr, bi) => {
      blocksFound++;
      const tr = titleRowOf(hdr);
      const titleCells = tr >= 0 ? rows[tr].map(clean).filter(Boolean) : [];
      const nextTitle = bi + 1 < headers.length ? (titleRowOf(headers[bi + 1]) >= 0 ? titleRowOf(headers[bi + 1]) : headers[bi + 1]) : rows.length;
      let title = titleCells[0] || "";
      if (/^faculty\b/i.test(title)) return; // the faculty-wise listing of the same timetable
      let name = title.replace(/^\s*section\s*[:\-]?\s*/i, "");
      if (!name && titleCells[1]) name = titleCells[1];
      name = name.split(/\s*\|\s*|\s*\(|\s+class\s*incharge/i)[0].trim();
      const displayTitle = name || title || "(no title)";

      const forced = resSec[alnum(displayTitle)];
      const sec = forced === "skip" ? null : (forced ? ctx.sections.find(s => s.id === forced) : matchSection(name));
      if (!sec) { skippedTitles.push({ title: displayTitle, sheet: sheetName }); return; }
      if (seenSections.has(sec.id)) { warn("warn", "Section " + sec.name + " appears more than once in the file (also on sheet \"" + sheetName + "\"). The first one was used.", sec.name); return; }
      seenSections.add(sec.id);

      // columns
      const hRow = rows[hdr];
      const dayRows = {};
      let r = hdr + 1;
      for (; r < nextTitle; r++) {
        const d = dayIndex(rows[r][0]);
        if (d < 0) break;
        if (dayRows[d] === undefined) dayRows[d] = rows[r];
      }
      const tableFrom = r;
      const width = Math.max(hRow.length, ...Object.values(dayRows).map(x => x.length));
      const cols = [];
      for (let c = 1; c < width; c++) {
        const range = extractRange(hRow[c]);
        const any = Object.values(dayRows).map(x => x[c] || "").filter(v => !isFree(v));
        const brk = any.length > 0 && any.every(isBreakCell);
        if (!range && (any.length === 0 || brk)) continue;
        if (!range) { warn("error", "Section " + sec.name + ": cannot read the timing in column " + (c + 1) + " (\"" + clean(hRow[c]) + "\").", sec.name); continue; }
        cols.push({ c, ...range, brk });
      }
      const slots = cols.map(x => ({ col: x.c, start: x.start, end: x.end, brk: x.brk }));
      result.sections.push({ id: sec.id, name: sec.name, slots });

      // the sheet's own SUBJECT / FACULTY table, if it has one
      const table = [];
      let hRowIdx = -1;
      for (let k = tableFrom; k < nextTitle; k++) if (rows[k].some(v => /^\s*(subject|sub)\s*$/i.test(v))) { hRowIdx = k; break; }
      if (hRowIdx >= 0) {
        const hh = rows[hRowIdx];
        const kinds = [];
        hh.forEach((v, c) => {
          const t = clean(v);
          if (/^(subject|sub)$/i.test(t)) kinds.push({ c, kind: "subject" });
          else if (/^labs?$|^lab\s*name/i.test(t)) kinds.push({ c, kind: "lab" });
        });
        const facCols = [];
        hh.forEach((v, c) => { if (/faculty/i.test(v) && !kinds.some(k => k.c === c)) facCols.push(c); });
        kinds.forEach((k, i) => {
          const fc = facCols.find(c => c > k.c);
          if (fc === undefined) return;
          const stop = kinds[i + 1] ? kinds[i + 1].c : Math.max(hh.length, width);
          let cur = null;
          for (let q = hRowIdx + 1; q < nextTitle; q++) {
            const row = rows[q];
            const label = clean(row[k.c]);
            const names = [];
            for (let c = fc; c < stop; c++) splitNames(row[c]).forEach(n => { if (!names.includes(n)) names.push(n); });
            if (label) {
              cur = table.find(x => x.kind === k.kind && alnum(x.label) === alnum(label));
              if (!cur) { cur = { label, kind: k.kind, names: [] }; table.push(cur); }
              names.forEach(n => { if (!cur.names.includes(n)) cur.names.push(n); });
            } else if (cur && names.length) names.forEach(n => { if (!cur.names.includes(n)) cur.names.push(n); });
          }
        });
      }

      // vocabulary: the section's portal subjects, joined with the sheet's table rows
      const vocab = (sec.subjects || []).map(s => vocabItem(s.short || s.name, s.type === "Lab" || /\blab\b/i.test(s.name), { subj: s, names: null }));
      (sec.subjects || []).forEach((s, i) => { vocab[i].keys.add(alnum(s.name)); vocab[i].fullKey = stripLab(alnum(s.name)); vocab[i].stripped.add(stripLab(alnum(s.name))); [initialsKey(s.name, true), initialsKey(s.name, false)].filter(Boolean).forEach(x => vocab[i].initials.add(x)); });
      table.forEach(t => {
        t.label = clean(t.label.replace(/\([^)]*\)/g, " "));
        const isLab = t.kind === "lab" || /\blab\b/i.test(t.label);
        const m = matchVocab(vocab.filter(v => v.subj && !v.linked), t.label, isLab)[0];
        if (m && m.s >= 70) { m.it.names = t.names; m.it.linked = true; }
        else { const it = vocabItem(t.label, isLab, { subj: null, names: t.names }); vocab.push(it); }
      });
      const hints = new Set();
      (sec.subjects || []).forEach(s => (s.faculty || []).forEach(p => hints.add(p)));

      // subject for one piece of cell text
      function resolveToken(text, wantLab) {
        const m = matchVocab(vocab, text, wantLab);
        const best = m[0], second = m[1];
        const sk = sec.id + "|" + alnum(text);
        const forcedSub = resSub[sk];
        if (forcedSub === "note") return { note: true };
        if (forcedSub) { const it = vocab.find(v => (v.subj ? v.subj.name : v.label) === forcedSub); if (it) return { it }; }
        if (best && best.s >= 70 && (!second || best.s - second.s >= 10)) return { it: best.it };
        if (best && best.s >= 50) {
          addPending("sub:" + sk, { kind: "subject", key: sk, text: clean(text), options: m.slice(0, 5).map(x => ({ value: x.it.subj ? x.it.subj.name : x.it.label, label: x.it.subj ? x.it.subj.name : x.it.label })), allOptions: vocab.map(v => v.subj ? v.subj.name : v.label) }, sec.name);
          return { pending: true };
        }
        return null;
      }

      // entries
      slots.filter(s => !s.brk).forEach(slot => {
        Object.keys(dayRows).forEach(dk => {
          const d = Number(dk);
          let raw = clean(dayRows[d][slot.col]);
          if (isFree(raw) || isBreakWord(raw) || isBreakCell(raw)) return;
          const cm = COMBO_RE.exec(raw);
          const combo = cm ? "C" + cm[1] : "";
          raw = raw.replace(COMBO_RE, " ");
          // bracketed room / lab names are ignored; round brackets carry a faculty name or a code
          const groups = [];
          let body = raw.replace(/\[[^\]]*\]/g, " ").replace(/\(([^()]*)\)/g, (_m, g) => { groups.push(g); return " "; });
          body = clean(body);
          const explicit = [];
          groups.forEach(g => splitNames(g).forEach(n => { if (looksLikeName(n)) explicit.push(n); }));
          // an activity such as CRT may be taken by someone who is not in the portal: the bracket then holds their name
          if (!explicit.length && EXTRAS.test(body) && groups.length) groups.forEach(g => splitNames(g).forEach(n => { if (!/^[A-Za-z]{0,5}[-\s]?\d+$/.test(clean(n))) explicit.push(n); }));

          // batch rotation: "B1-IA, B2-SL, B3-AM" are parallel labs
          let pieces, batchLabs = false;
          const parts = body.split(/\s*,\s*/).filter(Boolean);
          if (parts.length > 1 && parts.every(p => /^B\d+\s*[-–:]\s*\S/i.test(p))) { pieces = parts.map(p => p.replace(/^B\d+\s*[-–:]\s*/i, "")); batchLabs = true; }
          else {
            const whole = /\blab\b/i.test(body);
            const wm = matchVocab(vocab, body, whole)[0];
            pieces = wm && wm.s >= 85 ? [body] : body.split(/\s*\/\s*|\s+\+\s*/).filter(Boolean);
          }
          const hasLab = /\blab\b/i.test(body);

          pieces.forEach(piece => {
            let wantLab = batchLabs || /\blab\b/i.test(piece);
            let txt = piece;
            let found = null;
            if (!wantLab && hasLab) { const tryLab = resolveToken(piece + " LAB", true); if (tryLab && tryLab.it) { found = tryLab; wantLab = true; txt = piece + " LAB"; } }
            if (!found) found = resolveToken(txt, wantLab);
            if (found && found.pending) return;
            const label = clean(txt).toUpperCase();
            let subj = null, names = [], token = label, type = "note";
            if (found && found.it) {
              subj = found.it.subj;
              names = found.it.names || [];
              token = subj ? (subj.short || subj.name).toUpperCase().replace(/\s+/g, " ") : found.it.label.toUpperCase();
              type = subj ? String(subj.type || guessType(subj.name)).toLowerCase() : String(guessType(found.it.label)).toLowerCase();
            } else if (found && found.note) {
              type = "note";
            } else if (EXTRAS.test(label) || explicit.length || wantLab) {
              type = explicit.length || EXTRAS.test(label) ? "other" : "note";
              if (wantLab && !explicit.length && !EXTRAS.test(label)) noteOnce("info", "unk:" + sec.id + label, "\"" + label + "\" is not in " + sec.name + "'s subject list, so it stays on the timetable with no faculty.", sec.name);
            } else {
              noteOnce("info", "note:" + label, "\"" + label + "\" is not in the subject list and has no faculty. It stays on the section timetable and adds to nobody's workload.", sec.name);
            }
            // faculty: names written in the cell, else the sheet's table, else the portal's assignment
            let fac = [];
            const nameList = explicit.length ? explicit : names;
            if (type !== "note") {
              if (nameList.length) {
                nameList.forEach(n => { const f = resolveFaculty(n, hints, sec.name); if (f && !fac.some(x => x.key === f.key)) fac.push(f); });
              } else if (subj) {
                (subj.faculty || []).forEach(ph => { const p = personByPhone.get(ph); if (p && !fac.some(x => x.key === p.phone)) { fac.push(personFacultyObj(p)); result.facultyUsed[p.phone] = personFacultyObj(p); } });
                if (!fac.length) noteOnce("warn", "nofac:" + sec.id + token, token + " in " + sec.name + " has no faculty assigned in the portal or written in the sheet, so it adds to nobody's workload.", sec.name);
              }
            }
            fac = fac.map((f, i) => ({ ...f, role: i === 0 ? "main" : "asst" }));
            result.entries.push({
              sectionId: sec.id, sectionName: sec.name, day: d, col: slot.col, start: slot.start, end: slot.end,
              token, subject: subj ? subj.name : token, type: type === "note" ? "note" : type, faculty: fac, combo,
            });
          });
        });
      });
    });
  });

  if (blocksFound === 0) warn("error", "No timetable was found in this file. A timetable needs a row of period timings (like 09:00-09:50) with the days (Monday to Saturday) listed below it.");
  if (skippedTitles.length) {
    result.skipped = skippedTitles;
    if (seenSections.size === 0 && blocksFound > 0) warn("error", "None of the sections in this file match Year " + ctx.year + "'s sections in the portal (" + ctx.sections.map(s => s.name).join(", ") + "). Pick the right section for each block below.");
    else warn("info", skippedTitles.length + " timetable block" + (skippedTitles.length === 1 ? "" : "s") + " in the file " + (skippedTitles.length === 1 ? "is" : "are") + " not among your Year " + ctx.year + " sections and " + (skippedTitles.length === 1 ? "was" : "were") + " left out: " + skippedTitles.slice(0, 10).map(x => x.title).join(", ") + (skippedTitles.length > 10 ? "…" : "") + ".");
  }
  ctx.sections.forEach(s => { if (!seenSections.has(s.id) && blocksFound > 0) warn("warn", "No timetable was found in the file for section " + s.name + ".", s.name); });
  result.pending.forEach(p => { p.where = Array.from(p.where); });
  return result;
}
