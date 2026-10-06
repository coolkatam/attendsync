// src/sections/SectionsSetupWizard.jsx
// A 3-step flow for setting up a year's sections:
//   1. Sections  — Year + Section-letter (or a custom label like AL/SL) → Save
//   2. Subjects  — subject name + short name (+ type), applied to any of your sections
//   3. Assign Faculty — pick a subject, build its ordered faculty list (Main
//      first, then Assisting), tick the sections it applies to, one save.
// Student rosters and periods-per-day are still set from a section's own
// detail page — this wizard is only about section names, subjects and who
// teaches what.

import React, { useState, useEffect } from "react";
import { collection, doc, getDoc, setDoc, updateDoc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { P, Btn, Card, Sel, Fld, TopBar } from "../components/UI";
import { MASTER_ADMIN_PHONE } from "../utils";
import FacultyListEditor, { cleanList } from "./FacultyListEditor";
import { facultyListOf, sameList, withFaculty, suggestShort, guessType, shortOf, SUBJECT_TYPES } from "./subjectUtils";

const newId = () => "sub-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
const YEARS = ["I", "II", "III", "IV"];
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

const thStyle = { padding: "8px 10px", textAlign: "left", fontWeight: 600, fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.03em", color: P.gray, borderBottom: "1.5px solid " + P.border };
const tdStyle = { padding: "9px 10px", fontSize: 13, borderBottom: "1px solid " + P.border, verticalAlign: "top" };
const cellInput = { width: "100%", boxSizing: "border-box", border: "1px solid " + P.border, borderRadius: 8, padding: "8px 10px", fontSize: 14, fontFamily: "inherit", background: "#fff" };

export default function SectionsSetupWizard({ user, onBack }) {
  const [step, setStep] = useState(1);
  const [sections, setSections] = useState([]);
  const [facultyList, setFacultyList] = useState([]);
  const isMaster = user.phone === MASTER_ADMIN_PHONE;

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "sections"), snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => !s.deleted);
      setSections(isMaster ? all : all.filter(s => s.adminPhone === user.phone));
    });
    return unsub;
  }, [user.phone, isMaster]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "users"), snap => {
      setFacultyList(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u.status === "approved"));
    });
    return unsub;
  }, []);

  async function createSection(name) {
    const id = "sec-" + Date.now();
    await setDoc(doc(db, "sections", id), {
      name, adminPhone: user.phone, students: [], subjects: [], periodsPerDay: 7,
    });
  }

  // subjects: [{ name, short, type }]. A subject already in a section (same name) is not added twice,
  // but picks up its short name if it didn't have one.
  async function saveSubjectsToSections(subjects, sectionIds) {
    for (const secId of sectionIds) {
      const sec = sections.find(s => s.id === secId);
      if (!sec) continue;
      const list = (sec.subjects || []).map(s => ({ ...s }));
      let changed = false;
      subjects.forEach(inc => {
        const hit = list.find(s => s.name.trim().toLowerCase() === inc.name.trim().toLowerCase());
        if (hit) {
          if (!hit.short) { hit.short = inc.short; changed = true; }
        } else {
          list.push({ id: newId(), name: inc.name.trim(), short: inc.short, type: inc.type, facultyPhone: "", faculty: [], batches: [] });
          changed = true;
        }
      });
      if (changed) await updateDoc(doc(db, "sections", secId), { subjects: list });
    }
  }

  // shortByName: { subject name -> short name }, applied to every one of my sections that has that subject.
  async function saveShortNames(shortByName) {
    for (const sec of sections) {
      let changed = false;
      const list = (sec.subjects || []).map(s => {
        const v = shortByName[s.name];
        if (v !== undefined && v !== (s.short || "")) { changed = true; return { ...s, short: v }; }
        return s;
      });
      if (changed) await updateDoc(doc(db, "sections", sec.id), { subjects: list });
    }
  }

  // Ticked sections get this ordered faculty list for `subjectName`. Unticked sections that still carry the
  // list this form was loaded with are cleared, so the ticks are the source of truth for "who's assigned here".
  // Attendance and marks follow the Main faculty only (the first in the list).
  async function assignFacultyBulk(subjectName, list, checkedSectionIds, originalList) {
    const relevant = sections.filter(sec => (sec.subjects || []).some(s => s.name === subjectName));
    for (const sec of relevant) {
      const sub = sec.subjects.find(s => s.name === subjectName);
      const cur = facultyListOf(sub);
      let next = cur;
      if (checkedSectionIds.includes(sec.id)) next = list;
      else if (sameList(cur, originalList)) next = [];
      if (sameList(next, cur)) continue;
      const updated = sec.subjects.map(s => s.id === sub.id ? withFaculty(s, next) : s);
      await updateDoc(doc(db, "sections", sec.id), { subjects: updated });
      const main = next[0] || "";
      await setDoc(doc(db, "attendance", sec.id, "subjects", sub.id), { teacherPhone: main }, { merge: true });
      await setDoc(doc(db, "internalMarks", sec.id, "subjects", sub.id), { teacherPhone: main }, { merge: true });
    }
  }

  return (
    <div style={{ background: P.bg, minHeight: "100vh" }}>
      <TopBar title="Sections, Subjects & Faculty" subtitle="Set up sections, add subjects, then assign faculty" onBack={onBack} />
      <StepTabs step={step} setStep={setStep} />
      <div style={{ padding: 16, maxWidth: 900, margin: "0 auto" }}>
        {step === 1 && <StepSections sections={sections} onCreate={createSection} onNext={() => setStep(2)} />}
        {step === 2 && <StepSubjects sections={sections} onSave={saveSubjectsToSections} onSaveShorts={saveShortNames} onBack={() => setStep(1)} onNext={() => setStep(3)} />}
        {step === 3 && <StepAssign sections={sections} facultyList={facultyList} onAssign={assignFacultyBulk} onBack={() => setStep(2)} onDone={onBack} />}
      </div>
    </div>
  );
}

