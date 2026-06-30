// src/AdminApp.js — FINAL with all 3 fixes

import React, { useState, useEffect, useRef } from "react";
import {
  collection, doc, getDocs, getDoc,
  setDoc, updateDoc, onSnapshot, deleteDoc,
} from "firebase/firestore";
import { db } from "./firebase";
import * as XLSX from "xlsx";
import { uploadStudentRecords } from "./hod/studentDataUpload";
import { P, Btn, Card, Badge, Fld, Sel, TopBar, GPill, ARow, Spinner, PeriodPicker } from "./components/UI";
import { today, calcPct, parseCSV, downloadTemplate, exportXLS, makeKey, groupByDateBatched, rowColor, MASTER_ADMIN_PHONE, fmtDate, validateBatches, studentsInBatch, readStatus, batchSlotKey } from "./utils";

// ── Invite link card — each admin's shareable link for their own faculty ──
function InviteLinkCard({ adminPhone }) {
  const [copied, setCopied] = useState(false);
  const link = window.location.origin + "/?admin=" + adminPhone;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link:", link);
    }
  }

  return (
    <Card style={{ background: P.blueL, border: "none" }}>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>📨 Your faculty invite link</div>
      <div style={{ fontSize: 12, color: P.gray, marginBottom: 10 }}>
        Share this with your faculty. Anyone who registers through it will show up under your Users list for you to approve.
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <div style={{ flex: 1, background: "#fff", borderRadius: 8, padding: "8px 10px", fontSize: 12, color: P.blue, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {link}
        </div>
        <Btn small variant={copied ? "success" : "primary"} onClick={copyLink}>
          {copied ? "✓ Copied!" : "Copy"}
        </Btn>
      </div>
    </Card>
  );
}

// ── Student Data tab: download a roster-prefilled template, upload it back ──
const SEM_COLS = ["I-I","I-II","II-I","II-II","III-I","III-II","IV-I","IV-II"];
const STUDENT_DATA_HEADERS = [
  "S.No","RollNumber","Name","ParentName","ParentOccupation","Category",
  "StudentMobile","ParentMobile","HostelType","AttendanceRef",
  ...SEM_COLS.flatMap(s => [s + "_SGPA", s + "_Backlogs"]),
  "FeeBalance",
];

function TabStudentData({ section }) {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const students = section.students || [];

  function downloadTemplate() {
    const rows = students.map((st, i) => {
      const row = {};
      STUDENT_DATA_HEADERS.forEach(h => { row[h] = ""; });
      row["S.No"] = i + 1;
      row["RollNumber"] = st.roll || "";
      row["Name"] = st.name || "";
      return row;
    });
    const ws = XLSX.utils.json_to_sheet(rows, { header: STUDENT_DATA_HEADERS });
    ws["!cols"] = STUDENT_DATA_HEADERS.map(h => ({ wch: h.length < 10 ? 12 : h.length + 2 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "StudentRecords");
    const safeName = section.name.replace(/[^a-zA-Z0-9 _-]/g, "");
    XLSX.writeFile(wb, safeName + "_StudentData_Template.xlsx");
  }

  async function handleUpload(e) {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setStatus(null);
    try {
      const result = await uploadStudentRecords(file);
      setStatus({ type: "ok", msg: "Updated " + result.count + " record(s)." });
    } catch (err) {
      setStatus({ type: "err", msg: "Upload failed: " + err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>Student data for {section.name}</div>
      <div style={{ fontSize: 13, color: P.gray, marginBottom: 14 }}>
        The template below comes pre-filled with this section's roster ({students.length} students) — just fill in
        marks, fee, hostel, and parent details and upload it back. Re-uploading is always safe: only the fields
        you've filled in get updated, nothing else is touched.
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button onClick={downloadTemplate}
          style={{ fontSize: 13, color: P.blue, border: "1px solid " + P.blue, borderRadius: 8, padding: "8px 14px", background: "#fff", cursor: "pointer", fontWeight: 600 }}>
          ⬇ Download template ({students.length} students pre-filled)
        </button>
        <label style={{ fontSize: 13, background: P.blue, color: "#fff", borderRadius: 8, padding: "8px 14px", cursor: busy ? "not-allowed" : "pointer", fontWeight: 600, opacity: busy ? 0.6 : 1 }}>
          {busy ? "Uploading…" : "⬆ Upload filled sheet"}
          <input type="file" accept=".xlsx,.xls" onChange={handleUpload} disabled={busy} style={{ display: "none" }} />
        </label>
      </div>
      {status && (
        <div style={{ marginTop: 10, fontSize: 13, color: status.type === "ok" ? "#166534" : "#b91c1c" }}>
          {status.msg}
        </div>
      )}
    </Card>
  );
}

export default function AdminApp({ user, onLogout }) {
  const [screen,   setScreen]   = useState("home");
  const [secId,    setSecId]    = useState(null);
  const [sections, setSections] = useState([]);
  const [pending,  setPending]  = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [markCtx,  setMarkCtx]  = useState(null); // for admin marking their own subject
  const isMaster = user.phone === MASTER_ADMIN_PHONE;

  // Load sections
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "sections"), snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setSections(isMaster ? all : all.filter(s => s.adminPhone === user.phone));
      setLoading(false);
    });
    return unsub;
  }, [user.phone, isMaster]);

  // Load all users (for pending approvals + user management)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "users"), snap => {
      const users = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const myPending = isMaster
        ? users.filter(u => u.status === "pending")
        : users.filter(u => u.status === "pending" && u.invitedBy === user.phone);
      setPending(myPending);
      setAllUsers(users);
    });
    return unsub;
  }, [user.phone, isMaster]);

  async function approveUser(phone) {
    await updateDoc(doc(db, "users", phone), { status: "approved" });
  }
  async function resetPin(phone) {
    await updateDoc(doc(db, "users", phone), { pin: "" });
  }
  async function rejectUser(phone) {
    await updateDoc(doc(db, "users", phone), { status: "rejected" });
  }
  async function makeAdmin(phone) {
    await updateDoc(doc(db, "users", phone), { role: "admin" });
  }
  async function makeFaculty(phone) {
    await updateDoc(doc(db, "users", phone), { role: "faculty" });
  }
  async function deleteUser(phone, name) {
    if (!window.confirm("Delete user " + name + " (" + phone + ")? This cannot be undone.")) return;
    await deleteDoc(doc(db, "users", phone));
  }
  async function deleteSection(sec) {
    if (!window.confirm("Delete section '" + sec.name + "' and ALL its attendance data? This cannot be undone.")) return;
    // Delete all attendance subcollections
    try {
      const subSnap = await getDocs(collection(db, "attendance", sec.id, "subjects"));
      for (const subDoc of subSnap.docs) {
        const dateSnap = await getDocs(collection(db, "attendance", sec.id, "subjects", subDoc.id, "dates"));
        for (const dateDoc of dateSnap.docs) {
          await deleteDoc(dateDoc.ref);
        }
        await deleteDoc(subDoc.ref);
      }
      await deleteDoc(doc(db, "attendance", sec.id));
    } catch (e) {}
    // Delete section document
    await deleteDoc(doc(db, "sections", sec.id));
  }

  if (loading) return <Spinner />;

  // Admin marking attendance for their own subject
  if (markCtx) {
    return <AdminMarkAttendance user={user} ctx={markCtx} presetPeriod={markCtx.presetPeriod} onBack={() => setMarkCtx(null)} />;
  }

  if (screen === "new") {
    return <NewSectionForm user={user} onBack={() => setScreen("home")} />;
  }
  if (screen === "detail" && secId) {
    const sec = sections.find(s => s.id === secId);
    if (!sec) { setScreen("home"); return null; }
    return <SectionDetail secId={secId} onBack={() => { setScreen("home"); setSecId(null); }} />;
  }
  if (screen === "users") {
    const usersToShow = isMaster ? allUsers : allUsers.filter(u => u.invitedBy === user.phone);
    return (
      <UsersScreen
        allUsers={usersToShow}
        currentUser={user}
        isMaster={isMaster}
        onApprove={approveUser}
        onReject={rejectUser}
        onMakeAdmin={makeAdmin}
        onMakeFaculty={makeFaculty}
        onDelete={deleteUser}
        onResetPin={resetPin}
        onBack={() => setScreen("home")}
      />
    );
  }

  // Find subjects assigned to admin's phone across all sections (batch, if any, is chosen at marking time)
  const mySubjectsAsTeacher = [];
  sections.forEach(sec => {
    sec.subjects?.forEach(sub => {
      if (sub.facultyPhone === user.phone) {
        mySubjectsAsTeacher.push({ section: sec, subject: sub });
      }
    });
  });

  const totalStudents = sections.reduce((a, s) => a + (s.students?.length || 0), 0);

  return (
    <div style={{ background: P.bg, minHeight: "100vh" }}>
      <TopBar title="Admin Dashboard" subtitle={(isMaster ? "⭐ Master Admin · " : "") + "Welcome, " + user.name}
        right={
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setScreen("users")} style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 13 }}>
              👥 Users
            </button>
            <button onClick={onLogout} style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 13 }}>
              Logout
            </button>
          </div>
        }
      />
      <div style={{ padding: "16px 16px 80px" }}>

        {/* Invite link */}
        <InviteLinkCard adminPhone={user.phone} />

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
          <div style={{ background: P.blueL, borderRadius: 12, padding: "16px 14px" }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: P.blue }}>{sections.length}</div>
            <div style={{ fontSize: 12, color: P.gray }}>Sections</div>
          </div>
          <div style={{ background: P.greenL, borderRadius: 12, padding: "16px 14px" }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: P.green }}>{totalStudents}</div>
            <div style={{ fontSize: 12, color: P.gray }}>Total students</div>
          </div>
        </div>

        {/* Pending approvals */}
        {pending.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 10, color: P.red }}>
              🔔 Pending approvals ({pending.length})
            </div>
            {pending.map(u => (
              <div key={u.id} style={{ background: P.amberL, border: "1px solid #fcd34d", borderRadius: 12, padding: "14px 16px", marginBottom: 10 }}>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{u.name}</div>
                <div style={{ fontSize: 13, color: P.gray, marginBottom: 2 }}>{u.designation} · {u.branch}</div>
                <div style={{ fontSize: 12, color: P.gray, marginBottom: 10 }}>📱 {u.phone} · {u.subjects}</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Btn small variant="success" onClick={() => approveUser(u.id)}>✓ Approve</Btn>
                  <Btn small variant="danger" onClick={() => rejectUser(u.id)}>✗ Reject</Btn>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── FIX 2: Admin's own subjects to mark attendance ── */}
        {mySubjectsAsTeacher.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 10 }}>📝 My subjects (mark attendance)</div>
            {mySubjectsAsTeacher.map(({ section, subject }) => (
              <AdminSubjectCard
                key={subject.id}
                section={section}
                subject={subject}
                user={user}
                onMark={(period) => setMarkCtx({ section, subject, presetPeriod: period || null })}
              />
            ))}
          </div>
        )}

        {/* Sections */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>{isMaster ? "All sections (every admin)" : "My sections"}</div>
          <Btn small onClick={() => setScreen("new")}>+ New section</Btn>
        </div>
        {sections.length === 0 && <div style={{ color: P.gray, textAlign: "center", padding: "2rem" }}>No sections yet.</div>}
        {sections.map(sec => (
          <Card key={sec.id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div onClick={() => { setSecId(sec.id); setScreen("detail"); }} style={{ flex: 1, cursor: "pointer" }}>
                <div style={{ fontWeight: 600, fontSize: 15, color: P.blue, marginBottom: 4 }}>{sec.name}</div>
                <div style={{ fontSize: 13, color: P.gray }}>
                  {sec.students?.length || 0} students · {sec.subjects?.length || 0} subjects
                  {isMaster && sec.adminPhone !== user.phone && (
                    <span style={{ marginLeft: 6 }}>· <Badge color="teal">admin: {sec.adminPhone}</Badge></span>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  onClick={() => deleteSection(sec)}
                  style={{ background: P.redL, border: "none", color: P.red, borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontSize: 13, fontWeight: 600 }}
                  title="Delete section"
                >🗑</button>
                <span onClick={() => { setSecId(sec.id); setScreen("detail"); }} style={{ color: P.gray, fontSize: 20, cursor: "pointer" }}>›</span>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── Admin subject card (period-aware, same as faculty card) ─
function AdminSubjectCard({ section, subject, user, onMark }) {
  const [doneMap, setDoneMap] = useState({});
  const [loading,  setLoading]  = useState(true);
  const ts = today();

  useEffect(() => {
    async function load() {
      const periodsPerDay = section.periodsPerDay || 7;
      const map = {};
      const checks = [];
      for (let p = 1; p <= periodsPerDay; p++) {
        checks.push(
          getDoc(doc(db, "attendance", section.id, "subjects", subject.id, "dates", makeKey(ts, p)))
            .then(snap => { if (snap.exists()) map[p] = snap.data(); })
        );
      }
      await Promise.all(checks);
      setDoneMap(map);
      setLoading(false);
    }
    load();
  }, [section.id, subject.id, section.periodsPerDay, ts]);

  // "Marked today" = any slot (any batch, or the unbatched slot) has data for that period.
  const doneCount = Object.values(doneMap).filter(rec => rec && Object.keys(rec).length > 0).length;

  return (
    <Card>
      <div style={{ fontSize: 12, color: P.gray, marginBottom: 2 }}>{section.name}</div>
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{subject.name}</div>
      <div style={{ marginBottom: 6 }}>
        {loading ? <span style={{ fontSize: 12, color: P.gray }}>Checking…</span>
          : doneCount > 0
            ? <Badge color="green">{doneCount} period(s) marked today</Badge>
            : <Badge color="amber">Not marked today</Badge>
        }
      </div>
      <div style={{ marginTop: 10 }}>
        <Btn small variant="primary" onClick={() => onMark()}>📅 Mark attendance</Btn>
      </div>
    </Card>
  );
}

// ── Admin marking attendance (period-aware, with date picker, batch-aware) ──
function AdminMarkAttendance({ user, ctx, presetPeriod, onBack }) {
  const { section, subject } = ctx;
  const periodsPerDay = section.periodsPerDay || 7;
  const hasBatches = subject.batches && subject.batches.length > 0;

  const [selBatchId, setSelBatchId] = useState(""); // "" = not chosen yet (only relevant if hasBatches)
  const batch = hasBatches ? (subject.batches.find(b => b.id === selBatchId) || null) : null;
  const roster = batch ? studentsInBatch(section.students, batch) : (section.students || []);
  const slotKey = batchSlotKey(batch ? batch.id : null);

  const [date, setDate]       = useState(today());
  const [selPeriods, setSelPeriods] = useState(presetPeriod ? [presetPeriod] : []);
  const [record,  setRecord]  = useState(null); // flat {roll: "P"/"A"} for THIS batch's roster only
  const [saved,   setSaved]   = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [loading, setLoading] = useState(false);
  const [docMap, setDocMap]   = useState({}); // period -> full attendance document (all slots)

  const batchReady = !hasBatches || !!selBatchId;

  useEffect(() => {
    if (!batchReady) return;
    async function loadDocMap() {
      const map = {};
      const checks = [];
      for (let p = 1; p <= periodsPerDay; p++) {
        checks.push(
          getDoc(doc(db, "attendance", section.id, "subjects", subject.id, "dates", makeKey(date, p)))
            .then(snap => { if (snap.exists()) map[p] = snap.data(); })
        );
      }
      await Promise.all(checks);
      setDocMap(map);
    }
    loadDocMap();
  }, [batchReady, date, section.id, subject.id, periodsPerDay]);

  // doneMap for the period picker: a period counts as "done" for THIS batch only
  // if its slot has data (falls back to old flat-shape docs for unbatched subjects).
  const doneMap = {};
  Object.keys(docMap).forEach(p => {
    const d = docMap[p];
    if (d && (d[slotKey] || (!batch && Object.keys(d).some(k => !k.startsWith("_"))))) {
      doneMap[p] = d;
    }
  });

  useEffect(() => {
    if (selPeriods.length === 0) { setRecord(null); return; }
    setLoading(true);
    const firstWithData = selPeriods.find(p => doneMap[p]);
    if (firstWithData) {
      const fullDoc = docMap[firstWithData] || {};
      const existingSlot = fullDoc[slotKey];
      if (existingSlot) {
        setRecord({ ...existingSlot });
      } else {
        // Old flat-shape doc (pre-batching) — use it directly as the roll map.
        const r = {};
        roster.forEach(st => { r[st.roll] = fullDoc[st.roll] ?? "P"; });
        setRecord(r);
      }
      setSaved(true);
    } else {
      const r = {};
      roster.forEach(st => { r[st.roll] = "P"; });
      setRecord(r);
      setSaved(false);
    }
    setLoading(false);
  }, [selPeriods, docMap]);

  function togglePeriod(p) {
    setSelPeriods(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  }

  async function submit() {
    if (selPeriods.length === 0 || !record) return;
    setSaving(true);
    await Promise.all(
      selPeriods.map(p => {
        const ref = doc(db, "attendance", section.id, "subjects", subject.id, "dates", makeKey(date, p));
        // Merge: only this batch's slot is touched, so other batches' data on the
        // same date/period is never overwritten.
        return setDoc(ref, { [slotKey]: record }, { merge: true });
      })
    );
    setDocMap(prev => {
      const nd = { ...prev };
      selPeriods.forEach(p => { nd[p] = { ...(nd[p] || {}), [slotKey]: record }; });
      return nd;
    });
    setSaving(false);
    setSaved(true);
  }

  const vals   = record ? Object.values(record) : [];
  const pCount = vals.filter(v => v === "P").length;
  const aCount = vals.filter(v => v === "A").length;
  const allP = vals.length > 0 && aCount === 0;
  const allA = vals.length > 0 && pCount === 0;

  return (
    <div style={{ background: P.bg, minHeight: "100vh" }}>
      <TopBar title="Mark attendance" subtitle={section.name + " · " + subject.name + (batch ? " · " + batch.label : "")} onBack={onBack} />

      {hasBatches && (
        <div style={{ padding: "14px 16px 0" }}>
          <div style={{ fontSize: 12, color: P.gray, fontWeight: 500, marginBottom: 6 }}>
            Which batch are you taking right now?
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {subject.batches.map(b => (
              <button key={b.id} onClick={() => { setSelBatchId(b.id); setSelPeriods([]); }}
                style={{
                  padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
                  border: selBatchId === b.id ? "2px solid " + P.blue : "1.5px solid " + P.border,
                  background: selBatchId === b.id ? P.blue : "#fff",
                  color: selBatchId === b.id ? "#fff" : "#374151",
                }}>
                {b.label} <span style={{ fontWeight: 400, opacity: 0.8 }}>(serial {b.rollStart}–{b.rollEnd})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {!batchReady && (
        <div style={{ padding: "1.5rem 16px", textAlign: "center", color: P.gray, fontSize: 13 }}>
          Select your batch above to continue.
        </div>
      )}

      {batchReady && (
        <div style={{ padding: "14px 16px 0" }}>
          <PeriodPicker
            date={date}
            onDateChange={(d) => { setDate(d); setSelPeriods([]); }}
            periodsPerDay={periodsPerDay}
            selected={selPeriods}
            onToggle={togglePeriod}
            doneMap={doneMap}
          />
        </div>
      )}

      {batchReady && selPeriods.length === 0 && (
        <div style={{ padding: "1.5rem 16px", textAlign: "center", color: P.gray, fontSize: 13 }}>
          Select one or more periods above to begin marking.
        </div>
      )}

      {loading && <Spinner />}

      {!loading && selPeriods.length > 0 && record && (
        <>
          <div style={{ background: "#fff", padding: "10px 16px", borderBottom: "1px solid " + P.border, display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ fontSize: 13, color: P.gray }}>
              {fmtDate(date)} · Period{selPeriods.length > 1 ? "s" : ""} {selPeriods.slice().sort((a,b)=>a-b).join(", ")}
            </div>
            <div style={{ flex: 1 }} />
            <div style={{ background: P.greenL, color: P.green, fontSize: 13, fontWeight: 600, padding: "4px 12px", borderRadius: 8 }}>{pCount} P</div>
            <div style={{ background: P.redL, color: P.red, fontSize: 13, fontWeight: 600, padding: "4px 12px", borderRadius: 8 }}>{aCount} A</div>
          </div>
          <div style={{ background: "#fff", padding: "10px 16px", borderBottom: "1px solid " + P.border, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 12, color: P.gray, fontWeight: 600 }}>Default all to:</div>
            <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: "1.5px solid " + P.border }}>
              <button
                onClick={() => { setRecord(r => { const nr = {}; Object.keys(r).forEach(k => nr[k] = "P"); return nr; }); setSaved(false); }}
                style={{ padding: "6px 16px", fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", background: allP ? P.green : "#fff", color: allP ? "#fff" : P.gray }}
              >All Present</button>
              <button
                onClick={() => { setRecord(r => { const nr = {}; Object.keys(r).forEach(k => nr[k] = "A"); return nr; }); setSaved(false); }}
                style={{ padding: "6px 16px", fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", background: allA ? P.red : "#fff", color: allA ? "#fff" : P.gray }}
              >All Absent</button>
            </div>
          </div>
          <div style={{ padding: "10px 16px 120px" }}>
            <div style={{ fontSize: 12, color: P.gray, marginBottom: 10 }}>Tap a student's button to flip their status. This marking will be saved to all selected periods.</div>
            {roster.map(st => (
              <ARow key={st.roll} st={st} status={record[st.roll] || "P"}
                onToggle={roll => { setRecord(r => ({ ...r, [roll]: r[roll] === "P" ? "A" : "P" })); setSaved(false); }} />
            ))}
          </div>
          <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid " + P.border, padding: "12px 16px", display: "flex", gap: 10 }}>
            {saved
              ? <><div style={{ flex: 1, background: navigator.onLine ? P.greenL : P.amberL, color: navigator.onLine ? P.green : P.amber, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: 14, padding: 12 }}>{navigator.onLine ? "✓ Saved!" : "📡 Saved offline — will sync when online"}</div><Btn variant="outline" onClick={onBack}>Back</Btn></>
              : <Btn full onClick={submit} disabled={saving}>{saving ? "Saving…" : "Submit attendance"}</Btn>
            }
          </div>
        </>
      )}
    </div>
  );
}

// ── Users management screen ────────────────────────────────
function UsersScreen({ allUsers, currentUser, isMaster, onApprove, onReject, onMakeAdmin, onMakeFaculty, onDelete, onResetPin, onBack }) {
  const [filter, setFilter] = useState("all"); // all | pending | approved | admin

  const filtered = allUsers.filter(u => {
    if (filter === "pending")  return u.status === "pending";
    if (filter === "approved") return u.status === "approved" && u.role === "faculty";
    if (filter === "admin")    return u.role === "admin";
    return true;
  });

  const tabs = [
    { id: "all",      label: "All (" + allUsers.length + ")" },
    { id: "pending",  label: "Pending (" + allUsers.filter(u => u.status === "pending").length + ")" },
    { id: "approved", label: "Faculty (" + allUsers.filter(u => u.status === "approved" && u.role === "faculty").length + ")" },
  ];
  if (isMaster) {
    tabs.push({ id: "admin", label: "Admins (" + allUsers.filter(u => u.role === "admin").length + ")" });
  }

  return (
    <div style={{ background: P.bg, minHeight: "100vh" }}>
      <TopBar title="User Management" subtitle={isMaster ? "Approve, promote and manage users" : "Approve and manage your faculty"} onBack={onBack} />
      <div style={{ padding: 16 }}>

        {/* Filter tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          {tabs.map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)} style={{
              padding: "6px 14px", borderRadius: 20, fontSize: 12,
              fontFamily: "inherit", fontWeight: 600, cursor: "pointer",
              border: "none",
              background: filter === f.id ? P.blue : P.blueL,
              color: filter === f.id ? "#fff" : P.blue,
            }}>{f.label}</button>
          ))}
        </div>

        {filtered.length === 0 && (
          <div style={{ color: P.gray, textAlign: "center", padding: "2rem" }}>No users found.</div>
        )}

        {filtered.map(u => {
          const isCurrentUser = u.id === currentUser.phone;
          const isAdmin = u.role === "admin";
          const isPending = u.status === "pending";
          const isRejected = u.status === "rejected";

          return (
            <Card key={u.id}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{u.name || "—"}</span>
                    {isAdmin && <Badge color="blue">Admin</Badge>}
                    {isPending && <Badge color="amber">Pending</Badge>}
                    {isRejected && <Badge color="red">Rejected</Badge>}
                    {!isAdmin && !isPending && !isRejected && <Badge color="green">Faculty</Badge>}
                  </div>
                  <div style={{ fontSize: 12, color: P.gray }}>{u.designation} · {u.branch}</div>
                  <div style={{ fontSize: 12, color: P.gray }}>📱 {u.phone}</div>
                  {u.subjects && <div style={{ fontSize: 12, color: P.gray, marginTop: 2 }}>Subjects: {u.subjects}</div>}
                  {u.status === "approved" && (
                    <div style={{ marginTop: 4 }}>
                      {u.pin ? <Badge color="green">🔒 PIN set</Badge> : <Badge color="amber">No PIN yet</Badge>}
                    </div>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              {!isCurrentUser && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {isPending && (
                    <>
                      <Btn small variant="success" onClick={() => onApprove(u.id)}>✓ Approve</Btn>
                      <Btn small variant="danger"  onClick={() => onReject(u.id)}>✗ Reject</Btn>
                    </>
                  )}
                  {isRejected && (
                    <Btn small variant="outline" onClick={() => onApprove(u.id)}>Re-approve</Btn>
                  )}
                  {isMaster && !isPending && !isRejected && (
                    isAdmin
                      ? <Btn small variant="ghost" onClick={() => onMakeFaculty(u.id)}>↓ Demote to Faculty</Btn>
                      : <Btn small variant="accent" onClick={() => onMakeAdmin(u.id)}>↑ Make Admin</Btn>
                  )}
                  {u.status === "approved" && u.pin && (
                    <Btn small variant="ghost" onClick={() => { if (window.confirm("Reset PIN for " + u.name + "? They will be asked to set a new PIN on next login.")) onResetPin(u.id); }}>
                      🔄 Reset PIN
                    </Btn>
                  )}
                  {isMaster && (
                    <button
                      onClick={() => onDelete(u.id, u.name)}
                      style={{ background: P.redL, border: "none", color: P.red, borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontSize: 13, fontWeight: 600 }}
                      title="Delete user"
                    >🗑 Delete</button>
                  )}
                </div>
              )}
              {isCurrentUser && (
                <div style={{ fontSize: 12, color: P.gray, fontStyle: "italic" }}>This is you</div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ── New section form ───────────────────────────────────────
function NewSectionForm({ user, onBack }) {
  const [name,     setName]     = useState("");
  const [periodsPerDay, setPeriodsPerDay] = useState("7");
  const [subText,  setSubText]  = useState("");
  const [students, setStudents] = useState([]);
  const [msg,      setMsg]      = useState(null);
  const [saving,   setSaving]   = useState(false);
  const fileRef = useRef();

  async function save() {
    if (!name.trim()) { setMsg({ ok: false, text: "Section name required" }); return; }
    const ppd = parseInt(periodsPerDay, 10);
    if (!ppd || ppd < 1 || ppd > 12) { setMsg({ ok: false, text: "Periods per day must be between 1 and 12" }); return; }
    setSaving(true);
    const id   = "sec-" + Date.now();
    const subs = subText.split("\n").filter(Boolean).map((s, i) => ({
      id: "sub-" + Date.now() + i, name: s.trim(), facultyPhone: "",
    }));
    await setDoc(doc(db, "sections", id), {
      name: name.trim(), adminPhone: user.phone, students, subjects: subs, periodsPerDay: ppd,
    });
    setSaving(false);
    onBack();
  }

  return (
    <div style={{ background: P.bg, minHeight: "100vh" }}>
      <TopBar title="New section" onBack={onBack} />
      <div style={{ padding: 16 }}>
        {msg && <div style={{ background: msg.ok ? P.greenL : P.redL, color: msg.ok ? P.green : P.red, fontSize: 13, padding: "10px 12px", borderRadius: 8, marginBottom: 12 }}>{msg.text}</div>}
        <Fld label="Section name" value={name} onChange={setName} placeholder="e.g. Mech A – I Year" />
        <Fld label="Periods per day" value={periodsPerDay} onChange={setPeriodsPerDay} placeholder="e.g. 7" type="number" />
        <div style={{ fontSize: 12, color: P.gray, fontWeight: 500, marginBottom: 4 }}>Subjects (one per line)</div>
        <textarea value={subText} onChange={e => setSubText(e.target.value)} rows={4}
          placeholder={"Engineering Mechanics\nThermodynamics"}
          style={{ width: "100%", boxSizing: "border-box", border: "1px solid " + P.border, borderRadius: 8, padding: "9px 12px", fontSize: 14, fontFamily: "inherit", marginBottom: 16 }} />
        <Btn variant="outline" small onClick={downloadTemplate} style={{ marginBottom: 8 }}>⬇ Download CSV template</Btn>
        <div style={{ fontSize: 12, color: P.gray, margin: "8px 0" }}>Fill and upload. Roll Number is mandatory.</div>
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
        <Btn full onClick={save} disabled={saving} style={{ marginTop: 8 }}>{saving ? "Saving…" : "Create section"}</Btn>
      </div>
    </div>
  );
}

// ── Section detail ─────────────────────────────────────────
function SectionDetail({ secId, onBack }) {
  const [section, setSection] = useState(null);
  const [att,     setAtt]     = useState({});
  const [tab,     setTab]     = useState("overview");
  const [attLoading, setAttLoading] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "sections", secId), snap => {
      setSection({ id: snap.id, ...snap.data() });
    });
    return unsub;
  }, [secId]);

  // ── FIX 1: Load attendance fresh every time, with refresh button ──
  async function loadAtt() {
    setAttLoading(true);
    try {
      const data = {};
      // Load attendance for every subject in the section
      for (const sub of (section?.subjects || [])) {
        try {
          const dateSnap = await getDocs(
            collection(db, "attendance", secId, "subjects", sub.id, "dates")
          );
          data[sub.id] = {};
          dateSnap.forEach(d => { data[sub.id][d.id] = d.data(); });
        } catch (e) {
          data[sub.id] = {};
        }
      }
      setAtt(data);
    } catch (e) {
      console.error("Error loading attendance:", e);
    }
    setAttLoading(false);
  }

  // Reload whenever section data is available
  useEffect(() => {
    if (section) loadAtt();
  }, [secId, section]);

  if (!section) return <Spinner />;

  return (
    <div style={{ background: P.bg, minHeight: "100vh" }}>
      <TopBar title={section.name} subtitle="Section detail" onBack={onBack} />
      <div style={{ background: "#fff", borderBottom: "1px solid " + P.border, display: "flex", overflowX: "auto" }}>
        {["overview","students","subjects","attendance","reports","studentData"].map(t => (
          <button key={t} onClick={() => { setTab(t); if (t === "reports" || t === "attendance") loadAtt(); }}
            style={{ border: "none", background: "none", cursor: "pointer", padding: "12px 16px", fontSize: 13, fontWeight: 600, color: tab === t ? P.blue : P.gray, borderBottom: tab === t ? "3px solid " + P.blue : "3px solid transparent", whiteSpace: "nowrap", fontFamily: "inherit" }}>
            {t === "studentData" ? "Student Data" : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      <div style={{ padding: 16 }}>
        {tab === "overview"   && <TabOverview   section={section} att={att} />}
        {tab === "students"   && <TabStudents   section={section} />}
        {tab === "subjects"   && <TabSubjects   section={section} />}
        {tab === "attendance" && <TabAdminAtt   section={section} att={att} secId={secId} setAtt={setAtt} onRefresh={loadAtt} attLoading={attLoading} />}
        {tab === "reports"    && <TabReports    section={section} att={att} onRefresh={loadAtt} attLoading={attLoading} />}
        {tab === "studentData" && <TabStudentData section={section} />}
      </div>
    </div>
  );
}

// ── Overview ───────────────────────────────────────────────
function TabOverview({ section, att }) {
  const [editingPpd, setEditingPpd] = useState(false);
  const [ppdValue, setPpdValue] = useState(String(section.periodsPerDay || 7));
  const [savingPpd, setSavingPpd] = useState(false);

  async function savePpd() {
    const ppd = parseInt(ppdValue, 10);
    if (!ppd || ppd < 1 || ppd > 12) return;
    setSavingPpd(true);
    await updateDoc(doc(db, "sections", section.id), { periodsPerDay: ppd });
    setSavingPpd(false);
    setEditingPpd(false);
  }

  const below = (section.students || []).map((st, stIdx) => {
    let p = 0, t = 0;
    (section.subjects || []).forEach(sub => {
      Object.values(att[sub.id] || {}).forEach(rec => {
        t++; if (readStatus(rec, sub, st, stIdx + 1) !== "A") p++;
      });
    });
    return { ...st, pc: calcPct(p, t), t };
  }).filter(s => s.t > 0 && s.pc < 75);
  const belowRed = below.filter(s => s.pc < 65).length;
  const belowYellow = below.length - belowRed;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
        <div style={{ background: P.blueL, borderRadius: 12, padding: "16px 14px" }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: P.blue }}>{section.students?.length || 0}</div>
          <div style={{ fontSize: 12, color: P.gray }}>Students</div>
        </div>
        <div style={{ background: P.tealL, borderRadius: 12, padding: "16px 14px" }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: P.teal }}>{section.subjects?.length || 0}</div>
          <div style={{ fontSize: 12, color: P.gray }}>Subjects</div>
        </div>
      </div>

      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>Periods per day</div>
            <div style={{ fontSize: 12, color: P.gray, marginTop: 2 }}>Controls how many period buttons faculty see when marking attendance.</div>
          </div>
          {!editingPpd && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Badge color="blue">{section.periodsPerDay || 7}</Badge>
              <Btn small variant="ghost" onClick={() => { setPpdValue(String(section.periodsPerDay || 7)); setEditingPpd(true); }}>Edit</Btn>
            </div>
          )}
        </div>
        {editingPpd && (
          <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center" }}>
            <input type="number" min="1" max="12" value={ppdValue} onChange={e => setPpdValue(e.target.value)}
              style={{ width: 70, boxSizing: "border-box", border: "1px solid " + P.border, borderRadius: 8, padding: "8px 10px", fontSize: 14, fontFamily: "inherit" }} />
            <Btn small onClick={savePpd} disabled={savingPpd}>{savingPpd ? "Saving…" : "Save"}</Btn>
            <Btn small variant="ghost" onClick={() => setEditingPpd(false)}>Cancel</Btn>
          </div>
        )}
      </Card>

      {below.length > 0 && (
        <Card>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Attendance shortage overview</div>
          <div style={{ display: "flex", gap: 16 }}>
            <div>
              <span style={{ display: "inline-block", width: 10, height: 10, background: "#fef3c7", marginRight: 6, verticalAlign: "middle" }} />
              <span style={{ fontSize: 13 }}>{belowYellow} student(s) at 65–74.99%</span>
            </div>
            <div>
              <span style={{ display: "inline-block", width: 10, height: 10, background: "#fee2e2", marginRight: 6, verticalAlign: "middle" }} />
              <span style={{ fontSize: 13 }}>{belowRed} student(s) below 65%</span>
            </div>
          </div>
          <div style={{ fontSize: 11, color: P.gray, marginTop: 6 }}>See the Reports tab for full color-coded student-wise detail.</div>
        </Card>
      )}
      <Card>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>App link for faculty</div>
        <div style={{ fontSize: 12, color: P.gray, wordBreak: "break-all", background: P.bg, borderRadius: 6, padding: "8px 10px" }}>
          https://attendsync-66e55.web.app
        </div>
        <div style={{ fontSize: 11, color: P.gray, marginTop: 4 }}>Faculty open this → register → you approve them under 👥 Users</div>
      </Card>
    </div>
  );
}

// ── Students tab ───────────────────────────────────────────
function TabStudents({ section }) {
  const [adding, setAdding] = useState(false);
  const [roll, setRoll] = useState(""); const [name, setName] = useState(""); const [gender, setGender] = useState(""); const [mobile, setMobile] = useState("");
  const fileRef = useRef();

  async function addStudent() {
    if (!roll) return;
    const updated = [...(section.students || []), { roll: roll.trim(), name: name.trim(), gender: gender.trim(), mobile: mobile.trim() }];
    await updateDoc(doc(db, "sections", section.id), { students: updated });
    setRoll(""); setName(""); setGender(""); setMobile(""); setAdding(false);
  }

  async function uploadCSV(e) {
    const f = e.target.files[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = async ev => {
      const p = parseCSV(ev.target.result);
      if (!p.length) return;
      await updateDoc(doc(db, "sections", section.id), { students: p });
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
        </div>
      ))}
    </div>
  );
}

// ── Subjects tab ───────────────────────────────────────────
function TabSubjects({ section }) {
  const [editId, setEditId] = useState(null); const [fp, setFp] = useState("");
  const [addingSub, setAddingSub] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("Theory");
  const [facultyList, setFacultyList] = useState([]);
  const [batchEditSubId, setBatchEditSubId] = useState(null);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "users"), snap => {
      const users = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const approvedFaculty = users.filter(u =>
        u.status === "approved" &&
        (u.role === "admin" || !u.invitedBy || u.invitedBy === section.adminPhone)
      );
      setFacultyList(approvedFaculty);
    });
    return unsub;
  }, [section.adminPhone]);

  async function saveNewSubject() {
    if (!newName.trim()) return;
    const subs = [...(section.subjects || []), {
      id: "sub-" + Date.now(), name: newName.trim(), type: newType, facultyPhone: "", batches: [],
    }];
    await updateDoc(doc(db, "sections", section.id), { subjects: subs });
    setNewName(""); setNewType("Theory"); setAddingSub(false);
  }

  async function assignFaculty(subId) {
    if (!fp) return;
    const subs = (section.subjects || []).map(s => s.id === subId ? { ...s, facultyPhone: fp } : s);
    await updateDoc(doc(db, "sections", section.id), { subjects: subs });
    setEditId(null); setFp("");
  }

  async function saveBatches(subId, batches) {
    const subs = (section.subjects || []).map(s => s.id === subId ? { ...s, batches } : s);
    await updateDoc(doc(db, "sections", section.id), { subjects: subs });
    setBatchEditSubId(null);
  }

  async function deleteSubject(sub) {
    if (!window.confirm("Delete \"" + sub.name + "\"? This will also permanently delete all of its attendance history. This cannot be undone.")) return;
    const subs = (section.subjects || []).filter(s => s.id !== sub.id);
    await updateDoc(doc(db, "sections", section.id), { subjects: subs });
    // Best-effort cleanup of attendance history for this subject.
    try {
      const datesSnap = await getDocs(collection(db, "attendance", section.id, "subjects", sub.id, "dates"));
      await Promise.all(datesSnap.docs.map(d => deleteDoc(d.ref)));
    } catch (e) { /* non-fatal — section still updated even if cleanup fails */ }
  }

  return (
    <div>
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
        <SubjectCard key={sub.id} sub={sub} section={section}
          editId={editId} setEditId={setEditId} fp={fp} setFp={setFp}
          facultyList={facultyList}
          onAssign={() => assignFaculty(sub.id)}
          onDelete={() => deleteSubject(sub)}
          batchEditOpen={batchEditSubId === sub.id}
          onToggleBatchEdit={() => setBatchEditSubId(batchEditSubId === sub.id ? null : sub.id)}
          onSaveBatches={(batches) => saveBatches(sub.id, batches)}
        />
      ))}
    </div>
  );
}

function SubjectCard({ sub, section, editId, setEditId, fp, setFp, facultyList, onAssign, onDelete, batchEditOpen, onToggleBatchEdit, onSaveBatches }) {
  const [facName, setFacName] = useState(null);
  const hasBatches = sub.batches && sub.batches.length > 0;

  useEffect(() => {
    if (!sub.facultyPhone) { setFacName(null); return; }
    getDoc(doc(db, "users", sub.facultyPhone)).then(snap => {
      setFacName(snap.exists() ? snap.data().name : sub.facultyPhone);
    });
  }, [sub.facultyPhone]);

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
          <Badge color="gray">{sub.type || "Theory"}</Badge>
        </div>
        <button
          onClick={onDelete}
          style={{ background: P.redL, border: "none", color: P.red, borderRadius: 8, padding: "5px 9px", cursor: "pointer", fontSize: 12, fontWeight: 600 }}
          title="Delete subject"
        >🗑</button>
      </div>

      {facName ? (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div><Badge color="teal">{facName}</Badge><div style={{ fontSize: 11, color: P.gray, marginTop: 3 }}>{sub.facultyPhone}</div></div>
          <Btn small variant="ghost" onClick={() => { setEditId(sub.id); setFp(sub.facultyPhone); }}>Change</Btn>
        </div>
      ) : (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Badge color="amber">No faculty assigned</Badge>
          <Btn small onClick={() => { setEditId(sub.id); setFp(""); }}>Assign</Btn>
        </div>
      )}
      {editId === sub.id && (
        <div style={{ marginTop: 10 }}>
          {facultyOptions.length > 0 ? (
            <Sel label="Select faculty" value={fp} onChange={setFp} options={facultyOptions} />
          ) : (
            <div style={{ fontSize: 12, color: P.gray, marginBottom: 10 }}>
              No approved faculty available to assign yet. Share your invite link and approve faculty first.
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <Btn small onClick={onAssign}>Save</Btn>
            <Btn small variant="ghost" onClick={() => setEditId(null)}>Cancel</Btn>
          </div>
        </div>
      )}

      {hasBatches && (
        <div style={{ marginTop: 10, background: P.bg, borderRadius: 8, padding: "8px 10px" }}>
          <div style={{ fontSize: 11, color: P.gray, fontWeight: 600, marginBottom: 4 }}>
            Batches defined — faculty will choose a batch each time they mark attendance
          </div>
          {sub.batches.map(b => (
            <div key={b.id} style={{ fontSize: 12, color: P.gray }}>{b.label}: serial {b.rollStart}–{b.rollEnd}</div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 10, borderTop: "1px solid " + P.border, paddingTop: 8 }}>
        {(sub.type === "Lab" || sub.type === "Drawing" || hasBatches) && (
          <Btn small variant="ghost" onClick={onToggleBatchEdit}>
            {hasBatches ? "✎ Edit batches" : "+ Split into batches"}
          </Btn>
        )}
      </div>

      {batchEditOpen && (
        <BatchEditor section={section} sub={sub} onSave={onSaveBatches} onCancel={onToggleBatchEdit} />
      )}
    </Card>
  );
}

// ── Batch editor — define serial-range batches for a Lab/Drawing subject ──
function BatchEditor({ section, sub, onSave, onCancel }) {
  const totalStudents = section.students?.length || 0;
  const [rows, setRows] = useState(
    sub.batches && sub.batches.length > 0
      ? sub.batches.map(b => ({ ...b }))
      : [{ id: "b" + Date.now(), label: "Batch 1", rollStart: 1, rollEnd: totalStudents }]
  );
  const [error, setError] = useState(null);

  function addRow() {
    const lastEnd = rows.length ? rows[rows.length - 1].rollEnd : 0;
    setRows(r => [...r, { id: "b" + Date.now(), label: "Batch " + (r.length + 1), rollStart: lastEnd + 1, rollEnd: totalStudents }]);
  }
  function removeRow(id) {
    setRows(r => r.filter(x => x.id !== id));
  }
  function updateRow(id, field, value) {
    setRows(r => r.map(x => x.id === id ? { ...x, [field]: field === "label" ? value : (parseInt(value, 10) || 0) } : x));
  }

  function save() {
    const result = validateBatches(rows, totalStudents);
    if (!result.valid) { setError(result.error); return; }
    setError(null);
    onSave(rows);
  }

  function removeBatching() {
    if (!window.confirm("Remove batching for this subject? It will go back to a single whole-class faculty assignment.")) return;
    onSave([]);
  }

  return (
    <div style={{ marginTop: 12, borderTop: "1px solid " + P.border, paddingTop: 10 }}>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
        Define batches by student serial number ({totalStudents} students total)
      </div>
      {rows.map(r => (
        <div key={r.id} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8 }}>
          <input value={r.label} onChange={e => updateRow(r.id, "label", e.target.value)}
            style={{ flex: 1, border: "1px solid " + P.border, borderRadius: 6, padding: "6px 8px", fontSize: 12, fontFamily: "inherit" }} />
          <span style={{ fontSize: 11, color: P.gray }}>Serial</span>
          <input type="number" value={r.rollStart} onChange={e => updateRow(r.id, "rollStart", e.target.value)}
            style={{ width: 55, border: "1px solid " + P.border, borderRadius: 6, padding: "6px 8px", fontSize: 12, fontFamily: "inherit" }} />
          <span style={{ fontSize: 11, color: P.gray }}>to</span>
          <input type="number" value={r.rollEnd} onChange={e => updateRow(r.id, "rollEnd", e.target.value)}
            style={{ width: 55, border: "1px solid " + P.border, borderRadius: 6, padding: "6px 8px", fontSize: 12, fontFamily: "inherit" }} />
          {rows.length > 1 && (
            <button onClick={() => removeRow(r.id)} style={{ background: "none", border: "none", color: P.red, cursor: "pointer", fontSize: 14 }}>✕</button>
          )}
        </div>
      ))}
      {error && <div style={{ color: P.red, fontSize: 12, marginBottom: 8 }}>{error}</div>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Btn small variant="ghost" onClick={addRow}>+ Add batch</Btn>
        <Btn small onClick={save}>Save batches</Btn>
        <Btn small variant="ghost" onClick={onCancel}>Cancel</Btn>
        {sub.batches && sub.batches.length > 0 && (
          <Btn small variant="danger" onClick={removeBatching}>Remove batching</Btn>
        )}
      </div>
    </div>
  );
}

// ── Admin attendance edit tab (period-aware) ────────────────
function TabAdminAtt({ section, att, secId, setAtt, onRefresh, attLoading }) {
  const periodsPerDay = section.periodsPerDay || 7;
  const [selSub, setSelSub] = useState("");
  const [selBatchId, setSelBatchId] = useState(""); // "" = whole class / no batches
  const [selDate, setSelDate] = useState(today());
  const [selPeriods, setSelPeriods] = useState([]);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const subOpts = (section.subjects || []).map(s => ({ value: s.id, label: s.name }));
  const subject = (section.subjects || []).find(s => s.id === selSub);
  const hasBatches = subject && subject.batches && subject.batches.length > 0;
  const batchOpts = hasBatches ? subject.batches.map(b => ({ value: b.id, label: b.label + " (serial " + b.rollStart + "–" + b.rollEnd + ")" })) : [];
  const selectedBatch = hasBatches ? subject.batches.find(b => b.id === selBatchId) : null;
  const roster = selectedBatch ? studentsInBatch(section.students, selectedBatch) : (section.students || []);
  const slotKey = batchSlotKey(selectedBatch ? selectedBatch.id : null);

  // doneMap for the period picker: a period counts as "done" for the selected batch slot
  const doneMap = {};
  if (selSub && (!hasBatches || selBatchId)) {
    for (let p = 1; p <= periodsPerDay; p++) {
      const k = makeKey(selDate, p);
      const fullDoc = att[selSub]?.[k];
      if (fullDoc && (fullDoc[slotKey] || (!hasBatches && Object.keys(fullDoc).some(key => !key.startsWith("_"))))) {
        doneMap[p] = fullDoc;
      }
    }
  }

  // Saved record = this batch's slot from the first selected period that has it
  const firstWithData = selPeriods.find(p => doneMap[p]);
  const savedFullDoc = firstWithData ? doneMap[firstWithData] : null;
  const saved = savedFullDoc ? (savedFullDoc[slotKey] || savedFullDoc) : null; // fallback for old flat docs
  const display = editing || saved;

  function togglePeriod(p) {
    setSelPeriods(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
    setEditing(null);
  }

  async function saveEdit() {
    setSaving(true);
    await Promise.all(
      selPeriods.map(p =>
        setDoc(doc(db, "attendance", secId, "subjects", selSub, "dates", makeKey(selDate, p)), { [slotKey]: editing }, { merge: true })
      )
    );
    setAtt(prev => {
      const nd = { ...prev };
      if (!nd[selSub]) nd[selSub] = {};
      selPeriods.forEach(p => {
        const k = makeKey(selDate, p);
        nd[selSub][k] = { ...(nd[selSub][k] || {}), [slotKey]: editing };
      });
      return nd;
    });
    setSaving(false);
    setEditing(null);
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <Btn small variant="ghost" onClick={onRefresh} disabled={attLoading}>
          {attLoading ? "Refreshing…" : "🔄 Refresh"}
        </Btn>
      </div>
      <Sel label="Subject" value={selSub} onChange={v => { setSelSub(v); setSelBatchId(""); setSelPeriods([]); setEditing(null); }} options={subOpts} />
      {hasBatches && (
        <Sel label="Batch" value={selBatchId} onChange={v => { setSelBatchId(v); setSelPeriods([]); setEditing(null); }} options={batchOpts} />
      )}
      {selSub && hasBatches && !selBatchId && (
        <div style={{ color: P.gray, fontSize: 13, textAlign: "center", padding: "1rem 0" }}>
          This subject has batches — select one above to mark/edit attendance.
        </div>
      )}
      {selSub && (!hasBatches || selBatchId) && (
        <PeriodPicker
          date={selDate}
          onDateChange={(d) => { setSelDate(d); setSelPeriods([]); setEditing(null); }}
          periodsPerDay={periodsPerDay}
          selected={selPeriods}
          onToggle={togglePeriod}
          doneMap={doneMap}
        />
      )}
      {selSub && (!hasBatches || selBatchId) && selPeriods.length === 0 && (
        <div style={{ color: P.gray, fontSize: 13, textAlign: "center", padding: "1rem 0" }}>
          Select one or more periods above.
        </div>
      )}
      {selSub && (!hasBatches || selBatchId) && selPeriods.length > 0 && !display && (
        <div style={{ textAlign: "center", padding: "1.5rem 0" }}>
          <div style={{ color: P.gray, fontSize: 14, marginBottom: 12 }}>No attendance for selected period(s).</div>
          <Btn small onClick={() => { const r = {}; roster.forEach(s => { r[s.roll] = "P"; }); setEditing(r); }}>Create record</Btn>
        </div>
      )}
      {selSub && (!hasBatches || selBatchId) && selPeriods.length > 0 && display && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <Badge color={editing ? "amber" : "blue"}>{editing ? "Editing (unsaved)" : "Saved"}</Badge>
            {!editing
              ? <Btn small onClick={() => setEditing({ ...saved })}>Admin edit</Btn>
              : <div style={{ display: "flex", gap: 8 }}>
                  <Btn small variant="success" onClick={saveEdit} disabled={saving}>{saving ? "Saving…" : "Save"}</Btn>
                  <Btn small variant="ghost" onClick={() => setEditing(null)}>Cancel</Btn>
                </div>
            }
          </div>
          {editing && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, padding: "8px 0", borderTop: "1px solid " + P.border, borderBottom: "1px solid " + P.border }}>
              <div style={{ fontSize: 12, color: P.gray, fontWeight: 600 }}>Default all to:</div>
              <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: "1.5px solid " + P.border }}>
                <button
                  onClick={() => setEditing(prev => { const nr = {}; Object.keys(prev).forEach(k => nr[k] = "P"); return nr; })}
                  style={{ padding: "6px 16px", fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", background: Object.values(editing).every(v => v === "P") ? P.green : "#fff", color: Object.values(editing).every(v => v === "P") ? "#fff" : P.gray }}
                >All Present</button>
                <button
                  onClick={() => setEditing(prev => { const nr = {}; Object.keys(prev).forEach(k => nr[k] = "A"); return nr; })}
                  style={{ padding: "6px 16px", fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", background: Object.values(editing).every(v => v === "A") ? P.red : "#fff", color: Object.values(editing).every(v => v === "A") ? "#fff" : P.gray }}
                >All Absent</button>
              </div>
            </div>
          )}
          {roster.map(st => (
            <ARow key={st.roll} st={st} status={display[st.roll] ?? "P"}
              onToggle={editing ? roll => setEditing(prev => ({ ...prev, [roll]: (prev[roll] ?? "P") === "P" ? "A" : "P" })) : null} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Reports tab ────────────────────────────────────────────
function TabReports({ section, att, onRefresh, attLoading }) {
  const [view, setView] = useState("table");

  const stats = (section.students || []).map((st, stIdx) => {
    const subs = (section.subjects || []).map(sub => {
      const dm = att[sub.id] || {};
      const keys = Object.keys(dm); // each key = "date_period" = one class
      let p = 0;
      keys.forEach(k => { if (readStatus(dm[k], sub, st, stIdx + 1) !== "A") p++; });
      return { name: sub.name, classes: keys.length, present: p };
    });
    const tc = subs.reduce((a, s) => a + s.classes, 0);
    const tp = subs.reduce((a, s) => a + s.present, 0);
    return { ...st, subs, tc, tp, overall: calcPct(tp, tc) };
  });

  const subTotals = (section.subjects || []).map(sub => Object.keys(att[sub.id] || {}).length);
  const grandTotal = subTotals.reduce((a, b) => a + b, 0);

  const th = { background: P.blue, color: "#fff", fontWeight: 600, fontSize: 12, padding: "8px 10px", textAlign: "center", border: "1px solid #1244a0", whiteSpace: "nowrap" };
  const td = { fontSize: 12, padding: "7px 10px", textAlign: "center", border: "1px solid " + P.border };

  const rowBg = {
    red:    { bg: "#fee2e2", fg: P.red },
    yellow: { bg: "#fef3c7", fg: P.amber },
    none:   { bg: null,      fg: "#111" },
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>Consolidated report</div>
        <div style={{ display: "flex", gap: 6 }}>
          <Btn small variant="ghost" onClick={onRefresh} disabled={attLoading}>{attLoading ? "…" : "🔄"}</Btn>
          <Btn small variant={view === "cards" ? "primary" : "ghost"} onClick={() => setView("cards")}>Cards</Btn>
          <Btn small variant={view === "table" ? "primary" : "ghost"} onClick={() => setView("table")}>📊 Preview</Btn>
          <Btn small variant="accent" onClick={() => exportXLS(section, att)}>⬇ Excel</Btn>
        </div>
      </div>

      {attLoading && <div style={{ textAlign: "center", color: P.gray, padding: "1rem" }}>Loading latest attendance…</div>}

      <div style={{ fontSize: 11, color: P.gray, marginBottom: 6 }}>
        <span style={{ display: "inline-block", width: 10, height: 10, background: "#fef3c7", marginRight: 4, verticalAlign: "middle" }} />65–74.99%
        <span style={{ display: "inline-block", width: 10, height: 10, background: "#fee2e2", marginLeft: 10, marginRight: 4, verticalAlign: "middle" }} />&lt;65%
      </div>

      {view === "table" && (
        <div style={{ overflowX: "auto" }}>
          <div style={{ fontSize: 11, color: P.gray, marginBottom: 6 }}>Matches the <strong>Consolidated</strong> sheet in Excel export.</div>
          <table style={{ borderCollapse: "collapse", minWidth: "100%" }}>
            <thead>
              <tr>
                <th style={th}>S.No</th><th style={th}>Roll No</th><th style={th}>Name</th><th style={th}>Gender</th>
                {(section.subjects || []).map((sub, i) => <th key={sub.id} style={th}>{sub.name}<br />({subTotals[i]})</th>)}
                <th style={th}>Total Attended<br />({grandTotal})</th>
                <th style={th}>Overall %</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((st, i) => {
                const c = rowBg[rowColor(st.overall)];
                return (
                  <tr key={st.roll} style={{ background: c.bg || "#fff" }}>
                    <td style={{ ...td, color: c.fg }}>{i + 1}</td>
                    <td style={{ ...td, fontWeight: 600, color: c.fg }}>{st.roll}</td>
                    <td style={{ ...td, textAlign: "left", whiteSpace: "nowrap", color: c.fg }}>{st.name || "—"}</td>
                    <td style={{ ...td, color: c.fg }}>{st.gender || "—"}</td>
                    {st.subs.map(s => <td key={s.name} style={{ ...td, color: c.fg }}>{s.present}</td>)}
                    <td style={{ ...td, fontWeight: 600, color: c.fg }}>{st.tp}</td>
                    <td style={{ ...td, fontWeight: 700, color: c.fg }}>{st.overall.toFixed(2)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {stats.length === 0 && <div style={{ color: P.gray, textAlign: "center", padding: "1rem" }}>No data yet.</div>}
        </div>
      )}

      {view === "cards" && (
        <div>
          {stats.map(st => {
            const c = rowColor(st.overall);
            const badgeColor = c === "red" ? "red" : c === "yellow" ? "amber" : "green";
            const cardBg = rowBg[c].bg;
            return (
              <Card key={st.roll} style={cardBg ? { background: cardBg } : {}}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{st.name || st.roll}</span>
                      <GPill g={st.gender} />
                    </div>
                    <div style={{ fontSize: 12, color: P.gray }}>{st.roll}</div>
                  </div>
                  <Badge color={badgeColor}>{st.overall.toFixed(2)}%</Badge>
                </div>
                {st.subs.map(s => (
                  <div key={s.name} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "4px 0", borderTop: "1px solid " + P.border }}>
                    <span style={{ color: P.gray }}>{s.name}</span>
                    <span style={{ fontWeight: 500 }}>{s.present}/{s.classes} ({calcPct(s.present, s.classes).toFixed(2)}%)</span>
                  </div>
                ))}
              </Card>
            );
          })}
          {stats.length === 0 && <div style={{ color: P.gray, textAlign: "center", padding: "2rem" }}>No data yet.</div>}
        </div>
      )}
    </div>
  );
}