// src/originalSections/OriginalSectionsScreen.jsx
// Admin/HoD/Master-Admin screen for "Original Sections" — the roll-number-
// ordered exam sections (III-A, III-B, III-C…) used only for paper
// valuation. Completely separate from the merit-based teaching "sections":
// no attendance, no periods-per-day, no batches — just a roster and, per
// subject, which faculty member is responsible for valuing that subject's
// papers for that section.

import React, { useState, useEffect, useRef } from "react";
import { collection, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot } from "firebase/firestore";
import * as XLSX from "xlsx";
import { db } from "../firebase";
import { P, Btn, Card, Badge, Fld, Sel, TopBar, Spinner } from "../components/UI";
import { parseCSV, downloadTemplate } from "../utils";
import {
  calcPartA, calcPartBConv, calcFinalInternal, calcAssignment,
  calcDrawingMidConv, calcLabTotal, isLabSubject, isDrawingSubject,
} from "../marks/marksCalc";

export default function OriginalSectionsScreen({ user, onBack }) {
  const [screen, setScreen] = useState("list"); // list | new | detail
  const [sections, setSections] = useState([]);
  const [secId, setSecId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "originalSections"), snap => {
      setSections(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => !s.deleted));
      setLoading(false);
    });
    return unsub;
  }, []);

  if (loading) return <Spinner />;

  if (screen === "new") {
    return <NewOriginalSectionForm user={user} onBack={() => setScreen("list")} />;
  }

  if (screen === "detail" && secId) {
    const sec = sections.find(s => s.id === secId);
    if (!sec) { setScreen("list"); return null; }
    return <OriginalSectionDetail section={sec} onBack={() => { setScreen("list"); setSecId(null); }} />;
  }

  return (
    <div style={{ background: P.bg, minHeight: "100vh" }}>
      <TopBar title="All Sections Internal Marks" subtitle="Original (roll-number) exam sections" onBack={onBack} />
      <div style={{ padding: 16, maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ fontSize: 13, color: P.gray, marginBottom: 16, lineHeight: 1.6 }}>
          These are the sections used for paper valuation — III-A, III-B, III-C and so on,
          ordered by roll number. Upload each section's roster once, then assign a faculty
          member to value each subject's papers for it.
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>{sections.length} original section{sections.length === 1 ? "" : "s"}</div>
          <Btn small onClick={() => setScreen("new")}>+ New original section</Btn>
        </div>
        {sections.length === 0 && <div style={{ color: P.gray, textAlign: "center", padding: "2rem" }}>No original sections yet.</div>}
        {sections.map(sec => (
          <Card key={sec.id}>
            <div onClick={() => { setSecId(sec.id); setScreen("detail"); }} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15, color: P.blue, marginBottom: 4 }}>{sec.name}</div>
                <div style={{ fontSize: 13, color: P.gray }}>
                  {sec.students?.length || 0} students · {sec.subjects?.length || 0} subjects
                </div>
              </div>
              <span style={{ color: P.gray, fontSize: 20 }}>›</span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── New original section ────────────────────────────────────
function NewOriginalSectionForm({ user, onBack }) {
  const [name, setName] = useState("");
  const [subText, setSubText] = useState("");
  const [students, setStudents] = useState([]);
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef();

  async function save() {
    if (!name.trim()) { setMsg({ ok: false, text: "Section name required" }); return; }
    setSaving(true);
    const id = "osec-" + Date.now();
    const subs = subText.split("\n").filter(Boolean).map((s, i) => ({
      id: "sub-" + Date.now() + i, name: s.trim(), type: "Theory", valuatorPhone: "",
    }));
    await setDoc(doc(db, "originalSections", id), {
      name: name.trim(), students, subjects: subs, createdBy: user.phone,
    });
    setSaving(false);
    onBack();
  }

  return (
    <div style={{ background: P.bg, minHeight: "100vh" }}>
      <TopBar title="New original section" onBack={onBack} />
      <div style={{ padding: 16 }}>
        {msg && <div style={{ background: msg.ok ? P.greenL : P.redL, color: msg.ok ? P.green : P.red, fontSize: 13, padding: "10px 12px", borderRadius: 8, marginBottom: 12 }}>{msg.text}</div>}
        <Fld label="Section name" value={name} onChange={setName} placeholder="e.g. III-A" />
        <div style={{ fontSize: 12, color: P.gray, fontWeight: 500, marginBottom: 4 }}>Subjects (one per line)</div>
        <textarea value={subText} onChange={e => setSubText(e.target.value)} rows={4}
          placeholder={"Engineering Mechanics\nThermodynamics"}
          style={{ width: "100%", boxSizing: "border-box", border: "1px solid " + P.border, borderRadius: 8, padding: "9px 12px", fontSize: 14, fontFamily: "inherit", marginBottom: 16 }} />
        <Btn variant="outline" small onClick={downloadTemplate} style={{ marginBottom: 8 }}>⬇ Download CSV template</Btn>
        <div style={{ fontSize: 12, color: P.gray, margin: "8px 0" }}>Fill and upload, ordered by roll number. Roll Number is mandatory.</div>
        <input type="file" accept=".csv,.txt" ref={fileRef} style={{ display: "none" }} onChange={e => {
          const f = e.target.files[0]; if (!f) return;
          const reader = new FileReader();
          reader.onload = ev => {
            const p = parseCSV(ev.target.result);
            if (!p.length) { setMsg({ ok: false, text: "No valid students found." }); return; }
            setStudents(p); setMsg({ ok: true, text: p.length + " students loaded" });
          };
          reader.readAsText(f);
        }} />
        <Btn variant="accent" small onClick={() => fileRef.current.click()} style={{ marginBottom: 10 }}>⬆ Upload CSV</Btn>
        <Btn full onClick={save} disabled={saving} style={{ marginTop: 8 }}>{saving ? "Saving…" : "Create original section"}</Btn>
      </div>
    </div>
  );
}

// ── Original section detail ─────────────────────────────────
function OriginalSectionDetail({ section, onBack }) {
  const [tab, setTab] = useState("subjects");
  return (
    <div style={{ background: P.bg, minHeight: "100vh" }}>
      <TopBar title={section.name} subtitle="Original section detail" onBack={onBack} />
      <div style={{ background: "#fff", borderBottom: "1px solid " + P.border, display: "flex" }}>
        {["subjects", "students", "reports"].map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ border: "none", background: "none", cursor: "pointer", padding: "12px 16px", fontSize: 13, fontWeight: 600, color: tab === t ? P.blue : P.gray, borderBottom: tab === t ? "3px solid " + P.blue : "3px solid transparent", fontFamily: "inherit" }}>
            {t === "subjects" ? "Subjects & Valuators" : t === "students" ? "Students" : "Reports"}
          </button>
        ))}
      </div>
      <div style={{ padding: 16, maxWidth: 1100, margin: "0 auto" }}>
        {tab === "subjects" && <TabValuationSubjects section={section} />}
        {tab === "students" && <TabOriginalStudents section={section} />}
        {tab === "reports" && <TabOriginalReports section={section} />}
      </div>
    </div>
  );
}

