// src/timetable/TimetablePage.jsx
// A faculty member's own week as six day cards. Classes from the published timetable arrive locked; the faculty
// member adds their duties (mentoring, NCC, sports...) or the classes of a year that isn't published yet.
// Stored at facultyTimetables/{phone} (own entries only); the HoD reads it on the Faculty Workload screen.

import React, { useState, useEffect, useRef, useMemo } from "react";
import { collection, doc, getDoc, getDocs, setDoc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { P, Btn, Card, Spinner } from "../components/UI";
import WeekCards from "./WeekCards";
import PrintShell from "./PrintShell";
import { exportTimetableXLSX } from "./timetableExport";
import {
  DAYS, TL, COUNTED, TYPE_STYLE, DUTIES, itemsFromStore, toStore, buildWeek, stats, conflictCount,
  mkItem, yearOf, toHHMM, fromHHMM, fmtSpan,
} from "./timetableModel";

const MONO = "'IBM Plex Mono', monospace";
const lbl = { display: "block", fontSize: 11.5, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: P.gray, marginBottom: 6 };
const inputStyle = { width: "100%", boxSizing: "border-box", border: "1.5px solid " + P.border, borderRadius: 9, padding: "9px 12px", fontSize: 14, fontFamily: "inherit", background: "#fff" };

function Seg({ children }) {
  return <div style={{ display: "inline-flex", flexWrap: "wrap", border: "1.5px solid " + P.border, borderRadius: 10, overflow: "hidden", background: P.bg }}>{children}</div>;
}
function SegBtn({ active, onClick, dot, first, children }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      style={{
        border: 0, borderLeft: first ? 0 : "1.5px solid " + P.border, padding: "8px 14px", cursor: "pointer", fontWeight: 600, fontSize: 13,
        display: "flex", alignItems: "center", fontFamily: "inherit", background: active ? P.blue : "transparent", color: active ? "#fff" : P.gray,
      }}>
      {dot && <i style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, marginRight: 7, background: dot }} />}
      {children}
    </button>
  );
}

// A pick-one array of options, wrapping onto as many rows as it needs. items: [{ key, label, on }]
function Chips({ items, onPick, empty }) {
  if (!items.length) return <div style={{ fontSize: 12.5, color: P.gray, marginBottom: 8 }}>{empty}</div>;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
      {items.map(it => (
        <button key={it.key} type="button" aria-pressed={it.on} onClick={() => onPick(it.key)}
          style={{
            border: "1.5px solid " + (it.on ? P.blue : P.border), background: it.on ? P.blue : "#fff", color: it.on ? "#fff" : "#1a2230",
            borderRadius: 20, padding: "6px 14px", fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
          }}>
          {it.label}
        </button>
      ))}
    </div>
  );
}

