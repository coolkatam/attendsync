// src/sections/SectionsSetupWizard.jsx
// Replaces the old single-section "New section" form with a 3-step flow:
//   1. Sections  — Year + Section-letter (or a custom label like AL/SL) → Save
//   2. Subjects  — paste a subject list once, apply it to any of your sections
//   3. Assign Faculty — pick Subject + Faculty, tick every section they teach
//      it in, and one save assigns (or unassigns) all of them at once.
// Student rosters and periods-per-day are still set from a section's own
// detail page — this wizard is only about section names, subjects and who
// teaches what.

import React, { useState, useEffect } from "react";
import { collection, doc, getDoc, setDoc, updateDoc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { P, Btn, Card, Sel, Fld, TopBar } from "../components/UI";
import { MASTER_ADMIN_PHONE } from "../utils";

const YEARS = ["I", "II", "III", "IV"];
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

const thStyle = { padding: "8px 10px", textAlign: "left", fontWeight: 600, fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.03em", color: P.gray, borderBottom: "1.5px solid " + P.border };
const tdStyle = { padding: "9px 10px", fontSize: 13, borderBottom: "1px solid " + P.border, verticalAlign: "top" };

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

  async function saveSubjectsToSections(subjectNames, sectionIds) {
    for (const secId of sectionIds) {
      const sec = sections.find(s => s.id === secId);
      if (!sec) continue;
      const existingNames = new Set((sec.subjects || []).map(s => s.name.trim().toLowerCase()));
      const toAdd = subjectNames.filter(n => !existingNames.has(n.trim().toLowerCase()));
      if (toAdd.length === 0) continue;
      const newSubs = toAdd.map((n, i) => ({ id: "sub-" + Date.now() + "-" + i, name: n.trim(), type: "Theory", facultyPhone: "", batches: [] }));
      await updateDoc(doc(db, "sections", secId), { subjects: [...(sec.subjects || []), ...newSubs] });
    }
  }

  // Ticked sections get this faculty assigned to `subjectName`; sections that
  // currently have THIS faculty assigned but were left unticked get cleared —
  // the checkboxes are the source of truth for "who's assigned here".
  async function assignFacultyBulk(subjectName, facultyPhone, checkedSectionIds) {
    const relevant = sections.filter(sec => (sec.subjects || []).some(s => s.name === subjectName));
    for (const sec of relevant) {
      const sub = sec.subjects.find(s => s.name === subjectName);
      const shouldBeAssigned = checkedSectionIds.includes(sec.id);
      let newPhone = sub.facultyPhone || "";
      if (shouldBeAssigned) newPhone = facultyPhone;
      else if (sub.facultyPhone === facultyPhone) newPhone = "";
      if (newPhone === (sub.facultyPhone || "")) continue;
      const updatedSubs = sec.subjects.map(s => s.id === sub.id ? { ...s, facultyPhone: newPhone } : s);
      await updateDoc(doc(db, "sections", sec.id), { subjects: updatedSubs });
      if (newPhone) {
        await setDoc(doc(db, "attendance", sec.id, "subjects", sub.id), { teacherPhone: newPhone }, { merge: true });
        await setDoc(doc(db, "internalMarks", sec.id, "subjects", sub.id), { teacherPhone: newPhone }, { merge: true });
      }
    }
  }

  return (
    <div style={{ background: P.bg, minHeight: "100vh" }}>
      <TopBar title="Sections, Subjects & Faculty" subtitle="Set up sections, add subjects, then assign faculty" onBack={onBack} />
      <StepTabs step={step} setStep={setStep} />
      <div style={{ padding: 16, maxWidth: 900, margin: "0 auto" }}>
        {step === 1 && <StepSections sections={sections} onCreate={createSection} onNext={() => setStep(2)} />}
        {step === 2 && <StepSubjects sections={sections} onSave={saveSubjectsToSections} onBack={() => setStep(1)} onNext={() => setStep(3)} />}
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
function StepSubjects({ sections, onSave, onBack, onNext }) {
  const [text, setText] = useState("");
  const [uncheckedIds, setUncheckedIds] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(null);

  const selectedIds = sections.filter(s => !uncheckedIds.has(s.id)).map(s => s.id);
  const subjectNames = text.split("\n").map(s => s.trim()).filter(Boolean);

  function toggle(id) {
    setUncheckedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function save() {
    if (subjectNames.length === 0 || selectedIds.length === 0) return;
    setSaving(true);
    setSavedMsg(null);
    await onSave(subjectNames, selectedIds);
    setSaving(false);
    setSavedMsg("Saved " + subjectNames.length + " subject" + (subjectNames.length === 1 ? "" : "s") + " to " + selectedIds.length + " section" + (selectedIds.length === 1 ? "" : "s") + ".");
  }

  return (
    <div>
      <Card>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Upload subject names</div>
        <div style={{ fontSize: 12.5, color: P.gray, marginBottom: 14, lineHeight: 1.6 }}>
          Type or paste one subject per line, then tick which sections to add them to below. A subject already present in a section (same name) won't be added twice.
        </div>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={5}
          placeholder={"Engineering Mechanics\nThermodynamics\nFluid Mechanics Lab"}
          style={{ width: "100%", boxSizing: "border-box", border: "1px solid " + P.border, borderRadius: 8, padding: "10px 12px", fontSize: 14, fontFamily: "inherit", marginBottom: 16 }} />

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
        <Btn onClick={save} disabled={saving || subjectNames.length === 0 || selectedIds.length === 0}>
          {saving ? "Saving…" : "Save " + (subjectNames.length || 0) + " subject" + (subjectNames.length === 1 ? "" : "s") + " to " + selectedIds.length + " section" + (selectedIds.length === 1 ? "" : "s")}
        </Btn>
      </Card>

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
  const [facultyPhone, setFacultyPhone] = useState("");
  const [checkedIds, setCheckedIds] = useState(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!subjectName && subjectNames.length > 0) setSubjectName(subjectNames[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectNames.length]);

  const relevantSections = sections.filter(s => (s.subjects || []).some(sub => sub.name === subjectName));

  useEffect(() => {
    if (!facultyPhone) { setCheckedIds(new Set()); return; }
    const pre = new Set(
      relevantSections
        .filter(s => (s.subjects.find(sub => sub.name === subjectName) || {}).facultyPhone === facultyPhone)
        .map(s => s.id)
    );
    setCheckedIds(pre);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectName, facultyPhone]);

  function toggle(id) {
    setCheckedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function save() {
    if (!subjectName || !facultyPhone) return;
    setSaving(true);
    await onAssign(subjectName, facultyPhone, Array.from(checkedIds));
    setSaving(false);
  }

  const facultyOptions = facultyList.slice()
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
    .map(u => {
      const phoneVal = u.phone || u.id;
      return { value: phoneVal, label: (u.name || phoneVal) + " · " + phoneVal };
    });

  return (
    <div>
      <Card>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Assign a faculty member to a subject</div>
        <div style={{ fontSize: 12.5, color: P.gray, marginBottom: 16, lineHeight: 1.6 }}>
          Pick the subject, pick the faculty member, then tick every section they should be assigned to for it — one save assigns all of them at once.
        </div>
        {subjectNames.length === 0 ? (
          <div style={{ color: P.gray, fontSize: 13 }}>No subjects yet — go back and add some first.</div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Sel label="Subject" value={subjectName} onChange={setSubjectName} options={subjectNames.map(n => ({ value: n, label: n }))} />
              <Sel label="Faculty" value={facultyPhone} onChange={setFacultyPhone} options={facultyOptions} />
            </div>

            <div style={{ fontSize: 12, fontWeight: 600, color: P.gray, marginBottom: 8, textTransform: "uppercase" }}>
              Tick every section this faculty member should teach "{subjectName}" in
            </div>
            <div style={{ border: "1.5px solid " + P.border, borderRadius: 10, padding: 6, maxHeight: 220, overflowY: "auto", marginBottom: 16 }}>
              {relevantSections.map(s => {
                const sub = s.subjects.find(x => x.name === subjectName);
                return (
                  <label key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 7, cursor: facultyPhone ? "pointer" : "not-allowed", opacity: facultyPhone ? 1 : 0.6 }}>
                    <input type="checkbox" checked={checkedIds.has(s.id)} onChange={() => toggle(s.id)} disabled={!facultyPhone} style={{ width: 16, height: 16, accentColor: P.blue }} />
                    <span style={{ fontWeight: 600, fontSize: 13.5 }}>{s.name}</span>
                    <span style={{ fontSize: 11.5, color: P.gray }}>· {s.students?.length || 0} students</span>
                    {sub.facultyPhone && sub.facultyPhone !== facultyPhone && (
                      <span style={{ fontSize: 11, color: P.amber, marginLeft: "auto" }}>currently: {sub.facultyPhone}</span>
                    )}
                  </label>
                );
              })}
            </div>

            <Btn onClick={save} disabled={saving || !facultyPhone}>
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
    sections.forEach(s => (s.subjects || []).forEach(sub => { if (sub.facultyPhone) phones.add(sub.facultyPhone); }));
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
            const assigned = withIt.filter(s => (s.subjects.find(sub => sub.name === name) || {}).facultyPhone);
            const unassigned = withIt.filter(s => !(s.subjects.find(sub => sub.name === name) || {}).facultyPhone);
            return (
              <tr key={name}>
                <td style={{ ...tdStyle, fontWeight: 600 }}>{name}</td>
                <td style={tdStyle}>
                  {assigned.length === 0 ? "—" : assigned.map(s => {
                    const sub = s.subjects.find(x => x.name === name);
                    return <div key={s.id}>{s.name}: <b>{names[sub.facultyPhone] || sub.facultyPhone}</b></div>;
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
