// src/timetable/FacultyWorkload.jsx
// HoD / Master Admin view: every approved faculty member's weekly teaching
// load, taken from the timetable they filled in. Click a name to see that
// timetable (read-only).

import React, { useState, useEffect, useRef } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { P, Card, Btn, Spinner } from "../components/UI";
import TimetableGrid from "./TimetableGrid";
import PrintShell from "./PrintShell";
import { exportWorkloadXLSX } from "./timetableExport";
import { DAYS, COUNTED, blankModel, fromStore, stats } from "./timetableModel";

const MONO = "'IBM Plex Mono', monospace";
const th = { textAlign: "left", fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: P.gray, padding: "8px 8px", borderBottom: "1.5px solid " + P.border, whiteSpace: "nowrap" };
const td = { padding: "9px 8px", borderBottom: "1px solid " + P.border, verticalAlign: "middle" };

function initials(name) {
  return (name || "?").replace(/[^A-Za-z ]/g, "").split(" ").filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase() || "?";
}

function WorkloadTable({ list, maxT, openPhone, onToggle, printMode }) {
  return (
    <table style={{ borderCollapse: "collapse", width: "100%", minWidth: printMode ? 0 : 1000 }}>
      <thead>
        <tr>
          <th style={th}>Faculty</th><th style={th}>Periods per week</th>
          {["Theory", "Lab", "Drawing", "Other", "Free"].map(h => <th key={h} style={{ ...th, textAlign: "center" }}>{h}</th>)}
          {DAYS.map(d => <th key={d[0]} style={{ ...th, textAlign: "center" }}>{d[0]}</th>)}
        </tr>
      </thead>
      <tbody>
        {list.map(f => {
          const isOpen = !printMode && openPhone === f.phone && !f.none;
          const nameBlock = (
            <>
              <span style={{ width: 34, height: 34, borderRadius: "50%", background: P.blueL, color: P.blue, fontSize: 12, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{initials(f.name)}</span>
              <span style={{ minWidth: 0 }}>
                <b style={{ display: "block", fontSize: 13.5 }}>{f.name}</b>
                <small style={{ color: P.gray, fontSize: 12 }}>{f.desig}</small>
              </span>
            </>
          );
          return (
            <React.Fragment key={f.phone}>
              <tr>
                <td style={td}>
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
                  <td colSpan={11} style={td}>
                    <span style={{ fontSize: 11.5, fontWeight: 600, background: P.amberL, color: P.amber, padding: "3px 10px", borderRadius: 20, whiteSpace: "nowrap" }}>No timetable filled yet</span>
                  </td>
                ) : (
                  <>
                    <td style={td}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 150 }}>
                        <div style={{ flex: 1, height: 9, borderRadius: 5, background: P.border, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: (f.s.total / maxT * 100) + "%", background: P.blue, borderRadius: 5 }} />
                        </div>
                        <b style={{ fontFamily: MONO, minWidth: "2ch", textAlign: "right" }}>{f.s.total}</b>
                      </div>
                    </td>
                    {COUNTED.map(k => <td key={k} style={{ ...td, textAlign: "center", fontFamily: MONO }}>{f.s.counts[k]}</td>)}
                    <td style={{ ...td, textAlign: "center", fontFamily: MONO }}>{f.s.free}</td>
                    {f.s.perDay.map((n, d) => (
                      <td key={d} style={{ ...td, textAlign: "center" }}>
                        <span style={{ display: "inline-block", minWidth: 30, padding: "4px 0", borderRadius: 6, fontFamily: MONO, fontSize: 12.5, background: "rgba(44,92,148," + (n / f.s.dayCap * 0.55).toFixed(2) + ")" }}>{n}</span>
                      </td>
                    ))}
                  </>
                )}
              </tr>
              {isOpen && (
                <tr>
                  <td colSpan={13} style={{ background: P.bg, padding: "10px 12px 14px" }}>
                    <TimetableGrid model={f.model} editable={false} compact />
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

export default function FacultyWorkload() {
  const [list, setList] = useState(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("most");
  const [openPhone, setOpenPhone] = useState(null);
  const [dlOpen, setDlOpen] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const dlRef = useRef(null);

  useEffect(() => {
    let alive = true;
    Promise.all([getDocs(collection(db, "users")), getDocs(collection(db, "facultyTimetables"))]).then(([usersSnap, ttSnap]) => {
      if (!alive) return;
      const tts = {};
      ttSnap.forEach(d => { const m = fromStore(d.data()); if (m) tts[d.id] = { model: m, term: d.data().term || "" }; });
      const rows = [];
      usersSnap.forEach(d => {
        const u = d.data();
        if (u.status !== "approved") return;
        const t = tts[d.id];
        const model = t ? t.model : blankModel(["—"]);
        const s = stats(model);
        rows.push({ phone: d.id, name: u.name || d.id, desig: u.designation || "", model, term: t ? t.term : "", s, none: !t || s.total === 0 });
      });
      setList(rows);
    });
    return () => { alive = false; };
  }, []);

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
  const maxT = Math.max(1, ...list.map(f => f.s.total));

  const q = search.trim().toLowerCase();
  const shown = list.filter(f => f.name.toLowerCase().includes(q)).sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name);
    if (a.none !== b.none) return a.none ? 1 : -1;
    return sort === "least" ? a.s.total - b.s.total : b.s.total - a.s.total;
  });

  const stat = (value, label) => (
    <div style={{ flex: "1 1 150px", padding: "14px 18px", borderRight: "1px solid " + P.border }}>
      <b style={{ display: "block", fontFamily: MONO, fontSize: 24, fontWeight: 600, lineHeight: 1.2 }}>{value}</b>
      <span style={{ fontSize: 12, color: P.gray }}>{label}</span>
    </div>
  );

  return (
    <div style={{ padding: "24px clamp(16px, 3vw, 32px) 80px", maxWidth: "min(1700px, 96vw)", margin: "0 auto", display: "grid", gap: 18 }}>
      <div style={{ display: "flex", flexWrap: "wrap", border: "1px solid " + P.border, borderRadius: 12, background: "#fff", overflow: "hidden" }}>
        {stat(list.length, "Faculty in the department")}
        {stat(filled.length ? Math.round(sum / filled.length * 10) / 10 : "—", "Average periods per week")}
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
              <option value="most">Most periods first</option>
              <option value="least">Fewest periods first</option>
              <option value="name">Name A to Z</option>
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
          <WorkloadTable list={shown} maxT={maxT} openPhone={openPhone} onToggle={p => setOpenPhone(o => o === p ? null : p)} />
        </div>
        {shown.length === 0 && <div style={{ color: P.gray, padding: "14px 4px" }}>No faculty match your search.</div>}
        <p style={{ fontSize: 12.5, color: P.gray, margin: "10px 0 0" }}>
          Periods are teaching periods per week (theory, lab, drawing and other duties). Lunch and free slots are not counted. Click a name to see that faculty's timetable.
        </p>
      </Card>

      {showPrint && (
        <PrintShell title="Faculty workload preview" onClose={() => setShowPrint(false)}>
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Faculty Workload</div>
          <div style={{ fontSize: 14, color: P.gray, marginBottom: 14 }}>Teaching periods per week, from each faculty member's timetable</div>
          <WorkloadTable list={shown} maxT={maxT} printMode />
        </PrintShell>
      )}
    </div>
  );
}