// ── Students tab ─────────────────────────────────────────────
function TabOriginalStudents({ section }) {
  const [adding, setAdding] = useState(false);
  const [roll, setRoll] = useState(""); const [name, setName] = useState(""); const [gender, setGender] = useState(""); const [mobile, setMobile] = useState("");
  const fileRef = useRef();

  async function addStudent() {
    if (!roll) return;
    const updated = [...(section.students || []), { roll: roll.trim(), name: name.trim(), gender: gender.trim(), mobile: mobile.trim() }];
    await updateDoc(doc(db, "originalSections", section.id), { students: updated });
    setRoll(""); setName(""); setGender(""); setMobile(""); setAdding(false);
  }

  async function deleteStudent(roll) {
    if (!window.confirm("Remove this student from the original section roster?")) return;
    const updated = (section.students || []).filter(st => st.roll !== roll);
    await updateDoc(doc(db, "originalSections", section.id), { students: updated });
  }

  async function uploadCSV(e) {
    const f = e.target.files[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = async ev => {
      const p = parseCSV(ev.target.result);
      if (!p.length) return;
      await updateDoc(doc(db, "originalSections", section.id), { students: p });
    };
    reader.readAsText(f);
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{section.students?.length || 0} students</div>
        <div style={{ display: "flex", gap: 6 }}>
          <Btn small variant="outline" onClick={downloadTemplate}>⬇ Template</Btn>
          <input type="file" accept=".csv,.txt" ref={fileRef} onChange={uploadCSV} style={{ display: "none" }} />
          <Btn small variant="accent" onClick={() => fileRef.current.click()}>⬆ Upload</Btn>
          <Btn small onClick={() => setAdding(a => !a)}>+ Add</Btn>
        </div>
      </div>
      {adding && (
        <Card>
          <Fld label="Roll *" value={roll} onChange={setRoll} placeholder="21ME009" />
          <Fld label="Name" value={name} onChange={setName} placeholder="Student name" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Fld label="Gender M/F" value={gender} onChange={setGender} placeholder="M or F" />
            <Fld label="Mobile" value={mobile} onChange={setMobile} placeholder="Mobile" type="tel" />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn small onClick={addStudent}>Save</Btn>
            <Btn small variant="ghost" onClick={() => setAdding(false)}>Cancel</Btn>
          </div>
        </Card>
      )}
      {(section.students || []).map((st, i) => (
        <div key={st.roll} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: i < section.students.length - 1 ? "1px solid " + P.border : "none" }}>
          <div style={{ width: 38, height: 38, borderRadius: "50%", background: st.gender === "F" ? "#fce7f3" : P.blueL, color: st.gender === "F" ? "#9d174d" : P.blue, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
            {st.gender || "?"}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{st.name || "—"}</div>
            <div style={{ fontSize: 12, color: P.gray }}>{st.roll}{st.mobile ? " · " + st.mobile : ""}</div>
          </div>
          <button onClick={() => deleteStudent(st.roll)}
            title="Remove from section"
            style={{ background: "none", border: "none", cursor: "pointer", color: "#d32f2f", fontSize: 16, padding: "4px 8px", borderRadius: 6 }}>
            🗑
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Subjects & valuator-assignment tab ───────────────────────
function TabValuationSubjects({ section }) {
  const [editId, setEditId] = useState(null); const [fp, setFp] = useState("");
  const [addingSub, setAddingSub] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("Theory");
  const [facultyList, setFacultyList] = useState([]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "users"), snap => {
      const users = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setFacultyList(users.filter(u => u.status === "approved"));
    });
    return unsub;
  }, []);

  async function saveNewSubject() {
    if (!newName.trim()) return;
    const subs = [...(section.subjects || []), {
      id: "sub-" + Date.now(), name: newName.trim(), type: newType, valuatorPhone: "",
    }];
    await updateDoc(doc(db, "originalSections", section.id), { subjects: subs });
    setNewName(""); setNewType("Theory"); setAddingSub(false);
  }

  async function assignValuator(subId) {
    if (!fp) return;
    const subs = (section.subjects || []).map(s => s.id === subId ? { ...s, valuatorPhone: fp } : s);
    await updateDoc(doc(db, "originalSections", section.id), { subjects: subs });
    // Stamp the assignment onto the marks doc too — the security rules check
    // this field (as teacherPhone) to let only the assigned valuator write there.
    await setDoc(doc(db, "internalMarksOriginal", section.id, "subjects", subId), { teacherPhone: fp }, { merge: true });
    setEditId(null); setFp("");
  }

  async function deleteSubject(sub) {
    if (!window.confirm("Remove \"" + sub.name + "\" from this original section? This will also delete any marks entered against it. This cannot be undone.")) return;
    const subs = (section.subjects || []).filter(s => s.id !== sub.id);
    await updateDoc(doc(db, "originalSections", section.id), { subjects: subs });
    try { await deleteDoc(doc(db, "internalMarksOriginal", section.id, "subjects", sub.id)); } catch (e) {}
  }

  return (
    <div>
      <div style={{ fontSize: 13, color: P.gray, marginBottom: 14, lineHeight: 1.6 }}>
        Assign one faculty member per subject to value that subject's papers for this section.
        This is separate from who teaches the subject — a faculty member sees this under
        "My Subject Internal Marks" alongside their own taught sections.
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{section.subjects?.length || 0} subjects</div>
        <Btn small onClick={() => setAddingSub(a => !a)}>+ Add subject</Btn>
      </div>
      {addingSub && (
        <Card>
          <Fld label="Subject name" value={newName} onChange={setNewName} placeholder="e.g. Fluid Mechanics" />
          <Sel label="Type" value={newType} onChange={setNewType} options={[
            { value: "Theory", label: "Theory" },
            { value: "Lab", label: "Lab" },
            { value: "Drawing", label: "Drawing" },
          ]} />
          <div style={{ display: "flex", gap: 8 }}>
            <Btn small onClick={saveNewSubject}>Save</Btn>
            <Btn small variant="ghost" onClick={() => { setAddingSub(false); setNewName(""); }}>Cancel</Btn>
          </div>
        </Card>
      )}
      {(section.subjects || []).map(sub => (
        <ValuationSubjectCard key={sub.id} sub={sub} section={section}
          editId={editId} setEditId={setEditId} fp={fp} setFp={setFp}
          facultyList={facultyList}
          onAssign={() => assignValuator(sub.id)}
          onDelete={() => deleteSubject(sub)}
        />
      ))}
    </div>
  );
}

function ValuationSubjectCard({ sub, section, editId, setEditId, fp, setFp, facultyList, onAssign, onDelete }) {
  const [facName, setFacName] = useState(null);
  const [status, setStatus] = useState(null); // null while loading; else "Not Started" | "Draft" | "Locked"

  useEffect(() => {
    if (!sub.valuatorPhone) { setFacName(null); return; }
    getDoc(doc(db, "users", sub.valuatorPhone)).then(snap => {
      setFacName(snap.exists() ? snap.data().name : sub.valuatorPhone);
    });
  }, [sub.valuatorPhone]);

  // Monitor marks-entry progress for this subject — this is exactly the
  // capability a coordinator needs "All Sections Internal Marks" for: seeing
  // who's locked, drafted, or hasn't started, without opening every subject.
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "internalMarksOriginal", section.id, "subjects", sub.id), snap => {
      setStatus(snap.exists() ? (snap.data().status || "Not Started") : "Not Started");
    });
    return unsub;
  }, [section.id, sub.id]);

  const statusStyle = status === "Locked" ? { bg: "#E1F5EE", color: "#0F6E56" } :
                      status === "Draft"  ? { bg: "#FAEEDA", color: "#854F0B" } :
                                            { bg: P.bg, color: P.gray };

  const facultyOptions = (facultyList || [])
    .slice()
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
    .map(u => {
      const phoneVal = u.phone || u.id;
      return { value: phoneVal, label: (u.name || phoneVal) + " · " + phoneVal + (u.role === "admin" ? " (admin)" : "") };
    });

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, color: P.teal }}>{sub.name}</div>
          <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
            <Badge color="gray">{sub.type || "Theory"}</Badge>
            {status && <span style={{ fontSize: 11, fontWeight: 600, background: statusStyle.bg, color: statusStyle.color, borderRadius: 20, padding: "3px 9px" }}>{status}</span>}
          </div>
        </div>
        <button onClick={onDelete}
          style={{ background: P.redL, border: "none", color: P.red, borderRadius: 8, padding: "5px 9px", cursor: "pointer", fontSize: 12, fontWeight: 600 }}
          title="Delete subject">🗑</button>
      </div>

      {facName ? (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div><Badge color="teal">{facName}</Badge><div style={{ fontSize: 11, color: P.gray, marginTop: 3 }}>{sub.valuatorPhone}</div></div>
          <Btn small variant="ghost" onClick={() => { setEditId(sub.id); setFp(sub.valuatorPhone); }}>Change</Btn>
        </div>
      ) : (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Badge color="amber">No valuator assigned</Badge>
          <Btn small onClick={() => { setEditId(sub.id); setFp(""); }}>Assign</Btn>
        </div>
      )}
      {editId === sub.id && (
        <div style={{ marginTop: 10 }}>
          {facultyOptions.length > 0 ? (
            <Sel label="Select faculty" value={fp} onChange={setFp} options={facultyOptions} />
          ) : (
            <div style={{ fontSize: 12, color: P.gray, marginBottom: 10 }}>No approved faculty available to assign yet.</div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <Btn small onClick={onAssign}>Save</Btn>
            <Btn small variant="ghost" onClick={() => setEditId(null)}>Cancel</Btn>
          </div>
        </div>
      )}
    </Card>
  );
}