// ── Step tabs ──────────────────────────────────────────────
function StepTabs({ step, setStep }) {
  const steps = [{ n: 1, label: "Sections" }, { n: 2, label: "Subjects" }, { n: 3, label: "Assign Faculty" }];
  return (
    <div style={{ background: "#fff", borderBottom: "1px solid " + P.border, display: "flex", padding: "0 16px" }}>
      {steps.map(s => (
        <button key={s.n} onClick={() => setStep(s.n)}
          style={{ border: "none", background: "none", cursor: "pointer", padding: "14px 18px", fontSize: 13.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 9, color: step === s.n ? P.navy : P.gray, borderBottom: step === s.n ? "3px solid " + P.blue : "3px solid transparent", fontFamily: "inherit" }}>
          <span style={{ width: 20, height: 20, borderRadius: "50%", background: step >= s.n ? P.blue : P.border, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>
            {step > s.n ? "✓" : s.n}
          </span>
          {s.label}
        </button>
      ))}
    </div>
  );
}

// ── Step 1 — Sections ─────────────────────────────────────
function StepSections({ sections, onCreate, onNext }) {
  const [year, setYear] = useState("III");
  const [letter, setLetter] = useState("A");
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const name = year + "-" + (label.trim() || letter);

  async function save() {
    setSaving(true);
    await onCreate(name);
    setLabel("");
    setSaving(false);
  }

  return (
    <div>
      <Card>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Add a section</div>
        <div style={{ fontSize: 12.5, color: P.gray, marginBottom: 16, lineHeight: 1.6 }}>
          Pick the year and a section letter — or leave the letter as default and type your own label (like AL, SL) if that's what this section is actually called.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "110px 110px 1fr", gap: 12, alignItems: "start" }}>
          <Sel label="Year" value={year} onChange={setYear} options={YEARS.map(y => ({ value: y, label: y }))} />
          <Sel label="Section" value={letter} onChange={setLetter} options={LETTERS.map(l => ({ value: l, label: l }))} />
          <Fld label="Or custom label (optional) — e.g. AL, SL" value={label} onChange={setLabel} placeholder="Leave blank to use the section letter" />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: P.blueL, borderRadius: 9, padding: "10px 14px", marginBottom: 16 }}>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: P.gray, textTransform: "uppercase" }}>Section name</span>
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 15, color: P.blue }}>{name}</span>
        </div>
        <Btn onClick={save} disabled={saving}>{saving ? "Saving…" : "+ Save section"}</Btn>
      </Card>

      <Card>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Sections added so far</div>
        <div style={{ fontSize: 12.5, color: P.gray, marginBottom: 14 }}>
          Upload each section's student roster (CSV) any time from its own detail page — this step is just about creating the sections.
        </div>
        {sections.length === 0 ? (
          <div style={{ textAlign: "center", color: P.gray, padding: "1.5rem", border: "1.5px dashed " + P.border, borderRadius: 10, fontSize: 13 }}>No sections yet.</div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {sections.map(s => (
              <span key={s.id} style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 13, background: P.bg, border: "1px solid " + P.border, borderRadius: 20, padding: "6px 14px" }}>{s.name}</span>
            ))}
          </div>
        )}
      </Card>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Btn onClick={onNext}>Next: Subjects →</Btn>
      </div>
    </div>
  );
}