function EntryEditor({ day, initial, isNew, others, options, onApply, onDelete, onCancel }) {
  const [c, setC] = useState({ ...initial, from: toHHMM(initial.start), to: toHHMM(initial.end) });
  const [err, setErr] = useState("");
  const firstRef = useRef(null);
  const lineRef = useRef(null);
  const set = patch => { setC(prev => ({ ...prev, ...patch })); setErr(""); };
  const isDuty = c.type === "other";

  useEffect(() => {
    if (firstRef.current) firstRef.current.focus();
    function onKey(e) { if (e.key === "Escape") onCancel(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  function pickType(t) { set({ type: t, periods: t === "lab" ? 3 : c.type === "lab" ? 1 : c.periods }); }
  function pickAssigned(p) {
    const t = /\blab\b/i.test(p.subject) ? "lab" : /drawing|graphics/i.test(p.subject) ? "drawing" : "theory";
    set({ type: t, subject: p.subject, section: p.section, year: yearOf(p.section), periods: t === "lab" ? 3 : 1 });
  }
  function pickDuty(d) {
    set({ type: "other", subject: d === "Other duties" ? "" : d, section: "", year: "", periods: 1 });
    if (d === "Other duties") setTimeout(() => { if (lineRef.current) lineRef.current.focus(); }, 0);
  }

  function apply() {
    const start = fromHHMM(c.from), end = fromHHMM(c.to);
    if (start === null || end === null) return setErr("Enter the start and end time.");
    if (end <= start) return setErr("The end time must be after the start time.");
    if (!c.subject.trim()) return setErr(isDuty ? "Choose or type the duty." : "Choose or type the subject.");
    const hit = others.find(o => o.start < end && start < o.end);
    if (hit) return setErr("This overlaps " + (hit.subject || TL[hit.type]) + " (" + fmtSpan(hit.start, hit.end) + ")" + (hit.locked ? ", a published class" : "") + ". Change the time.");
    const { from, to, ...rest } = c;
    onApply({ ...rest, start, end, subject: c.subject.trim() });
  }

  const assignedItems = options.pairs.map(p => ({
    key: p.subject + "\u0000" + p.section, label: p.subject + " · " + p.section, pair: p,
    on: !isDuty && c.subject === p.subject && c.section === p.section,
  }));
  const presetDuties = DUTIES.slice(0, -1);
  const dutyItems = DUTIES.map(d => ({ key: d, label: d, on: isDuty && (d === "Other duties" ? !presetDuties.includes(c.subject) : c.subject === d) }));

  return (
    <div role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(15,30,50,0.5)", zIndex: 200, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "clamp(12px, 5vh, 56px) 16px", overflowY: "auto" }}>
      <div role="dialog" aria-modal="true" aria-label={(isNew ? "Add to " : "Edit ") + DAYS[day][1]}
        style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 660, padding: "22px 24px", boxShadow: "0 18px 50px rgba(0,0,0,0.3)", boxSizing: "border-box" }}>
        <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 16 }}>{(isNew ? "Add to " : "Edit ") + DAYS[day][1]}</div>

        <span style={lbl}>Type</span>
        <div ref={firstRef} tabIndex={-1} style={{ outline: "none" }}>
          <Seg>
            <SegBtn first dot={TYPE_STYLE.other.dot} active={c.type === "other"} onClick={() => pickType("other")}>Duty</SegBtn>
            <SegBtn dot={TYPE_STYLE.theory.dot} active={c.type === "theory"} onClick={() => pickType("theory")}>Theory</SegBtn>
            <SegBtn dot={TYPE_STYLE.lab.dot} active={c.type === "lab"} onClick={() => pickType("lab")}>Lab</SegBtn>
            <SegBtn dot={TYPE_STYLE.drawing.dot} active={c.type === "drawing"} onClick={() => pickType("drawing")}>Drawing</SegBtn>
          </Seg>
        </div>

        <div style={{ marginTop: 18 }}>
          {isDuty ? (
            <>
              <span style={lbl}>Duty</span>
              <Chips items={dutyItems} onPick={pickDuty} empty="" />
            </>
          ) : (
            <>
              <span style={lbl}>My assigned subjects</span>
              <Chips items={assignedItems} onPick={k => pickAssigned(assignedItems.find(it => it.key === k).pair)} empty="No subjects are assigned to you yet. Type one below." />
            </>
          )}
          <span style={{ ...lbl, marginTop: 6 }}>{isDuty ? "Duty (type here for any other duty)" : "Subject"}</span>
          <input ref={lineRef} aria-label={isDuty ? "Duty" : "Subject"} placeholder={isDuty ? "Type the duty" : "Or type a subject"} value={c.subject}
            onChange={e => set({ subject: e.target.value })} style={inputStyle} />

          {!isDuty && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginTop: 16 }}>
              <div>
                <span style={lbl}>Section</span>
                <input aria-label="Section" placeholder="Or type a section" value={c.section}
                  onChange={e => set({ section: e.target.value, year: c.year || yearOf(e.target.value) })} style={inputStyle} />
              </div>
              <div>
                <span style={lbl}>Year</span>
                <Chips items={["I", "II", "III", "IV"].map(y => ({ key: y, label: y, on: c.year === y }))} onPick={y => set({ year: c.year === y ? "" : y })} empty="" />
              </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 14, marginTop: 16 }}>
            <div><span style={lbl}>From</span><input type="time" aria-label="From" value={c.from} onChange={e => set({ from: e.target.value })} style={inputStyle} /></div>
            <div><span style={lbl}>To</span><input type="time" aria-label="To" value={c.to} onChange={e => set({ to: e.target.value })} style={inputStyle} /></div>
            <div>
              <span style={lbl}>Counts as</span>
              <Seg>
                {[1, 2, 3].map((k, i) => <SegBtn key={k} first={i === 0} active={c.periods === k} onClick={() => set({ periods: k })}>{k} {k === 1 ? "period" : "periods"}</SegBtn>)}
              </Seg>
            </div>
            {!isDuty && <div><span style={lbl}>Room</span><input aria-label="Room" placeholder="e.g. R-204" value={c.room} onChange={e => set({ room: e.target.value })} style={inputStyle} /></div>}
          </div>
        </div>

        {err && <div role="alert" style={{ marginTop: 16, fontSize: 13.5, color: P.red, background: P.redL, borderRadius: 8, padding: "8px 12px" }}>{err}</div>}

        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 24, flexWrap: "wrap" }}>
          <div>{!isNew && <Btn variant="ghost" onClick={onDelete}>Delete</Btn>}</div>
          <div style={{ display: "flex", gap: 10 }}>
            <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>
            <Btn onClick={apply}>{isNew ? "Add" : "Apply"}</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

