// src/timetable/TimetablePage.jsx
// A faculty member's own weekly timetable: click a cell to edit it in a
// dialog, add or remove period columns, put lunch wherever their sections
// have it, then save and download. Stored at facultyTimetables/{phone};
// only the owner can write it, the HoD reads it on the Faculty Workload screen.

import React, { useState, useEffect, useRef } from "react";
import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { P, Btn, Card, Spinner } from "../components/UI";
import TimetableGrid, { TypeLegend } from "./TimetableGrid";
import PrintShell from "./PrintShell";
import { exportTimetableXLSX } from "./timetableExport";
import {
  DAYS, TL, COUNTED, TYPE_STYLE, MAXSLOTS,
  defaultModel, fromStore, toStore, cellAt, labelsOf, stats, maxSpan, mkCell,
  setCell, setTime, insertCol, deleteCol,
} from "./timetableModel";

const MONO = "'IBM Plex Mono', monospace";
const lbl = { display: "block", fontSize: 11.5, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: P.gray, marginBottom: 6 };
const inputStyle = { width: "100%", boxSizing: "border-box", border: "1.5px solid " + P.border, borderRadius: 9, padding: "9px 12px", fontSize: 14, fontFamily: "inherit", background: "#fff" };

function Seg({ children }) {
  return <div style={{ display: "inline-flex", flexWrap: "wrap", border: "1.5px solid " + P.border, borderRadius: 10, overflow: "hidden", background: P.bg }}>{children}</div>;
}
function SegBtn({ active, disabled, onClick, dot, first, children }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={active}
      style={{
        border: 0, borderLeft: first ? 0 : "1.5px solid " + P.border, padding: "8px 14px", cursor: disabled ? "not-allowed" : "pointer", fontWeight: 600, fontSize: 13,
        display: "flex", alignItems: "center", fontFamily: "inherit", opacity: disabled ? 0.4 : 1,
        background: active ? P.blue : "transparent", color: active ? "#fff" : P.gray,
      }}>
      {dot && <i style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, marginRight: 7, background: dot }} />}
      {children}
    </button>
  );
}

// A pick-one array of options, wrapping onto as many rows as it needs.
function Chips({ items, value, onPick, empty }) {
  if (!items.length) return <div style={{ fontSize: 12.5, color: P.gray, marginBottom: 8 }}>{empty}</div>;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
      {items.map(it => {
        const on = it === value;
        return (
          <button key={it} type="button" aria-pressed={on} onClick={() => onPick(on ? "" : it)}
            style={{
              border: "1.5px solid " + (on ? P.blue : P.border), background: on ? P.blue : "#fff", color: on ? "#fff" : "#1a2230",
              borderRadius: 20, padding: "6px 14px", fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
            }}>
            {it}
          </button>
        );
      })}
    </div>
  );
}