// ── Step 2 — Subjects ──────────────────────────────────────
const blankRow = () => ({ name: "", short: "", type: "" });

function StepSubjects({ sections, onSave, onSaveShorts, onBack, onNext }) {
  const [rows, setRows] = useState([blankRow(), blankRow(), blankRow()]);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [uncheckedIds, setUncheckedIds] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(null);
  const [shortEdits, setShortEdits] = useState({});
  const [savingShorts, setSavingShorts] = useState(false);

  const selectedIds = sections.filter(s => !uncheckedIds.has(s.id)).map(s => s.id);
  const filled = rows.filter(r => r.name.trim());
  const subjects = filled.map(r => ({ name: r.name.trim(), short: r.short.trim() || suggestShort(r.name), type: r.type || guessType(r.name) }));

  const setRow = (i, patch) => setRows(prev => prev.map((r, k) => k === i ? { ...r, ...patch } : r));
  const removeRow = i => setRows(prev => prev.length > 1 ? prev.filter((_, k) => k !== i) : [blankRow()]);

  function addPasted() {
    const parsed = pasteText.split("\n").map(l => l.trim()).filter(Boolean).map(l => {
      const m = /^(.*?)[\t,]\s*(.+)$/.exec(l);
      return m ? { name: m[1].trim(), short: m[2].trim(), type: "" } : { name: l, short: "", type: "" };
    });
    if (!parsed.length) return;
    setRows(prev => [...prev.filter(r => r.name.trim()), ...parsed]);
    setPasteText(""); setPasteOpen(false);
  }

  function toggle(id) {
    setUncheckedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function save() {
    if (subjects.length === 0 || selectedIds.length === 0) return;
    setSaving(true);
    setSavedMsg(null);
    await onSave(subjects, selectedIds);
    setSaving(false);
    setSavedMsg("Saved " + subjects.length + " subject" + (subjects.length === 1 ? "" : "s") + " to " + selectedIds.length + " section" + (selectedIds.length === 1 ? "" : "s") + ".");
    setRows([blankRow(), blankRow(), blankRow()]);
  }

  // Existing subjects, one line per distinct name, with the short name they currently carry.
  const existing = [];
  const seen = new Set();
  sections.forEach(s => (s.subjects || []).forEach(sub => {
    if (seen.has(sub.name)) { const e = existing.find(x => x.name === sub.name); if (e && !e.short && sub.short) e.short = sub.short; return; }
    seen.add(sub.name);
    existing.push({ name: sub.name, short: sub.short || "" });
  }));
  existing.sort((a, b) => a.name.localeCompare(b.name));
  const shortValue = e => shortEdits[e.name] !== undefined ? shortEdits[e.name] : e.short;
  const dirtyShorts = Object.keys(shortEdits).filter(n => shortEdits[n] !== (existing.find(e => e.name === n) || {}).short);

  async function saveShorts() {
    setSavingShorts(true);
    const out = {};
    dirtyShorts.forEach(n => { out[n] = shortEdits[n].trim(); });
    await onSaveShorts(out);
    setShortEdits({});
    setSavingShorts(false);
  }

  return (
    <div>
      <Card>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Add subjects</div>
        <div style={{ fontSize: 12.5, color: P.gray, marginBottom: 14, lineHeight: 1.6 }}>
          Give each subject its full name and a short name. The short name is what goes in the timetable sheet, like TD for Thermodynamics. Leave the short name blank to use the suggestion. A subject already in a section (same name) won't be added twice.
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 520 }}>
            <thead>
              <tr><th style={thStyle}>Subject name</th><th style={{ ...thStyle, width: 150 }}>Short name</th><th style={{ ...thStyle, width: 150 }}>Type</th><th style={{ ...thStyle, width: 40 }} /></tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td style={{ ...tdStyle, paddingLeft: 0 }}><input aria-label={"Subject name " + (i + 1)} value={r.name} onChange={e => setRow(i, { name: e.target.value })} placeholder="e.g. Mechanics of Solids" style={cellInput} /></td>
                  <td style={tdStyle}><input aria-label={"Short name " + (i + 1)} value={r.short} onChange={e => setRow(i, { short: e.target.value })} placeholder={r.name.trim() ? suggestShort(r.name) : "e.g. MOS"} style={{ ...cellInput, fontFamily: "'IBM Plex Mono', monospace" }} /></td>
                  <td style={tdStyle}>
                    <select aria-label={"Type " + (i + 1)} value={r.type} onChange={e => setRow(i, { type: e.target.value })} style={cellInput}>
                      <option value="">{r.name.trim() ? "Auto (" + guessType(r.name) + ")" : "Auto"}</option>
                      {SUBJECT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>
                  <td style={{ ...tdStyle, paddingRight: 0 }}>
                    <button type="button" onClick={() => removeRow(i)} aria-label="Remove this row" style={{ border: "1px solid " + P.border, background: "#fff", borderRadius: 8, width: 32, height: 34, color: P.red, cursor: "pointer", fontSize: 15 }}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", gap: 8, margin: "10px 0 16px", flexWrap: "wrap" }}>
          <Btn small variant="outline" onClick={() => setRows(r => [...r, blankRow()])}>+ Add subject</Btn>
          <Btn small variant="ghost" onClick={() => setPasteOpen(v => !v)}>{pasteOpen ? "Close paste box" : "Paste a list"}</Btn>
        </div>
        {pasteOpen && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12.5, color: P.gray, marginBottom: 6 }}>One subject per line. To give a short name too, put it after a comma or tab: <b>Thermodynamics, TD</b>. Pasting two columns from Excel works.</div>
            <textarea value={pasteText} onChange={e => setPasteText(e.target.value)} rows={5}
              placeholder={"Thermodynamics, TD\nFluid Mechanics and Hydraulic Machinery, FMHM\nMechanics of Solids, MOS"}
              style={{ ...cellInput, marginBottom: 8 }} />
            <Btn small onClick={addPasted} disabled={!pasteText.trim()}>Add these to the table</Btn>
          </div>
        )}

        <div style={{ fontSize: 12, fontWeight: 600, color: P.gray, marginBottom: 8, textTransform: "uppercase" }}>Add to these sections</div>
        {sections.length === 0 ? (
          <div style={{ color: P.gray, fontSize: 13, marginBottom: 14 }}>No sections yet — go back and add some first.</div>
        ) : (
          <div style={{ border: "1.5px solid " + P.border, borderRadius: 10, padding: 6, maxHeight: 220, overflowY: "auto", marginBottom: 16 }}>
            {sections.map(s => (
              <label key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 7, cursor: "pointer" }}>
                <input type="checkbox" checked={!uncheckedIds.has(s.id)} onChange={() => toggle(s.id)} style={{ width: 16, height: 16, accentColor: P.blue }} />
                <span style={{ fontWeight: 600, fontSize: 13.5 }}>{s.name}</span>
                <span style={{ fontSize: 11.5, color: P.gray }}>· {s.subjects?.length || 0} subjects</span>
              </label>
            ))}
          </div>
        )}

        {savedMsg && <div style={{ background: P.greenL, color: P.green, fontSize: 13, padding: "8px 12px", borderRadius: 8, marginBottom: 12 }}>{savedMsg}</div>}
        <Btn onClick={save} disabled={saving || subjects.length === 0 || selectedIds.length === 0}>
          {saving ? "Saving…" : "Save " + subjects.length + " subject" + (subjects.length === 1 ? "" : "s") + " to " + selectedIds.length + " section" + (selectedIds.length === 1 ? "" : "s")}
        </Btn>
      </Card>

      {existing.length > 0 && (
        <Card>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Short names of existing subjects</div>
          <div style={{ fontSize: 12.5, color: P.gray, marginBottom: 12, lineHeight: 1.6 }}>
            Subjects added earlier may not have a short name yet. Blank ones show a suggestion; correct any that are wrong and save. The change applies to every one of your sections that has the subject.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "8px 18px", marginBottom: 14 }}>
            {existing.map(e => (
              <div key={e.name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={e.name}>{e.name}</span>
                <input aria-label={"Short name for " + e.name} value={shortValue(e)} onChange={ev => setShortEdits(prev => ({ ...prev, [e.name]: ev.target.value }))}
                  placeholder={suggestShort(e.name)} style={{ ...cellInput, width: 110, fontFamily: "'IBM Plex Mono', monospace" }} />
              </div>
            ))}
          </div>
          <Btn small onClick={saveShorts} disabled={savingShorts || dirtyShorts.length === 0}>{savingShorts ? "Saving…" : "Save short names"}</Btn>
        </Card>
      )}

      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <Btn variant="outline" onClick={onBack}>← Back</Btn>
        <Btn onClick={onNext}>Next: Assign Faculty →</Btn>
      </div>
    </div>
  );
}

