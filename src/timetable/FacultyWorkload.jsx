// src/timetable/FacultyWorkload.jsx
// HoD / Master Admin view: every approved faculty member's weekly workload,
// taken from the timetable they filled in. Teaching workload is theory + lab +
// drawing periods, other duties are mentoring, NCC, sports etc., and overall
// is both together. Click a name to see that timetable (read-only).

import React, { useState, useEffect, useRef } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { computeWorkload } from "../timetableUpload/overlapCheck";
import { DAY_NAMES, fmtRange } from "../timetableUpload/timeUtils";
import { db } from "../firebase";
import { P, Card, Btn, Spinner } from "../components/UI";
import TimetableGrid from "./TimetableGrid";
import PrintShell from "./PrintShell";
import { exportWorkloadXLSX } from "./timetableExport";
import { DAYS, blankModel, fromStore, stats } from "./timetableModel";

const MONO = "'IBM Plex Mono', monospace";
const COLS = 14; // faculty + 3 workload + 3 split + free + 6 days
const th = { textAlign: "center", fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: P.gray, padding: "7px 8px", borderBottom: "1.5px solid " + P.border, whiteSpace: "nowrap" };
const td = { padding: "9px 8px", borderBottom: "1px solid " + P.border, verticalAlign: "middle", textAlign: "center", fontFamily: MONO };
const sep = { borderLeft: "1.5px solid " + P.border };
const grp = { textAlign: "center", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: P.blue, padding: "0 8px 3px", borderBottom: "2px solid " + P.blue };

function initials(name) {
  return (name || "?").replace(/[^A-Za-z ]/g, "").split(" ").filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase() || "?";
}