// ── Reports tab — self-contained per original section ────────
// This is exactly what goes to the central exam section: this section's own
// roster, every subject's final total, and each subject's lock status. No
// merging with any other section — that's deliberate, per how the college
// actually consumes these reports.
function subjectTotal(subject, marksDoc, roll, hasA2) {
  if (isLabSubject(subject)) {
    return calcLabTotal(marksDoc?.lab?.[roll]);
  }
  if (isDrawingSubject(subject)) {
    const c1 = calcDrawingMidConv(marksDoc?.mid1?.[roll]);
    const c2 = calcDrawingMidConv(marksDoc?.mid2?.[roll]);
    const dd = Number(marksDoc?.dayday?.[roll]) || 0;
    return calcFinalInternal(c1, c2) + dd;
  }
  const m1 = marksDoc?.mid1?.[roll] || {}, m2 = marksDoc?.mid2?.[roll] || {};
  const t1 = Math.round(calcPartA(m1) + calcPartBConv(m1));
  const t2 = Math.round(calcPartA(m2) + calcPartBConv(m2));
  const fi = calcFinalInternal(t1, t2);
  const a = marksDoc?.assignment?.[roll] || {};
  return fi + calcAssignment(a.a1, a.a2, hasA2);
}

function TabOriginalReports({ section }) {
  const students = section.students || [];
  const subjects = section.subjects || [];
  const [marksBySubject, setMarksBySubject] = useState({}); // subjectId -> doc data
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (subjects.length === 0) { setLoading(false); return; }
    setLoading(true);
    let pending = subjects.length;
    const unsubs = subjects.map(sub =>
      onSnapshot(doc(db, "internalMarksOriginal", section.id, "subjects", sub.id), snap => {
        setMarksBySubject(prev => ({ ...prev, [sub.id]: snap.exists() ? snap.data() : {} }));
        pending--;
        if (pending <= 0) setLoading(false);
      })
    );
    return () => unsubs.forEach(u => u());
  }, [section.id, subjects.length]);

  if (loading) return <Spinner />;

  function downloadExcel() {
    const header = ["Roll No", "Name", ...subjects.map(s => s.name)];
    const rows = students.map(st => {
      const row = [st.roll, st.name || ""];
      subjects.forEach(sub => {
        const md = marksBySubject[sub.id] || {};
        const hasA2 = students.some(s => md.assignment?.[s.roll]?.a2 !== undefined && md.assignment?.[s.roll]?.a2 !== "");
        row.push(subjectTotal(sub, md, st.roll, hasA2) || 0);
      });
      return row;
    });
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, section.name.slice(0, 31) || "Report");
    XLSX.writeFile(wb, section.name.replace(/[\\/:*?"<>|]/g, "") + " - Internal Marks.xlsx");
  }

  if (subjects.length === 0) {
    return <div style={{ color: P.gray, textAlign: "center", padding: "2rem" }}>No subjects added to this section yet.</div>;
  }
  if (students.length === 0) {
    return <div style={{ color: P.gray, textAlign: "center", padding: "2rem" }}>No students uploaded to this section yet.</div>;
  }

  const th = { padding: "8px 10px", textAlign: "center", fontWeight: 600, fontSize: 12.5, background: P.blue, color: "#fff", border: "1px solid " + P.border, whiteSpace: "nowrap" };
  const td = { padding: "6px 10px", textAlign: "center", fontSize: 13, border: "1px solid " + P.border };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: P.gray }}>
          {section.name} · {students.length} students · {subjects.length} subjects — self-contained, ready for the exam section.
        </div>
        <Btn small onClick={downloadExcel}>⬇ Download Excel</Btn>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        {subjects.map(sub => {
          const md = marksBySubject[sub.id] || {};
          const status = md.status || "Not Started";
          const style = status === "Locked" ? { bg: "#E1F5EE", color: "#0F6E56" } :
                        status === "Draft"  ? { bg: "#FAEEDA", color: "#854F0B" } :
                                              { bg: P.bg, color: P.gray };
          return (
            <span key={sub.id} style={{ fontSize: 12, fontWeight: 600, background: style.bg, color: style.color, borderRadius: 20, padding: "4px 10px" }}>
              {sub.name}: {status}
            </span>
          );
        })}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th style={th}>Roll No</th>
              <th style={{ ...th, textAlign: "left" }}>Name</th>
              {subjects.map(sub => <th key={sub.id} style={th}>{sub.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {students.map((st, i) => (
              <tr key={st.roll} style={{ background: i % 2 === 0 ? "#fff" : P.bg }}>
                <td style={td}>{st.roll}</td>
                <td style={{ ...td, textAlign: "left" }}>{st.name || ""}</td>
                {subjects.map(sub => {
                  const md = marksBySubject[sub.id] || {};
                  const hasA2 = students.some(s => md.assignment?.[s.roll]?.a2 !== undefined && md.assignment?.[s.roll]?.a2 !== "");
                  return <td key={sub.id} style={{ ...td, fontWeight: 600 }}>{subjectTotal(sub, md, st.roll, hasA2) || ""}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
