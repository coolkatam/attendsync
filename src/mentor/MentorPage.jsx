
// src/mentor/MentorPage.jsx
// Shown in the "Mentor" tab of FacultyApp.
//
// Flow:
//   1. Mentor downloads blank Excel template (just column headings)
//   2. Fills in their assigned students (roll number + all data)
//   3. Uploads — each student is written to students/{roll} with mentorPhone tag
//   4. Their mentee list appears (students where mentorPhone === user.phone)
//   5. Click any student → editable profile (same colorful layout as HoD)

import { useState, useEffect, useRef } from "react";
import { collection, query, where, onSnapshot, doc, getDoc, setDoc, updateDoc, arrayUnion, arrayRemove, deleteField } from "firebase/firestore";
import * as XLSX from "xlsx";
import { db } from "../firebase";
import { getAttendanceSummary } from "../hod/hodAttendance";
import { uploadStudentRecords } from "../hod/studentDataUpload";

const SEM_LABELS = { 1:"I-I", 2:"I-II", 3:"II-I", 4:"II-II", 5:"III-I", 6:"III-II", 7:"IV-I", 8:"IV-II" };
const SEM_CREDITS = { 1:19, 2:21, 3:20, 4:21, 5:22, 6:22, 7:23, 8:12 };

const SD_HEADERS = [
  "S.No","RollNumber","Name","ParentName","ParentOccupation","Category",
  "StudentMobile","ParentMobile","HostelType","AttendanceRef",
  ...["I-I","I-II","II-I","II-II","III-I","III-II","IV-I","IV-II"].flatMap(s => [s+"_SGPA", s+"_Backlogs"]),
  "FeeBalance",
];

function gradeColor(pct) {
  if (pct == null) return "#5F5E5A";
  if (pct < 65) return "#A32D2D";
  if (pct < 75) return "#854F0B";
  return "#0F6E56";
}

// ── Trend Chart ───────────────────────────────────────────────────────────────
function TrendChart({ id, labels, data, color, bgColor, min, max }) {
  const ref = useRef(null);
  const chart = useRef(null);
  useEffect(() => {
    function draw() {
      if (!ref.current || !window.Chart) return;
      if (chart.current) chart.current.destroy();
      chart.current = new window.Chart(ref.current, {
        type: "line",
        data: { labels, datasets: [{ data, borderColor: color, backgroundColor: bgColor, fill: true, tension: 0.3, pointRadius: labels.length > 20 ? 1 : 3 }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { min, max, grid: { color: "#cfd9e6" }, ticks: { color: "#6b7b8c", font: { size: 10 } } },
            x: { grid: { display: false }, ticks: { color: "#6b7b8c", font: { size: 10 }, maxTicksLimit: 10, maxRotation: 45 } },
          },
        },
      });
    }
    if (!window.Chart) {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js";
      s.onload = draw; document.body.appendChild(s);
    } else { draw(); }
    return () => { if (chart.current) chart.current.destroy(); };
  }, [labels, data, color, bgColor, min, max]);
  return <div style={{ position: "relative", height: 110 }}><canvas ref={ref} id={id} /></div>;
}