function WorkloadTable({ list, openPhone, onToggle, printMode }) {
  return (
    <table style={{ borderCollapse: "collapse", width: "100%", minWidth: printMode ? 0 : 1100 }}>
      <thead>
        <tr>
          <th style={{ ...th, borderBottom: 0 }} />
          <th colSpan={3} style={grp}>Weekly workload (periods)</th>
          <th colSpan={3} style={{ ...grp, ...sep }}>Teaching split</th>
          <th style={{ ...th, ...sep, borderBottom: 0 }} />
          <th colSpan={6} style={{ ...grp, ...sep }}>Periods per day</th>
        </tr>
        <tr>
          <th style={{ ...th, textAlign: "left", width: 270 }}>Faculty</th>
          <th style={th}>Teaching</th><th style={th}>Other duties</th><th style={{ ...th, color: P.blue }}>Overall</th>
          <th style={{ ...th, ...sep }}>Theory</th><th style={th}>Lab</th><th style={th}>Drawing</th>
          <th style={{ ...th, ...sep }}>Free slots</th>
          {DAYS.map((d, i) => <th key={d[0]} style={{ ...th, ...(i === 0 ? sep : null) }}>{d[0]}</th>)}
        </tr>
      </thead>
      <tbody>
        {list.map(f => {
          const isOpen = !printMode && openPhone === f.phone && !f.none;
          const nameBlock = (
            <>
              <span style={{ width: 34, height: 34, borderRadius: "50%", background: P.blueL, color: P.blue, fontSize: 12, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontFamily: "inherit" }}>{initials(f.name)}</span>
              <span style={{ minWidth: 0, fontFamily: "inherit" }}>
                <b style={{ display: "block", fontSize: 13.5 }}>{f.name}</b>
                <small style={{ display: "block", color: P.gray, fontSize: 12, minHeight: 16, fontWeight: 400 }}>{f.desig || " "}</small>
              </span>
            </>
          );
          return (
            <React.Fragment key={f.phone}>
              <tr>
                <td style={{ ...td, textAlign: "left", fontFamily: "inherit" }}>
                  {printMode || f.none ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>{nameBlock}</div>
                  ) : (
                    <button type="button" onClick={() => onToggle(f.phone)} aria-expanded={isOpen}
                      style={{ display: "flex", alignItems: "center", gap: 10, border: 0, background: "transparent", cursor: "pointer", textAlign: "left", padding: 0, width: "100%", fontFamily: "inherit" }}>
                      {nameBlock}
                      <span style={{ marginLeft: "auto", color: P.gray, transform: isOpen ? "rotate(180deg)" : "none" }}>▾</span>
                    </button>
                  )}
                </td>
                {f.none ? (
                  <td colSpan={COLS - 1} style={{ ...td, textAlign: "left", fontFamily: "inherit" }}>
                    <span style={{ fontSize: 11.5, fontWeight: 600, background: P.amberL, color: P.amber, padding: "3px 10px", borderRadius: 20, whiteSpace: "nowrap" }}>No timetable filled yet</span>
                  </td>
                ) : (
                  <>
                    <td style={td}>{f.teach}</td>
                    <td style={td}>{f.other}</td>
                    <td style={{ ...td, fontWeight: 700, fontSize: 15, color: P.blue }}>{f.s.total}</td>
                    <td style={{ ...td, ...sep }}>{f.s.counts.theory}</td>
                    <td style={td}>{f.s.counts.lab}</td>
                    <td style={td}>{f.s.counts.drawing}</td>
                    <td style={{ ...td, ...sep }}>{f.s.free}</td>
                    {f.s.perDay.map((n, d) => (
                      <td key={d} style={{ ...td, ...(d === 0 ? sep : null) }}>
                        <span style={{ display: "inline-block", minWidth: 30, padding: "4px 0", borderRadius: 6, fontSize: 12.5, background: "rgba(44,92,148," + (n / f.s.dayCap * 0.55).toFixed(2) + ")" }}>{n}</span>
                      </td>
                    ))}
                  </>
                )}
              </tr>
              {isOpen && (
                <tr>
                  <td colSpan={COLS} style={{ background: P.bg, padding: "10px 12px 14px" }}>
                    {f.hasOwn && <TimetableGrid model={f.model} editable={false} compact />}
                    {f.pub.length > 0 && (
                      <div style={{ fontFamily: "inherit", fontSize: 13, textAlign: "left", marginTop: f.hasOwn ? 12 : 0 }}>
                        <b>Published classes</b> (from the uploaded timetable)
                        {f.pub.slice().sort((a, b) => a.day - b.day || a.start - b.start).map(b => (
                          <div key={b.id + b.publishedYear} style={{ padding: "2px 0", color: "#1a2230" }}>
                            {DAY_NAMES[b.day].slice(0, 3)} {fmtRange(b.start, b.end)} · {b.token} · {b.sectionName}
                            {(b.faculty.find(x => x.key === f.phone) || {}).role === "asst" ? " (Asst. Faculty)" : ""}
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              )}
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

// Workload of one faculty member = their published classes + whatever they filled in themselves that doesn't
// clash in time with a published class (a published class replaces a colliding entry of their own).
function combine(model, hasOwn, mine, pubRow, pubCap) {
  const base = stats(model);
  if (!mine.length) return base;
  const counts = { theory: 0, lab: 0, drawing: 0, other: 0 };
  const perDay = [0, 0, 0, 0, 0, 0];
  if (hasOwn) {
    model.cells.forEach((cells, d) => cells.forEach((c, i) => {
      if (!c || c.type === "lunch") return;
      const last = model.slots[Math.min(i + c.span - 1, model.slots.length - 1)];
      const a = model.slots[i].start, b = last.start + last.dur;
      if (mine.some(x => x.day === d && x.start < b && x.end > a)) return;
      counts[c.type] += c.span; perDay[d] += c.span;
    }));
  }
  if (pubRow) {
    Object.keys(counts).forEach(k => { counts[k] += pubRow[k] || 0; });
    pubRow.perDay.forEach((n, d) => { perDay[d] += n; });
  }
  const total = counts.theory + counts.lab + counts.drawing + counts.other;
  const dayCap = Math.max(hasOwn ? base.dayCap : 0, pubCap, 1);
  return { counts, total, lunch: base.lunch, perDay, free: Math.max(0, dayCap * 6 - total), cap: dayCap * 6, dayCap };
}

const SORTS = {
  "overall-desc": { label: "Overall workload: high to low", key: f => f.s.total, dir: -1 },
  "overall-asc": { label: "Overall workload: low to high", key: f => f.s.total, dir: 1 },
  "teach-desc": { label: "Teaching workload: high to low", key: f => f.teach, dir: -1 },
  "teach-asc": { label: "Teaching workload: low to high", key: f => f.teach, dir: 1 },
  "other-desc": { label: "Other duties: high to low", key: f => f.other, dir: -1 },
  name: { label: "Name A to Z" },
};

export default function FacultyWorkload() {
  const [list, setList] = useState(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("overall-desc");
  const [openPhone, setOpenPhone] = useState(null);
  const [dlOpen, setDlOpen] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const dlRef = useRef(null);

  // Live: the screen follows users, faculty timetables and published master timetables as they change.
  const [src, setSrc] = useState({ users: null, tts: null, pub: [] });
  useEffect(() => {
    const unsubs = [
      onSnapshot(collection(db, "users"), snap => setSrc(s => ({ ...s, users: snap.docs.map(d => ({ id: d.id, ...d.data() })) }))),
      onSnapshot(collection(db, "facultyTimetables"), snap => setSrc(s => ({ ...s, tts: snap.docs.map(d => ({ id: d.id, ...d.data() })) }))),
      onSnapshot(collection(db, "masterTimetables"), snap => setSrc(s => ({ ...s, pub: snap.docs.map(d => ({ year: d.id, ...d.data() })) })), () => {}),
    ];
    return () => unsubs.forEach(u => u());
  }, []);

  useEffect(() => {
    if (!src.users || !src.tts) return;
    const tts = {};
    src.tts.forEach(d => { const m = fromStore(d); if (m) tts[d.id] = { model: m, term: d.term || "" }; });
    const pubBlocks = src.pub.flatMap(p => (p.blocks || []).map(b => ({ ...b, publishedYear: p.year })));
    const pubRows = {};
    computeWorkload(pubBlocks).forEach(r => { pubRows[r.key] = r; });
    const pubCap = Math.max(0, ...src.pub.flatMap(p => (p.sections || []).map(x => (x.slots || []).filter(k => !k.brk).length)));
    const rows = [];
    src.users.forEach(u => {
      if (u.status !== "approved") return;
      const t = tts[u.id];
      const model = t ? t.model : blankModel(["—"]);
      const mine = pubBlocks.filter(b => b.type !== "note" && b.faculty.some(f => f.key === u.id));
      const s = combine(model, !!t, mine, pubRows[u.id], pubCap);
      const teach = s.counts.theory + s.counts.lab + s.counts.drawing;
      rows.push({ phone: u.id, name: u.name || u.id, desig: u.designation || "", model, hasOwn: !!t && stats(model).total > 0, pub: mine, term: t ? t.term : "", s, teach, other: s.counts.other, none: s.total === 0 });
    });
    setList(rows);
  }, [src]);

  useEffect(() => {
    function onDoc(e) { if (dlRef.current && !dlRef.current.contains(e.target)) setDlOpen(false); }
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  if (!list) return <Spinner />;

  const filled = list.filter(f => !f.none);
  const sum = filled.reduce((a, f) => a + f.s.total, 0);
  const byTotal = filled.slice().sort((a, b) => b.s.total - a.s.total);
  const hi = byTotal[0], lo = byTotal[byTotal.length - 1];

  const q = search.trim().toLowerCase();
  const rule = SORTS[sort];
  const shown = list.filter(f => f.name.toLowerCase().includes(q)).sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name);
    if (a.none !== b.none) return a.none ? 1 : -1;
    return (rule.key(a) - rule.key(b)) * rule.dir || a.name.localeCompare(b.name);
  });

  const stat = (value, label) => (
    <div style={{ flex: "1 1 170px", padding: "14px 18px", borderRight: "1px solid " + P.border }}>
      <b style={{ display: "block", fontFamily: MONO, fontSize: 24, fontWeight: 600, lineHeight: 1.2 }}>{value}</b>
      <span style={{ fontSize: 12, color: P.gray }}>{label}</span>
    </div>
  );

  return (
    <div style={{ padding: "24px clamp(16px, 3vw, 32px) 80px", maxWidth: "min(1700px, 96vw)", margin: "0 auto", display: "grid", gap: 18 }}>
      <div style={{ display: "flex", flexWrap: "wrap", border: "1px solid " + P.border, borderRadius: 12, background: "#fff", overflow: "hidden" }}>
        {stat(list.length, "Faculty in the department")}
        {stat(filled.length ? Math.round(sum / filled.length * 10) / 10 : "—", "Average overall workload")}
        {stat(hi ? hi.s.total : "—", hi ? "Highest: " + hi.name : "Highest")}
        {stat(lo ? lo.s.total : "—", lo ? "Lowest: " + lo.name : "Lowest")}
        {stat(list.length - filled.length, "No timetable filled yet")}
      </div>

      <Card style={{ padding: "18px 20px", margin: 0 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search faculty" aria-label="Search faculty"
              style={{ border: "1.5px solid " + P.border, borderRadius: 9, padding: "8px 12px", fontFamily: "inherit", fontSize: 14 }} />
            <select value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort faculty"
              style={{ border: "1.5px solid " + P.border, borderRadius: 9, padding: "8px 12px", fontFamily: "inherit", fontSize: 14, background: "#fff" }}>
              {Object.keys(SORTS).map(k => <option key={k} value={k}>{SORTS[k].label}</option>)}
            </select>
          </div>
          <div ref={dlRef} style={{ position: "relative" }}>
            <Btn small variant="outline" onClick={() => setDlOpen(v => !v)}>Download workload ▾</Btn>
            {dlOpen && (
              <div role="menu" style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", minWidth: 240, background: "#fff", border: "1px solid " + P.border, borderRadius: 10, boxShadow: "0 10px 28px rgba(0,0,0,0.18)", padding: 6, zIndex: 30 }}>
                {[["PDF", "Workload table, one page", () => setShowPrint(true)],
                  ["Excel (.xlsx)", "With the day-wise split", () => exportWorkloadXLSX(shown)]].map(([t, sub, fn]) => (
                  <button key={t} role="menuitem" type="button" onClick={() => { setDlOpen(false); fn(); }}
                    style={{ display: "block", width: "100%", textAlign: "left", border: 0, background: "transparent", padding: "9px 12px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 500 }}>
                    {t}<small style={{ display: "block", color: P.gray, fontWeight: 400, fontSize: 12 }}>{sub}</small>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <WorkloadTable list={shown} openPhone={openPhone} onToggle={p => setOpenPhone(o => o === p ? null : p)} />
        </div>
        {shown.length === 0 && <div style={{ color: P.gray, padding: "14px 4px" }}>No faculty match your search.</div>}
        <p style={{ fontSize: 12.5, color: P.gray, margin: "10px 0 0", maxWidth: "100ch" }}>
          <b>Teaching</b> is theory + lab + drawing periods. <b>Other duties</b> are mentoring, disciplinary duties, NCC, NSS, sports and other duties. <b>Overall</b> is both together. Lunch and free slots are not counted. Click a name to see that faculty's timetable.
        </p>
      </Card>

      {showPrint && (
        <PrintShell title="Faculty workload preview" onClose={() => setShowPrint(false)}>
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Faculty Workload</div>
          <div style={{ fontSize: 14, color: P.gray, marginBottom: 14 }}>Periods per week, from each faculty member's timetable</div>
          <WorkloadTable list={shown} printMode />
        </PrintShell>
      )}
    </div>
  );
}