function LoadStrip({ s, locked, bad }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px 22px", flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <b style={{ fontFamily: MONO, fontSize: 30, fontWeight: 600, lineHeight: 1 }}>{s.total}</b>
        <span style={{ color: P.gray, fontSize: 13 }}>periods this week (the figure your HoD sees)</span>
      </div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13 }}>
        {COUNTED.map(k => (
          <span key={k}><i style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, marginRight: 6, background: TYPE_STYLE[k].dot }} />{TL[k]} <b style={{ fontFamily: MONO }}>{s.counts[k]}</b></span>
        ))}
      </div>
      {locked > 0 && <span style={{ fontSize: 12.5, color: P.gray }}>{locked} published {locked === 1 ? "class is" : "classes are"} locked</span>}
      {bad > 0 && <span style={{ fontSize: 12.5, fontWeight: 700, color: P.red }}>{bad} {bad === 1 ? "entry overlaps" : "entries overlap"}</span>}
    </div>
  );
}

export function TimetablePrintBody({ name, desig, term, week }) {
  const s = stats(week);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{name}</div>
          <div style={{ fontSize: 14, color: P.gray }}>{[desig, "Weekly Timetable", term].filter(Boolean).join(" · ")}</div>
        </div>
        <div style={{ fontSize: 14 }}><b style={{ fontFamily: MONO }}>{s.total}</b> periods per week</div>
      </div>
      <WeekCards week={week} editable={false} compact />
    </div>
  );
}