// ── Editable Student Profile ──────────────────────────────────────────────────
function StudentProfile({ rollNumber, onBack, user }) {
  const [profile, setProfile] = useState(null);
  const [attendance, setAttendance] = useState({ overallPct: null, daily: [] });
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [commentText, setCommentText] = useState("");
  const [commentDate, setCommentDate] = useState(new Date().toISOString().split("T")[0]);
  const [addingComment, setAddingComment] = useState(false);
  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedComments, setSelectedComments] = useState([]);

  const [ef, setEf] = useState({}); // edit fields
  const [editSems, setEditSems] = useState({});

  useEffect(() => {
    async function load() {
      const snap = await getDoc(doc(db, "students", rollNumber));
      const p = snap.exists() ? snap.data() : {};
      setProfile({ id: rollNumber, ...p });
      const att = await getAttendanceSummary(rollNumber);
      setAttendance(att);
      setLoading(false);
    }
    load();
  }, [rollNumber]);

  function startEdit() {
    setEf({
      name: profile?.name || "",
      category: profile?.category || "",
      hostelType: profile?.hostelType || "",
      studentMobile: profile?.studentMobile || "",
      parentName: profile?.parentName || "",
      parentOccupation: profile?.parentOccupation || "",
      parentMobile: profile?.parentMobile || "",
      feeBalance: profile?.feeBalance != null ? String(profile.feeBalance) : "",
    });
    const s = {};
    for (let i = 1; i <= 8; i++) {
      const sem = profile?.semesters?.[i];
      s[i] = { sgpa: sem?.sgpa != null ? String(sem.sgpa) : "", backlogs: sem?.backlogs?.join(", ") || "" };
    }
    setEditSems(s);
    setEditing(true);
    setMsg("");
  }

  async function handleSave() {
    setSaving(true); setMsg("");
    try {
      const data = {};
      if (ef.name?.trim()) data.name = ef.name.trim();
      if (ef.category?.trim()) data.category = ef.category.trim();
      if (ef.hostelType?.trim()) data.hostelType = ef.hostelType.trim();
      if (ef.studentMobile?.trim()) data.studentMobile = ef.studentMobile.trim();
      if (ef.parentName?.trim()) data.parentName = ef.parentName.trim();
      if (ef.parentOccupation?.trim()) data.parentOccupation = ef.parentOccupation.trim();
      if (ef.parentMobile?.trim()) data.parentMobile = ef.parentMobile.trim();
      if (ef.feeBalance?.trim() !== "") data.feeBalance = Number(ef.feeBalance);

      const semesters = {};
      let highestSem = 0;
      for (let i = 1; i <= 8; i++) {
        const sgpaRaw = editSems[i]?.sgpa?.trim();
        const backlogRaw = editSems[i]?.backlogs?.trim() || "";
        if (!sgpaRaw && !backlogRaw) continue;
        const backlogs = backlogRaw.split(",").map(b => b.trim()).filter(Boolean);
        const sgpa = sgpaRaw ? Number(sgpaRaw) : 0;
        semesters[i] = { sgpa, backlogs };
        if (i > highestSem) highestSem = i;
      }
      if (highestSem > 0) { data.semesters = semesters; data.completedSemesters = highestSem; }

      await setDoc(doc(db, "students", rollNumber), data, { merge: true });
      const snap = await getDoc(doc(db, "students", rollNumber));
      setProfile({ id: rollNumber, ...snap.data() });
      setEditing(false);
      setMsg("Saved successfully.");
    } catch (err) {
      setMsg("Save failed: " + err.message);
    } finally { setSaving(false); }
  }

  async function handleAddComment() {
    if (!commentText.trim()) return;
    setAddingComment(true);
    try {
      const entry = {
        date: commentDate,
        comment: commentText.trim(),
        mentorName: user?.name || "",
      };
      await updateDoc(doc(db, "students", rollNumber), {
        mentorComments: arrayUnion(entry),
      });
      // Refresh profile to show new comment
      const snap = await getDoc(doc(db, "students", rollNumber));
      setProfile({ id: rollNumber, ...snap.data() });
      setCommentText("");
      setCommentDate(new Date().toISOString().split("T")[0]);
    } catch (err) {
      setMsg("Failed to save comment: " + err.message);
    } finally { setAddingComment(false); }
  }

  async function handleDeleteComments() {
    const toDelete = (profile?.mentorComments || []).filter((_, i) => selectedComments.includes(i));
    if (toDelete.length === 0) return;
    if (!window.confirm(`Delete ${toDelete.length} selected comment(s)? This cannot be undone.`)) return;
    try {
      // arrayRemove needs exact object matches
      await updateDoc(doc(db, "students", rollNumber), {
        mentorComments: arrayRemove(...toDelete),
      });
      const snap = await getDoc(doc(db, "students", rollNumber));
      setProfile({ id: rollNumber, ...snap.data() });
      setDeleteMode(false);
      setSelectedComments([]);
    } catch (err) {
      setMsg("Failed to delete comments: " + err.message);
    }
  }

  if (loading) return <div style={{ padding: 32, textAlign: "center", color: "#888" }}>Loading…</div>;

  const N = profile?.completedSemesters || 0;
  const semList = N > 0 ? Array.from({ length: N }, (_, i) => {
    const num = i + 1;
    const s = profile?.semesters?.[num];
    return { num, sgpa: s?.sgpa ?? 0, backlogs: s?.backlogs || [] };
  }) : [];
  const totalCredits = semList.reduce((sum, s) => sum + (SEM_CREDITS[s.num] || 0), 0);
  const weightedSum = semList.reduce((sum, s) => sum + s.sgpa * (SEM_CREDITS[s.num] || 0), 0);
  const cgpa = totalCredits > 0 ? weightedSum / totalCredits : null;
  const allBacklogs = semList.flatMap(s => s.backlogs);

  const inp = (key, placeholder) => (
    <input value={ef[key] || ""} onChange={e => setEf(f => ({ ...f, [key]: e.target.value }))}
      placeholder={placeholder}
      style={{ width: "100%", boxSizing: "border-box", border: "1px solid #d0cdc5", borderRadius: 6, padding: "6px 8px", fontSize: 12, fontFamily: "inherit" }} />
  );

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: 16 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, background: "#E6F1FB", borderRadius: 10, padding: "0.9rem 1rem" }}>
        <button onClick={onBack} style={{ background: "rgba(24,95,165,0.12)", border: "none", borderRadius: 6, padding: "5px 10px", cursor: "pointer", color: "#185FA5", fontSize: 12 }}>← Back</button>
        <div style={{ width: 46, height: 46, borderRadius: "50%", background: "#B5D4F4", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 600, color: "#0C447C" }}>
          {(profile?.name || rollNumber)?.[0] || "?"}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: "#042C53" }}>{profile?.name || "—"}</div>
          <div style={{ color: "#185FA5", fontSize: 13 }}>{rollNumber}{profile?.category ? ` · ${profile.category}` : ""}</div>
        </div>
        <button onClick={editing ? () => setEditing(false) : startEdit}
          style={{ fontSize: 13, color: "#185FA5", border: "0.5px solid #185FA5", background: "#fff", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontWeight: 600 }}>
          {editing ? "✕ Cancel" : "✎ Edit"}
        </button>
      </div>

      {msg && <p style={{ fontSize: 13, color: msg.startsWith("Save failed") ? "#b91c1c" : "#166534", marginBottom: 10 }}>{msg}</p>}

      {!editing && (
        <>
          {/* Stat cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 10, marginBottom: 12 }}>
            {[
              { bg: "#E1F5EE", lc: "#0F6E56", vc: gradeColor(attendance.overallPct), label: "Attendance", val: attendance.overallPct != null ? `${attendance.overallPct.toFixed(1)}%` : "—" },
              { bg: "#EEEDFE", lc: "#534AB7", vc: "#26215C", label: "CGPA", val: cgpa != null ? cgpa.toFixed(2) : "—" },
              { bg: "#FBEAF0", lc: "#993556", vc: "#4B1528", label: "Backlogs", val: N > 0 ? allBacklogs.length : "—" },
              { bg: "#FAEEDA", lc: "#854F0B", vc: "#412402", label: "Fee balance", val: profile?.feeBalance != null ? `₹${profile.feeBalance.toLocaleString("en-IN")}` : "—" },
            ].map(c => (
              <div key={c.label} style={{ background: c.bg, borderRadius: 8, padding: "0.85rem" }}>
                <div style={{ fontSize: 12, color: c.lc, marginBottom: 4 }}>{c.label}</div>
                <div style={{ fontSize: 19, fontWeight: 600, color: c.vc }}>{c.val}</div>
              </div>
            ))}
          </div>

          {/* Personal details */}
          <div style={{ background: "#fff", border: "1px solid #e0ded6", borderRadius: 8, padding: "0.9rem 1rem", marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Personal &amp; family details</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 13 }}>
              <div><span style={{ color: "#5F5E5A" }}>Hostel:</span> {profile?.hostelType || "—"}</div>
              <div><span style={{ color: "#5F5E5A" }}>Student mobile:</span> {profile?.studentMobile || "—"}</div>
              <div><span style={{ color: "#5F5E5A" }}>Parent:</span> {profile?.parentName || "—"} {profile?.parentOccupation ? `(${profile.parentOccupation})` : ""}</div>
              <div><span style={{ color: "#5F5E5A" }}>Parent mobile:</span> {profile?.parentMobile || "—"}</div>
            </div>
          </div>

          {/* Trend charts */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div style={{ background: "#E1F5EE", borderRadius: 8, padding: "0.85rem" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#04342C", marginBottom: 6 }}>Attendance trend</div>
              {attendance.daily.length > 0
                ? <TrendChart id={"att-" + rollNumber} labels={attendance.daily.map(d => d.label)} data={attendance.daily.map(d => d.pct)} color="#0F6E56" bgColor="rgba(15,110,86,0.12)" min={0} max={100} />
                : <div style={{ fontSize: 12, color: "#5F5E5A", padding: "20px 0", textAlign: "center" }}>No data yet</div>}
            </div>
            <div style={{ background: "#EEEDFE", borderRadius: 8, padding: "0.85rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#26215C" }}>Mentor comments</div>
                {(profile?.mentorComments?.length > 0) && !deleteMode && (
                  <button onClick={() => { setDeleteMode(true); setSelectedComments([]); }}
                    style={{ fontSize: 11, color: "#993556", background: "none", border: "1px solid #e5b3c4", borderRadius: 5, padding: "2px 8px", cursor: "pointer" }}>
                    🗑 Delete comments
                  </button>
                )}
                {deleteMode && (
                  <div style={{ display: "flex", gap: 5 }}>
                    <button onClick={handleDeleteComments} disabled={selectedComments.length === 0}
                      style={{ fontSize: 11, color: "#fff", background: "#b91c1c", border: "none", borderRadius: 5, padding: "2px 8px", cursor: "pointer", fontWeight: 600, opacity: selectedComments.length === 0 ? 0.5 : 1 }}>
                      Delete selected ({selectedComments.length})
                    </button>
                    <button onClick={() => { setDeleteMode(false); setSelectedComments([]); }}
                      style={{ fontSize: 11, color: "#555", background: "#fff", border: "1px solid #ccc", borderRadius: 5, padding: "2px 8px", cursor: "pointer" }}>
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              {/* Existing comments */}
              {(profile?.mentorComments?.length > 0) ? (
                <div style={{ maxHeight: 120, overflowY: "auto", marginBottom: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                  {profile.mentorComments.map((c, origIdx) => ({ c, origIdx })).reverse().map(({ c, origIdx }) => (
                    <div key={origIdx} style={{ background: deleteMode && selectedComments.includes(origIdx) ? "#fee2e2" : "#fff", borderRadius: 6, padding: "6px 9px", fontSize: 12, display: "flex", gap: 8, alignItems: "flex-start" }}>
                      {deleteMode && (
                        <input type="checkbox" checked={selectedComments.includes(origIdx)}
                          onChange={e => {
                            setSelectedComments(prev => e.target.checked ? [...prev, origIdx] : prev.filter(i => i !== origIdx));
                          }}
                          style={{ marginTop: 2, cursor: "pointer" }} />
                      )}
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                          <span style={{ fontWeight: 600, color: "#534AB7" }}>{c.date}</span>
                          {c.mentorName && <span style={{ color: "#888", fontSize: 11 }}>{c.mentorName}</span>}
                        </div>
                        <div style={{ color: "#333", lineHeight: 1.4 }}>{c.comment}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: "#888", textAlign: "center", padding: "10px 0", marginBottom: 8 }}>No comments yet</div>
              )}

              {/* Add comment form */}
              <div style={{ borderTop: "1px solid #d8d6f8", paddingTop: 8 }}>
                <input type="date" value={commentDate} onChange={e => setCommentDate(e.target.value)}
                  style={{ width: "100%", boxSizing: "border-box", border: "1px solid #c5c2f0", borderRadius: 6, padding: "5px 7px", fontSize: 12, marginBottom: 6, fontFamily: "inherit" }} />
                <textarea value={commentText} onChange={e => setCommentText(e.target.value)}
                  placeholder="Write your comment here…" rows={2}
                  style={{ width: "100%", boxSizing: "border-box", border: "1px solid #c5c2f0", borderRadius: 6, padding: "5px 7px", fontSize: 12, resize: "vertical", fontFamily: "inherit", marginBottom: 6 }} />
                <button onClick={handleAddComment} disabled={addingComment || !commentText.trim()}
                  style={{ fontSize: 12, background: "#534AB7", color: "#fff", border: "none", borderRadius: 6, padding: "6px 14px", cursor: "pointer", fontWeight: 600, opacity: (addingComment || !commentText.trim()) ? 0.6 : 1 }}>
                  {addingComment ? "Saving…" : "Add comment"}
                </button>
              </div>
            </div>
          </div>

          {/* Semester table */}
          <div style={{ background: "#fff", border: "1px solid #e0ded6", borderRadius: 8, padding: "0.9rem 1rem" }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Semester-wise performance</div>
            {semList.length > 0 ? (
              <>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead><tr style={{ borderBottom: "1px solid #e0ded6" }}>
                    <td style={{ padding: "5px 4px", color: "#888", fontSize: 12 }}>Sem</td>
                    <td style={{ padding: "5px 4px", color: "#888", fontSize: 12 }}>SGPA</td>
                    <td style={{ padding: "5px 4px", color: "#888", fontSize: 12 }}>Backlogs</td>
                  </tr></thead>
                  <tbody>
                    {semList.map(s => (
                      <tr key={s.num} style={{ borderBottom: "1px solid #f0eee6" }}>
                        <td style={{ padding: "5px 4px" }}>{SEM_LABELS[s.num]}</td>
                        <td style={{ padding: "5px 4px", color: s.sgpa === 0 ? "#A32D2D" : "#222", fontWeight: s.sgpa === 0 ? 600 : 400 }}>{s.sgpa === 0 ? "0 (Failed)" : s.sgpa}</td>
                        <td style={{ padding: "5px 4px" }}>
                          {s.backlogs.length ? s.backlogs.map((b, i) => (
                            <span key={i} style={{ background: "#FBEAF0", color: "#993556", padding: "2px 7px", borderRadius: 5, fontSize: 11, marginRight: 4, display: "inline-block" }}>{b}</span>
                          )) : <span style={{ color: "#999" }}>—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ marginTop: 10, fontSize: 13 }}>
                  <strong>Active backlogs:</strong>{" "}
                  {allBacklogs.length ? allBacklogs.map((b, i) => (
                    <span key={i} style={{ background: "#FBEAF0", color: "#993556", padding: "2px 7px", borderRadius: 5, fontSize: 11, marginRight: 4, display: "inline-block" }}>{b}</span>
                  )) : <span style={{ color: "#166534" }}>None</span>}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 13, color: "#5F5E5A", textAlign: "center", padding: "10px 0" }}>No semester data yet</div>
            )}
          </div>
        </>
      )}

      {/* Edit panel */}
      {editing && (
        <div style={{ background: "#F1EFE8", border: "1px solid #e0ded6", borderRadius: 10, padding: "1rem" }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Edit student info</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
            {[["name","Name"],["category","Category"],["hostelType","Hostel type"],["studentMobile","Student mobile"],["parentName","Parent name"],["parentOccupation","Parent occupation"],["parentMobile","Parent mobile"],["feeBalance","Fee balance (₹)"]].map(([key, label]) => (
              <div key={key}>
                <div style={{ fontSize: 11, color: "#888", marginBottom: 3 }}>{label}</div>
                {inp(key, label)}
              </div>
            ))}
          </div>

          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>SGPA &amp; backlogs</div>
          <div style={{ display: "grid", gridTemplateColumns: "60px 1fr 1fr", gap: 6, fontSize: 12, marginBottom: 4 }}>
            <div style={{ color: "#888", fontWeight: 600 }}>Sem</div>
            <div style={{ color: "#888", fontWeight: 600 }}>SGPA</div>
            <div style={{ color: "#888", fontWeight: 600 }}>Backlogs (comma-separated)</div>
          </div>
          {Array.from({ length: 8 }, (_, i) => i + 1).map(num => (
            <div key={num} style={{ display: "grid", gridTemplateColumns: "60px 1fr 1fr", gap: 6, marginBottom: 6 }}>
              <div style={{ fontSize: 12, color: "#5F5E5A", fontWeight: 500, display: "flex", alignItems: "center" }}>{SEM_LABELS[num]}</div>
              <input value={editSems[num]?.sgpa || ""} onChange={e => setEditSems(s => ({ ...s, [num]: { ...s[num], sgpa: e.target.value } }))}
                placeholder="e.g. 7.8 or 0"
                style={{ border: "1px solid #d0cdc5", borderRadius: 6, padding: "5px 7px", fontSize: 12, fontFamily: "inherit" }} />
              <input value={editSems[num]?.backlogs || ""} onChange={e => setEditSems(s => ({ ...s, [num]: { ...s[num], backlogs: e.target.value } }))}
                placeholder="blank if none"
                style={{ border: "1px solid #d0cdc5", borderRadius: 6, padding: "5px 7px", fontSize: 12, fontFamily: "inherit" }} />
            </div>
          ))}

          <div style={{ fontSize: 11, color: "#888", background: "#fff", borderRadius: 6, padding: "6px 8px", marginTop: 8 }}>
            ℹ Attendance cannot be edited — computed from actual attendance records.
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={handleSave} disabled={saving}
              style={{ fontSize: 13, background: "#1a56a0", color: "#fff", border: "none", borderRadius: 8, padding: "8px 20px", cursor: saving ? "not-allowed" : "pointer", fontWeight: 600, opacity: saving ? 0.6 : 1 }}>
              {saving ? "Saving…" : "Save changes"}
            </button>
            <button onClick={() => setEditing(false)}
              style={{ fontSize: 13, padding: "8px 16px", borderRadius: 8, cursor: "pointer", border: "1px solid #ccc", background: "#fff" }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Mentor Home Page ──────────────────────────────────────────────────────────
export default function MentorPage({ user }) {
  const [mentees, setMentees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRoll, setSelectedRoll] = useState(null);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addRoll, setAddRoll] = useState("");
  const [addName, setAddName] = useState("");
  const [addBusy, setAddBusy] = useState(false);

  // Live list of students tagged with this mentor's phone
  useEffect(() => {
    const q = query(collection(db, "students"), where("mentorPhone", "==", user.phone));
    const unsub = onSnapshot(q, snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
      setMentees(list);
      setLoading(false);
    });
    return unsub;
  }, [user.phone]);

  function handleDownload() {
    // Blank template — just headings, no pre-filled students
    const row = {};
    SD_HEADERS.forEach(h => { row[h] = ""; });
    const ws = XLSX.utils.json_to_sheet([row], { header: SD_HEADERS });
    ws["!cols"] = SD_HEADERS.map(h => ({ wch: Math.max(h.length + 2, 12) }));
    // Delete the sample empty row so the sheet has only the header
    ws["!ref"] = "A1:" + XLSX.utils.encode_cell({ r: 0, c: SD_HEADERS.length - 1 });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "StudentRecords");
    XLSX.writeFile(wb, "MentorStudentData_Template.xlsx");
  }

  async function handleUpload(e) {
    const file = e.target.files[0]; e.target.value = "";
    if (!file) return;
    setUploadBusy(true); setUploadStatus(null);
    try {
      // Pass mentor's phone so each student gets tagged with mentorPhone
      const result = await uploadStudentRecords(file, user.phone);
      setUploadStatus({ type: "ok", msg: `Updated ${result.count} student record(s).` });
    } catch (err) {
      setUploadStatus({ type: "err", msg: "Upload failed: " + err.message });
    } finally { setUploadBusy(false); }
  }

  async function handleAddStudent() {
    const roll = addRoll.trim();
    if (!roll) return;
    setAddBusy(true);
    try {
      const data = { mentorPhone: user.phone };
      if (addName.trim()) data.name = addName.trim();
      await setDoc(doc(db, "students", roll), data, { merge: true });
      setAddRoll(""); setAddName(""); setShowAddForm(false);
      setUploadStatus({ type: "ok", msg: `Student ${roll} added to your mentee list.` });
    } catch (err) {
      setUploadStatus({ type: "err", msg: "Failed to add student: " + err.message });
    } finally { setAddBusy(false); }
  }

  async function handleRemoveStudent(roll, name) {
    if (!window.confirm(`Remove ${name || roll} from your mentee list?\n\nThe student's academic data is NOT deleted — they are only unlinked from you. HoD can still see all their data.`)) return;
    try {
      await updateDoc(doc(db, "students", roll), { mentorPhone: deleteField() });
    } catch (err) {
      setUploadStatus({ type: "err", msg: "Failed to remove: " + err.message });
    }
  }

  if (selectedRoll) {
    return <StudentProfile rollNumber={selectedRoll} user={user} onBack={() => setSelectedRoll(null)} />;
  }

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: 16 }}>

      {/* Upload section */}
      <div style={{ background: "#fff", border: "1px solid #e0e0e0", borderRadius: 10, padding: "1rem", marginBottom: 20 }}>
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>🎓 My mentees — student data</div>
        <div style={{ fontSize: 13, color: "#5F5E5A", marginBottom: 14 }}>
          Download the blank Excel template, fill in your mentees' details (roll number, name, marks, fee, hostel, parent info), then upload it. Each student appears in your list below after uploading.
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={handleDownload}
            style={{ fontSize: 13, color: "#1a56a0", border: "1px solid #1a56a0", borderRadius: 8, padding: "8px 14px", background: "#fff", cursor: "pointer", fontWeight: 600 }}>
            ⬇ Download blank template
          </button>
          <label style={{ fontSize: 13, background: "#1a56a0", color: "#fff", borderRadius: 8, padding: "8px 14px", cursor: uploadBusy ? "not-allowed" : "pointer", fontWeight: 600, opacity: uploadBusy ? 0.6 : 1 }}>
            {uploadBusy ? "Uploading…" : "⬆ Upload filled sheet"}
            <input type="file" accept=".xlsx,.xls" onChange={handleUpload} disabled={uploadBusy} style={{ display: "none" }} />
          </label>
          <button onClick={() => setShowAddForm(v => !v)}
            style={{ fontSize: 13, color: "#166534", border: "1px solid #166534", borderRadius: 8, padding: "8px 14px", background: "#fff", cursor: "pointer", fontWeight: 600 }}>
            {showAddForm ? "✕ Cancel" : "+ Add student"}
          </button>
        </div>

        {showAddForm && (
          <div style={{ marginTop: 12, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: 12 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div>
                <div style={{ fontSize: 11, color: "#666", marginBottom: 3 }}>Roll number *</div>
                <input value={addRoll} onChange={e => setAddRoll(e.target.value)} placeholder="e.g. 23981A0305"
                  style={{ border: "1px solid #b0c4de", borderRadius: 6, padding: "7px 9px", fontSize: 13, fontFamily: "inherit", width: 150 }} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: "#666", marginBottom: 3 }}>Name (optional)</div>
                <input value={addName} onChange={e => setAddName(e.target.value)} placeholder="Student name"
                  style={{ border: "1px solid #b0c4de", borderRadius: 6, padding: "7px 9px", fontSize: 13, fontFamily: "inherit", width: 180 }} />
              </div>
              <button onClick={handleAddStudent} disabled={addBusy || !addRoll.trim()}
                style={{ fontSize: 13, background: "#166534", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontWeight: 600, opacity: (addBusy || !addRoll.trim()) ? 0.6 : 1 }}>
                {addBusy ? "Adding…" : "Add"}
              </button>
            </div>
            <div style={{ fontSize: 11, color: "#666", marginTop: 6 }}>Remaining details (marks, parent info, etc.) can be filled by clicking on the student and using Edit, or via Excel upload.</div>
          </div>
        )}
        {uploadStatus && (
          <div style={{ marginTop: 10, fontSize: 13, color: uploadStatus.type === "ok" ? "#166534" : "#b91c1c" }}>
            {uploadStatus.msg}
          </div>
        )}
      </div>

      {/* Mentee list */}
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>
        My mentees <span style={{ fontWeight: 400, color: "#888", fontSize: 13 }}>
          {loading ? "" : `(${mentees.length})`}
        </span>
      </div>

      {loading && <div style={{ color: "#888", fontSize: 13 }}>Loading…</div>}

      {!loading && mentees.length === 0 && (
        <div style={{ textAlign: "center", padding: "2rem", color: "#888", background: "#fff", borderRadius: 10, border: "1px solid #e0e0e0" }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
          <div style={{ fontSize: 13 }}>No mentees yet. Upload your filled Excel sheet above to get started.</div>
        </div>
      )}

      {!loading && mentees.length > 0 && (
        <div style={{ background: "#fff", border: "1px solid #e0e0e0", borderRadius: 10, overflow: "hidden" }}>
          {mentees.map((st, i) => (
            <div key={st.id} onClick={() => setSelectedRoll(st.id)}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: i < mentees.length - 1 ? "1px solid #f0f0f0" : "none", cursor: "pointer" }}>
              <div style={{ width: 38, height: 38, borderRadius: "50%", background: "#B5D4F4", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 600, color: "#0C447C", flexShrink: 0 }}>
                {(st.name || st.id)?.[0]?.toUpperCase() || "?"}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{st.name || "—"}</div>
                <div style={{ fontSize: 12, color: "#888" }}>{st.id}</div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); handleRemoveStudent(st.id, st.name); }}
                title="Remove from my mentee list"
                style={{ background: "none", border: "none", cursor: "pointer", color: "#d32f2f", fontSize: 15, padding: "4px 8px", borderRadius: 6 }}>
                🗑
              </button>
              <div style={{ color: "#1a56a0", fontSize: 18 }}>›</div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}