// ── Step 3 — Assign Faculty ────────────────────────────────
function StepAssign({ sections, facultyList, onAssign, onBack, onDone }) {
  const subjectNames = Array.from(new Set(sections.flatMap(s => (s.subjects || []).map(sub => sub.name)))).sort();
  const [subjectName, setSubjectName] = useState("");
  const [list, setList] = useState([""]);
  const [originalList, setOriginalList] = useState([]);
  const [checkedIds, setCheckedIds] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    if (!subjectName && subjectNames.length > 0) setSubjectName(subjectNames[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectNames.length]);

  const relevantSections = sections.filter(s => (s.subjects || []).some(sub => sub.name === subjectName));

  // Picking a subject loads the faculty list it already has (taken from the first section that has one)
  // and ticks every section that carries exactly that list.
  useEffect(() => {
    setMsg(null);
    const lists = relevantSections.map(s => ({ id: s.id, list: facultyListOf(s.subjects.find(sub => sub.name === subjectName)) }));
    const first = lists.find(l => l.list.length);
    const base = first ? first.list : [];
    setList(base.length ? base : [""]);
    setOriginalList(base);
    setCheckedIds(new Set(base.length ? lists.filter(l => sameList(l.list, base)).map(l => l.id) : []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectName]);

  function toggle(id) {
    setCheckedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const cleaned = cleanList(list);

  async function save() {
    if (!subjectName || cleaned.length === 0) return;
    setSaving(true);
    await onAssign(subjectName, cleaned, Array.from(checkedIds), originalList);
    setOriginalList(cleaned);
    setSaving(false);
    setMsg("Saved. " + (checkedIds.size) + " section" + (checkedIds.size === 1 ? "" : "s") + " now " + (checkedIds.size === 1 ? "has" : "have") + " " + cleaned.length + " faculty for " + subjectName + ".");
  }

  const facultyOptions = facultyList.slice()
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
    .map(u => {
      const phoneVal = u.phone || u.id;
      return { value: phoneVal, label: (u.name || phoneVal) + " · " + phoneVal };
    });
  const nameOf = phone => (facultyOptions.find(o => o.value === phone) || { label: phone }).label.split(" · ")[0];

  return (
    <div>
      <Card>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Assign faculty to a subject</div>
        <div style={{ fontSize: 12.5, color: P.gray, marginBottom: 16, lineHeight: 1.6 }}>
          Pick the subject, set its faculty (the first is the Main faculty, add more as Assisting), then tick every section this applies to. One save assigns them all.
        </div>
        {subjectNames.length === 0 ? (
          <div style={{ color: P.gray, fontSize: 13 }}>No subjects yet — go back and add some first.</div>
        ) : (
          <>
            <Sel label="Subject" value={subjectName} onChange={setSubjectName} options={subjectNames.map(n => ({ value: n, label: n }))} />

            <div style={{ fontSize: 12, fontWeight: 600, color: P.gray, margin: "4px 0 8px", textTransform: "uppercase" }}>Faculty for "{subjectName}"</div>
            <FacultyListEditor list={list} onChange={setList} facultyOptions={facultyOptions} />

            <div style={{ fontSize: 12, fontWeight: 600, color: P.gray, margin: "18px 0 8px", textTransform: "uppercase" }}>
              Tick every section this faculty list applies to
            </div>
            <div style={{ border: "1.5px solid " + P.border, borderRadius: 10, padding: 6, maxHeight: 220, overflowY: "auto", marginBottom: 16 }}>
              {relevantSections.map(s => {
                const cur = facultyListOf(s.subjects.find(x => x.name === subjectName));
                const differs = cur.length > 0 && !sameList(cur, cleaned);
                return (
                  <label key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 7, cursor: "pointer" }}>
                    <input type="checkbox" checked={checkedIds.has(s.id)} onChange={() => toggle(s.id)} style={{ width: 16, height: 16, accentColor: P.blue }} />
                    <span style={{ fontWeight: 600, fontSize: 13.5 }}>{s.name}</span>
                    <span style={{ fontSize: 11.5, color: P.gray }}>· {s.students?.length || 0} students</span>
                    {differs && (
                      <span style={{ fontSize: 11, color: P.amber, marginLeft: "auto" }}>currently: {cur.map(nameOf).join(", ")}</span>
                    )}
                  </label>
                );
              })}
            </div>

            {msg && <div style={{ background: P.greenL, color: P.green, fontSize: 13, padding: "8px 12px", borderRadius: 8, marginBottom: 12 }}>{msg}</div>}
            <Btn onClick={save} disabled={saving || cleaned.length === 0}>
              {saving ? "Saving…" : "Assign to " + checkedIds.size + " section" + (checkedIds.size === 1 ? "" : "s")}
            </Btn>
          </>
        )}
      </Card>

      <Card>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>Current assignments</div>
        <AssignmentsSummary sections={sections} subjectNames={subjectNames} />
      </Card>

      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <Btn variant="outline" onClick={onBack}>← Back</Btn>
        <Btn variant="ghost" onClick={onDone}>Done for now — go to dashboard</Btn>
      </div>
    </div>
  );
}

function AssignmentsSummary({ sections, subjectNames }) {
  const [names, setNames] = useState({});

  useEffect(() => {
    const phones = new Set();
    sections.forEach(s => (s.subjects || []).forEach(sub => facultyListOf(sub).forEach(p => phones.add(p))));
    phones.forEach(p => {
      if (names[p] !== undefined) return;
      getDoc(doc(db, "users", p)).then(snap => {
        setNames(prev => ({ ...prev, [p]: snap.exists() ? snap.data().name : p }));
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections]);

  if (subjectNames.length === 0) return <div style={{ color: P.gray, fontSize: 13 }}>Nothing to show yet.</div>;

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th style={thStyle}>Subject</th>
            <th style={thStyle}>Assigned</th>
            <th style={thStyle}>Not assigned</th>
          </tr>
        </thead>
        <tbody>
          {subjectNames.map(name => {
            const withIt = sections.filter(s => (s.subjects || []).some(sub => sub.name === name));
            const assigned = withIt.filter(s => facultyListOf(s.subjects.find(sub => sub.name === name)).length > 0);
            const unassigned = withIt.filter(s => facultyListOf(s.subjects.find(sub => sub.name === name)).length === 0);
            const sample = (withIt[0] && withIt[0].subjects.find(sub => sub.name === name)) || {};
            return (
              <tr key={name}>
                <td style={{ ...tdStyle, fontWeight: 600 }}>
                  {name}
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, color: P.gray, fontWeight: 500 }}>{shortOf(sample)}</div>
                </td>
                <td style={tdStyle}>
                  {assigned.length === 0 ? "—" : assigned.map(s => {
                    const l = facultyListOf(s.subjects.find(x => x.name === name));
                    return (
                      <div key={s.id} style={{ marginBottom: 3 }}>
                        {s.name}: <b>{names[l[0]] || l[0]}</b>
                        {l.length > 1 && <span style={{ color: P.gray }}> + {l.slice(1).map(p => names[p] || p).join(", ")} (Asst.)</span>}
                      </div>
                    );
                  })}
                </td>
                <td style={tdStyle}>{unassigned.length === 0 ? "—" : unassigned.map(s => s.name).join(", ")}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