export default function TimetablePage({ user }) {
  const [items, setItems] = useState(null);
  const [pub, setPub] = useState([]);
  const [term, setTerm] = useState("");
  const [editing, setEditing] = useState(null); // { item, isNew }
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dlOpen, setDlOpen] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const [msg, setMsg] = useState(null);
  const [options, setOptions] = useState({ pairs: [] });
  const dlRef = useRef(null);

  useEffect(() => {
    let alive = true;
    getDoc(doc(db, "facultyTimetables", user.phone)).then(snap => {
      if (!alive) return;
      setItems(snap.exists() ? itemsFromStore(snap.data()) : []);
      setTerm(snap.exists() ? (snap.data().term || "") : "");
    }).catch(() => { if (alive) setItems([]); });
    const unsub = onSnapshot(collection(db, "masterTimetables"), snap => {
      if (alive) setPub(snap.docs.flatMap(d => (d.data().blocks || []).map(b => ({ ...b, publishedYear: d.id }))));
    }, () => {});
    getDocs(collection(db, "sections")).then(snap => {
      if (!alive) return;
      const pairs = [];
      snap.docs.forEach(d => {
        const sec = d.data();
        if (sec.deleted) return;
        (sec.subjects || []).forEach(sub => { if (sub.facultyPhone === user.phone) pairs.push({ subject: sub.name, section: sec.name }); });
      });
      const seen = new Set();
      const unique = pairs.filter(p => { const k = p.subject + "\u0000" + p.section; if (seen.has(k)) return false; seen.add(k); return true; })
        .sort((a, b) => a.subject.localeCompare(b.subject) || a.section.localeCompare(b.section));
      setOptions({ pairs: unique });
    }).catch(() => {});
    return () => { alive = false; unsub(); };
  }, [user.phone]);

  useEffect(() => {
    function onDoc(e) { if (dlRef.current && !dlRef.current.contains(e.target)) setDlOpen(false); }
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  const week = useMemo(() => buildWeek(items || [], pub, user.phone), [items, pub, user.phone]);
  if (!items) return <Spinner />;

  const s = stats(week);
  const locked = week.reduce((n, l) => n + l.filter(e => e.locked).length, 0);
  const bad = conflictCount(week);

  function edit(next) { setItems(next); setDirty(true); setMsg(null); }
  function openNew(d) {
    const last = week[d].reduce((m, e) => Math.max(m, e.end), 0);
    const start = last && last < 17 * 60 ? last : 9 * 60;
    setEditing({ item: mkItem(d, { start, end: start + 50 }), isNew: true });
  }
  function openEdit(e) { setEditing({ item: items.find(x => x.id === e.id) || e, isNew: false }); }
  function apply(item) {
    edit(editing.isNew ? items.concat(item) : items.map(x => x.id === item.id ? item : x));
    setEditing(null);
  }
  function remove() { edit(items.filter(x => x.id !== editing.item.id)); setEditing(null); }

  async function save() {
    setSaving(true);
    try {
      await setDoc(doc(db, "facultyTimetables", user.phone), { ...toStore(items), term, updatedAt: new Date().toISOString() });
      setDirty(false);
      setMsg({ ok: true, text: "Timetable saved." });
    } catch (e) {
      setMsg({ ok: false, text: "Could not save: " + e.message });
    }
    setSaving(false);
  }

  const others = editing ? (week[editing.item.day] || []).filter(e => e.id !== editing.item.id) : [];

  return (
    <div style={{ padding: "16px clamp(16px, 2vw, 28px) 60px", display: "flex", flexDirection: "column", gap: 14, maxWidth: 1800, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, whiteSpace: "nowrap" }}>Weekly Timetable</h1>
          <input value={term} onChange={e => { setTerm(e.target.value); setDirty(true); }} placeholder="Term, e.g. 2026-27 Sem I"
            aria-label="Term" style={{ ...inputStyle, width: 190, padding: "5px 10px", fontSize: 13 }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {msg
            ? <span style={{ fontSize: 12.5, fontWeight: 600, padding: "5px 12px", borderRadius: 20, background: msg.ok ? P.greenL : P.redL, color: msg.ok ? P.green : P.red }}>{msg.text}</span>
            : <span style={{ fontSize: 12.5, fontWeight: 600, padding: "5px 12px", borderRadius: 20, background: dirty ? P.amberL : P.greenL, color: dirty ? P.amber : P.green }}>{dirty ? "Unsaved changes" : "All changes saved"}</span>}
          <div ref={dlRef} style={{ position: "relative" }}>
            <Btn small variant="outline" onClick={() => setDlOpen(v => !v)}>Download ▾</Btn>
            {dlOpen && (
              <div role="menu" style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", minWidth: 250, background: "#fff", border: "1px solid " + P.border, borderRadius: 10, boxShadow: "0 10px 28px rgba(0,0,0,0.18)", padding: 6, zIndex: 30 }}>
                {[["PDF", "One landscape page, ready to print", () => setShowPrint(true)],
                  ["Excel (.xlsx)", "Editable spreadsheet", () => exportTimetableXLSX(user.name, term, week)]].map(([t, sub, fn]) => (
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

      <Card style={{ padding: "14px 18px", margin: 0 }}>
        <LoadStrip s={s} locked={locked} bad={bad} />
      </Card>

      {locked > 0 && (
        <div style={{ background: P.blueL, color: P.blue, borderRadius: 10, padding: "9px 14px", fontSize: 13.5 }}>
          Classes with a padlock come from the published timetable and can't be changed here. Add your duties, or classes of a year that isn't published yet, with “+ Add duty or class”.
        </div>
      )}

      <WeekCards week={week} editable onAdd={openNew} onEdit={openEdit} />

      {editing && (
        <EntryEditor
          key={editing.item.id}
          day={editing.item.day}
          initial={editing.item}
          isNew={editing.isNew}
          others={others}
          options={options}
          onCancel={() => setEditing(null)}
          onApply={apply}
          onDelete={remove}
        />
      )}

      {showPrint && (
        <PrintShell title="Timetable preview" onClose={() => setShowPrint(false)}>
          <TimetablePrintBody name={user.name} desig={user.designation} term={term} week={week} />
        </PrintShell>
      )}
    </div>
  );
}