function CellEditor({ title, time, initial, spanLimit, options, onApply, onCancel }) {
  const [c, setC] = useState(initial);
  const firstRef = useRef(null);
  const type = c ? c.type : "free";
  const isLunch = type === "lunch";
  const set = patch => setC(prev => ({ ...(prev || mkCell("theory")), ...patch }));

  useEffect(() => {
    if (firstRef.current) firstRef.current.focus();
    function onKey(e) { if (e.key === "Escape") onCancel(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const matched = c && c.subject ? options.pairs.filter(p => p.subject === c.subject).map(p => p.section) : [];
  const sectionItems = matched.length ? [...new Set(matched)] : options.sections;

  function pickType(t) {
    if (t === "free") setC(null);
    else if (t === "lunch") setC(prev => mkCell("lunch", "", "", "", prev ? Math.min(prev.span, spanLimit) : 1));
    else set({ type: t, span: c ? c.span : (t === "lab" ? spanLimit : 1) });
  }

  const typeBtn = (t, label, dot, first) => (
    <SegBtn key={t} first={first} dot={dot} active={type === t} onClick={() => pickType(t)}>{label}</SegBtn>
  );

  return (
    <div role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(15,30,50,0.5)", zIndex: 200, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "clamp(12px, 5vh, 56px) 16px", overflowY: "auto" }}>
      <div role="dialog" aria-modal="true" aria-label={"Edit " + title}
        style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 660, padding: "22px 24px", boxShadow: "0 18px 50px rgba(0,0,0,0.3)", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 18 }}>{title}</div>
          <span style={{ fontFamily: MONO, fontSize: 13, color: P.gray }}>{time}</span>
        </div>

        <span style={lbl}>Type</span>
        <div ref={firstRef} tabIndex={-1} style={{ outline: "none" }}>
          <Seg>
            {typeBtn("theory", "Theory", TYPE_STYLE.theory.dot, true)}
            {typeBtn("lab", "Lab", TYPE_STYLE.lab.dot)}
            {typeBtn("drawing", "Drawing", TYPE_STYLE.drawing.dot)}
            {typeBtn("other", "Other", TYPE_STYLE.other.dot)}
            {typeBtn("lunch", "Lunch", TYPE_STYLE.lunch.dot)}
            {typeBtn("free", "Free", null)}
          </Seg>
        </div>

        {c && !isLunch && (
          <div style={{ marginTop: 18 }}>
            <span style={lbl}>Subject</span>
            <Chips items={options.subjects} value={c.subject} onPick={v => set({ subject: v })} empty="No subjects are assigned to you yet. Type one below." />
            <input aria-label="Subject" placeholder="Or type a subject" value={c.subject} onChange={e => set({ subject: e.target.value })} style={inputStyle} />

            <span style={{ ...lbl, marginTop: 16 }}>Section</span>
            <Chips items={sectionItems} value={c.section} onPick={v => set({ section: v })} empty="No sections are assigned to you yet. Type one below." />
            <input aria-label="Section" placeholder="Or type a section" value={c.section} onChange={e => set({ section: e.target.value })} style={inputStyle} />

            <span style={{ ...lbl, marginTop: 16 }}>Room</span>
            <input aria-label="Room" placeholder="e.g. R-204" value={c.room} onChange={e => set({ room: e.target.value })} style={{ ...inputStyle, maxWidth: 240 }} />
          </div>
        )}

        {c && (
          <div style={{ marginTop: 18 }}>
            <span style={lbl}>Periods covered</span>
            <Seg>
              {[1, 2, 3].map((k, idx) => (
                <SegBtn key={k} first={idx === 0} disabled={k > spanLimit} active={c.span === k} onClick={() => set({ span: k })}>{k}</SegBtn>
              ))}
            </Seg>
          </div>
        )}
        {!c && <div style={{ marginTop: 16, fontSize: 13, color: P.gray }}>This period will be left free.</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 24, flexWrap: "wrap" }}>
          <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>
          <Btn onClick={() => onApply(c)}>Apply</Btn>
        </div>
      </div>
    </div>
  );
}

function Summary({ model }) {
  const s = stats(model);
  const n = model.slots.length;
  return (
    <Card style={{ padding: "18px 20px", margin: 0 }}>
      <div style={{ fontWeight: 700, fontSize: 15.5 }}>Weekly load</div>
      <div style={{ color: P.gray, fontSize: 12.5, marginBottom: 12 }}>This is the figure your HoD sees.</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <b style={{ fontFamily: MONO, fontSize: 36, fontWeight: 600, lineHeight: 1 }}>{s.total}</b>
        <span style={{ color: P.gray, fontSize: 13 }}>teaching periods this week ({n} columns x {DAYS.length} days)</span>
      </div>
      <div style={{ display: "flex", height: 12, borderRadius: 6, overflow: "hidden", background: P.border, margin: "12px 0 10px" }}>
        {COUNTED.map(k => s.counts[k] ? <div key={k} title={TL[k] + ": " + s.counts[k]} style={{ width: (s.counts[k] / s.cap * 100) + "%", background: TYPE_STYLE[k].dot }} /> : null)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: "6px 16px", fontSize: 13, marginBottom: 16 }}>
        {COUNTED.map(k => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between" }}>
            <span><i style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, marginRight: 7, background: TYPE_STYLE[k].dot }} />{TL[k]}</span>
            <b style={{ fontFamily: MONO }}>{s.counts[k]}</b>
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between" }}><span><i style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, marginRight: 7, background: TYPE_STYLE.lunch.dot }} />Lunch slots</span><b style={{ fontFamily: MONO }}>{s.lunch}</b></div>
        <div style={{ display: "flex", justifyContent: "space-between" }}><span>Free slots</span><b style={{ fontFamily: MONO }}>{s.free}</b></div>
      </div>
      <span style={lbl}>Teaching periods per day</span>
      <div style={{ display: "grid", gap: 7 }}>
        {DAYS.map((day, d) => (
          <div key={d} style={{ display: "grid", gridTemplateColumns: "34px minmax(0,1fr) 40px", alignItems: "center", gap: 10, fontSize: 12.5 }}>
            <span>{day[0]}</span>
            <div style={{ height: 8, borderRadius: 4, background: P.border, overflow: "hidden" }}>
              <div style={{ height: "100%", width: Math.min(s.perDay[d] / s.dayCap * 100, 100) + "%", background: P.blue, borderRadius: 4 }} />
            </div>
            <span style={{ textAlign: "right", color: P.gray, fontFamily: MONO }}>{s.perDay[d]}/{s.dayCap}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function TimetablePrintBody({ name, desig, term, model }) {
  const s = stats(model);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{name}</div>
          <div style={{ fontSize: 14, color: P.gray }}>{[desig, "Weekly Timetable", term].filter(Boolean).join(" · ")}</div>
        </div>
        <div style={{ fontSize: 14 }}><b style={{ fontFamily: MONO }}>{s.total}</b> teaching periods per week</div>
      </div>
      <TimetableGrid model={model} editable={false} compact />
      <TypeLegend />
    </div>
  );
}

export default function TimetablePage({ user }) {
  const [model, setModel] = useState(null);
  const [term, setTerm] = useState("");
  const [editing, setEditing] = useState(null); // { d, i } of the cell being edited
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editCols, setEditCols] = useState(false);
  const [pos, setPos] = useState(null);
  const [dlOpen, setDlOpen] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const [msg, setMsg] = useState(null);
  const [options, setOptions] = useState({ subjects: [], sections: [], pairs: [] });
  const dlRef = useRef(null);

  useEffect(() => {
    let alive = true;
    getDoc(doc(db, "facultyTimetables", user.phone)).then(snap => {
      if (!alive) return;
      const stored = snap.exists() ? fromStore(snap.data()) : null;
      setModel(stored || defaultModel());
      setTerm(snap.exists() ? (snap.data().term || "") : "");
    }).catch(() => { if (alive) setModel(defaultModel()); });
    getDocs(collection(db, "sections")).then(snap => {
      if (!alive) return;
      const pairs = [];
      snap.docs.forEach(d => {
        const sec = d.data();
        if (sec.deleted) return;
        (sec.subjects || []).forEach(sub => { if (sub.facultyPhone === user.phone) pairs.push({ subject: sub.name, section: sec.name }); });
      });
      setOptions({
        subjects: [...new Set(pairs.map(p => p.subject))].sort(),
        sections: [...new Set(pairs.map(p => p.section))].sort(),
        pairs,
      });
    }).catch(() => {});
    return () => { alive = false; };
  }, [user.phone]);

  useEffect(() => {
    function onDoc(e) { if (dlRef.current && !dlRef.current.contains(e.target)) setDlOpen(false); }
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  if (!model) return <Spinner />;

  const labs = labelsOf(model);

  function edit(next) { setModel(next); setDirty(true); setMsg(null); }
  const posValue = pos === null || pos > model.slots.length ? model.slots.length : pos;

  function openCell(d, i) {
    const h = cellAt(model, d, i);
    setEditing({ d, i: h ? h.start : i });
  }
  function doInsert(kind) {
    edit(insertCol(model, posValue, kind));
    setEditing(null);
  }
  function doDelete(i) {
    edit(deleteCol(model, i));
    setEditing(null);
  }
  async function save() {
    setSaving(true);
    try {
      await setDoc(doc(db, "facultyTimetables", user.phone), { ...toStore(model), term, updatedAt: new Date().toISOString() });
      setDirty(false);
      setMsg({ ok: true, text: "Timetable saved." });
    } catch (e) {
      setMsg({ ok: false, text: "Could not save: " + e.message });
    }
    setSaving(false);
  }

  const editCell = editing ? model.cells[editing.d][editing.i] : null;

  return (
    <div style={{ padding: "24px clamp(16px, 3vw, 32px) 80px", maxWidth: "min(1500px, 96vw)", margin: "0 auto", display: "grid", gap: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Weekly Timetable</h1>
          <div style={{ color: P.gray, marginTop: 4, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span>Click any cell to fill it in or change it.</span>
            <input value={term} onChange={e => { setTerm(e.target.value); setDirty(true); }} placeholder="Term, e.g. 2026-27 Sem I"
              aria-label="Term" style={{ ...inputStyle, width: 200, padding: "5px 10px", fontSize: 13 }} />
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {msg
            ? <span style={{ fontSize: 12.5, fontWeight: 600, padding: "5px 12px", borderRadius: 20, background: msg.ok ? P.greenL : P.redL, color: msg.ok ? P.green : P.red }}>{msg.text}</span>
            : <span style={{ fontSize: 12.5, fontWeight: 600, padding: "5px 12px", borderRadius: 20, background: dirty ? P.amberL : P.greenL, color: dirty ? P.amber : P.green }}>{dirty ? "Unsaved changes" : "All changes saved"}</span>}
          <Btn small variant="outline" onClick={() => setEditCols(v => !v)}>{editCols ? "Done" : "Add or remove periods"}</Btn>
          <div ref={dlRef} style={{ position: "relative" }}>
            <Btn small variant="outline" onClick={() => setDlOpen(v => !v)}>Download ▾</Btn>
            {dlOpen && (
              <div role="menu" style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", minWidth: 250, background: "#fff", border: "1px solid " + P.border, borderRadius: 10, boxShadow: "0 10px 28px rgba(0,0,0,0.18)", padding: 6, zIndex: 30 }}>
                {[["PDF", "One landscape page, ready to print", () => setShowPrint(true)],
                  ["Excel (.xlsx)", "Editable spreadsheet", () => exportTimetableXLSX(user.name, term, model)]].map(([t, sub, fn]) => (
                  <button key={t} role="menuitem" type="button" onClick={() => { setDlOpen(false); fn(); }}
                    style={{ display: "block", width: "100%", textAlign: "left", border: 0, background: "transparent", padding: "9px 12px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 500 }}>
                    {t}<small style={{ display: "block", color: P.gray, fontWeight: 400, fontSize: 12 }}>{sub}</small>
                  </button>
                ))}
              </div>
            )}
          </div>
          <Btn small onClick={save} disabled={!dirty || saving}>{saving ? "Saving…" : "Save timetable"}</Btn>
        </div>
      </div>

      <Card style={{ padding: "18px 20px", margin: 0 }}>
        {editCols && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "10px 12px", marginBottom: 12, background: P.bg, border: "1px dashed " + P.border, borderRadius: 10 }}>
            <label htmlFor="tt-pos" style={{ fontSize: 12.5, fontWeight: 600, color: P.gray }}>Add a column</label>
            <select id="tt-pos" value={posValue} onChange={e => setPos(Number(e.target.value))}
              style={{ border: "1.5px solid " + P.border, borderRadius: 8, padding: "6px 10px", background: "#fff", fontFamily: "inherit", fontSize: 13 }}>
              <option value={0}>At the start</option>
              {labs.map((l, i) => <option key={i} value={i + 1}>After {l.text} ({model.slots[i].time})</option>)}
            </select>
            <Btn small onClick={() => doInsert("period")} disabled={model.slots.length >= MAXSLOTS}>Add period</Btn>
            <Btn small variant="outline" onClick={() => doInsert("lunch")} disabled={model.slots.length >= MAXSLOTS}>Add lunch column</Btn>
            <span style={{ fontSize: 12.5, color: P.gray }}>Use the × on a column header to delete it. A lunch column is filled with Lunch on every day; you can still change single days.</span>
          </div>
        )}
        <TimetableGrid
          model={model} editable sel={editing} colCtl={editCols}
          onSelect={openCell}
          onTimeCommit={(i, text) => { const t = text.trim() || "Set time"; if (t !== model.slots[i].time) edit(setTime(model, i, t)); }}
          onDeleteCol={doDelete}
        />
        <TypeLegend />
        <p style={{ fontSize: 12.5, color: P.gray, margin: "10px 0 0" }}>
          Timings in the header can be edited. Lunch can sit in any column and on any day, since your lunch follows the sections you teach.
        </p>
      </Card>

      <div style={{ maxWidth: 680 }}><Summary model={model} /></div>

      <p style={{ margin: 0, fontSize: 12.5, color: P.gray }}>Your HoD can see this timetable and your weekly load on the Faculty Workload screen, read-only. Only you can edit it.</p>

      {editing && (
        <CellEditor
          key={editing.d + "-" + editing.i}
          title={DAYS[editing.d][1] + ", " + labs[editing.i].text}
          time={model.slots[editing.i].time}
          initial={editCell ? { ...editCell } : mkCell("theory")}
          spanLimit={maxSpan(model, editing.i)}
          options={options}
          onCancel={() => setEditing(null)}
          onApply={c => { edit(setCell(model, editing.d, editing.i, c)); setEditing(null); }}
        />
      )}

      {showPrint && (
        <PrintShell title="Timetable preview" onClose={() => setShowPrint(false)}>
          <TimetablePrintBody name={user.name} desig={user.designation} term={term} model={model} />
        </PrintShell>
      )}
    </div>
  );
}
