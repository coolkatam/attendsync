// src/hod/HoDStudentLookup.jsx

import { useState, useEffect, useRef } from "react";
import { doc, getDoc, arrayUnion, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { getAttendanceSummary } from "./hodAttendance";

const SEM_LABELS = {
  1: "I-I", 2: "I-II", 3: "II-I", 4: "II-II",
  5: "III-I", 6: "III-II", 7: "IV-I", 8: "IV-II"
};

// Fixed credits per semester for credit-weighted CGPA
const SEM_CREDITS = { 1: 19, 2: 21, 3: 20, 4: 21, 5: 22, 6: 22, 7: 23, 8: 12 };

function gradeColor(pct) {
  if (pct == null) return "#5F5E5A";
  if (pct < 65) return "#A32D2D";
  if (pct < 75) return "#854F0B";
  return "#0F6E56";
}

function TrendChart({ canvasId, labels, data, color, bgColor, min, max, ariaLabel }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    function draw() {
      if (!canvasRef.current || !window.Chart) return;
      if (chartRef.current) chartRef.current.destroy();
      chartRef.current = new window.Chart(canvasRef.current, {
        type: "line",
        data: {
          labels,
          datasets: [{
            data,
            borderColor: color,
            backgroundColor: bgColor,
            fill: true,
            tension: 0.3,
            pointRadius: labels.length > 20 ? 1 : 3,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: {
              min, max,
              grid: { color: "#cfd9e6" },
              ticks: { color: "#6b7b8c", font: { size: 10 } }
            },
            x: {
              grid: { display: false },
              ticks: {
                color: "#6b7b8c",
                font: { size: 10 },
                maxTicksLimit: 10, // avoid crowding when there are many weeks
                maxRotation: 45,
              }
            },
          },
        },
      });
    }

    if (!window.Chart) {
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js";
      script.onload = draw;
      document.body.appendChild(script);
    } else {
      draw();
    }
    return () => { if (chartRef.current) chartRef.current.destroy(); };
  }, [labels, data, color, bgColor, min, max]);

  return (
    <div style={{ position: "relative", height: 220 }}>
      <canvas ref={canvasRef} id={canvasId} role="img" aria-label={ariaLabel} />
    </div>
  );
}

function StatCard({ bg, labelColor, valueColor, label, value }) {
  return (
    <div style={{ background: bg, borderRadius: 10, padding: "1.4rem 1.2rem" }}>
      <div style={{ fontSize: 14.5, fontWeight: 600, color: labelColor, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 700, color: valueColor || "#222" }}>{value}</div>
    </div>
  );
}

export default function HoDStudentLookup({ user, onBack }) {
  const [roll, setRoll] = useState("");
  const [student, setStudent] = useState(null);
  const [attendance, setAttendance] = useState({ overallPct: null, daily: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  async function handleSearch(e) {
    e.preventDefault();
    if (!roll.trim()) return;
    const rollNumber = roll.trim();
    setLoading(true);
    setError(""); setInfo(""); setStudent(null);
    setAttendance({ overallPct: null, daily: [] });
    try {
      const snap = await getDoc(doc(db, "students", rollNumber));
      const profile = snap.exists() ? snap.data() : null;
      const att = await getAttendanceSummary(rollNumber);
      if (!profile && att.overallPct == null) {
        setError(`No record found for "${rollNumber}" — not in any section roster and no academic data uploaded.`);
      } else {
        setStudent({ id: rollNumber, ...(profile || {}) });
        setAttendance(att);
      }
    } catch (err) {
      setError("Lookup failed: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  // N = completedSemesters stored during upload (highest sem with any data)
  const N = student?.completedSemesters || 0;

  // Build array of sems 1..N, filling blanks with sgpa:0, backlogs:[]
  const semList = N > 0
    ? Array.from({ length: N }, (_, i) => {
        const num = i + 1;
        const s = student?.semesters?.[num];
        return { num, sgpa: s?.sgpa ?? 0, backlogs: s?.backlogs || [] };
      })
    : [];

  // Credit-weighted CGPA over sems 1..N
  const totalCredits = semList.reduce((sum, s) => sum + (SEM_CREDITS[s.num] || 0), 0);
  const weightedSum = semList.reduce((sum, s) => sum + s.sgpa * (SEM_CREDITS[s.num] || 0), 0);
  const cgpa = totalCredits > 0 ? weightedSum / totalCredits : null;

  const allBacklogs = semList.flatMap((s) => s.backlogs);
  const hasAcademicProfile = student && (student.name || N > 0 || student.feeBalance != null);

  return (
    <div>
      {/* Header */}
      <div style={{ background: "#1a56a0", color: "#fff", padding: "18px 28px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 20 }}>HoD Dashboard</div>
          <div style={{ fontSize: 14.5, opacity: 0.85 }}>Welcome, {user?.name || "HoD"}</div>
        </div>
        <button onClick={onBack} style={{ background: "rgba(255,255,255,0.15)", color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", cursor: "pointer", fontWeight: 600, fontSize: 15 }}>
          ← Back to Dashboard
        </button>
      </div>

      <div style={{ maxWidth: "min(1500px, 92vw)", margin: "0 auto", padding: "24px 20px", fontFamily: "inherit" }}>
        <h2 style={{ marginBottom: 18, fontSize: 26 }}>Student Lookup</h2>
        <form onSubmit={handleSearch} style={{ display: "flex", gap: 12, marginBottom: 26 }}>
          <input
            value={roll} onChange={(e) => setRoll(e.target.value)}
            placeholder="Enter roll number"
            style={{ flex: 1, padding: 16, fontSize: 19, border: "1px solid #ccc", borderRadius: 8 }}
          />
          <button type="submit" disabled={loading} style={{ padding: "14px 28px", borderRadius: 8, fontSize: 17, fontWeight: 600 }}>
            {loading ? "Searching..." : "Search"}
          </button>
        </form>

        {error && <p style={{ color: "#d32f2f", fontSize: 15.5 }}>{error}</p>}
        {info && <p style={{ color: "#166534", fontSize: 15.5 }}>{info}</p>}

        {student && (
          <div style={{ border: "1px solid #e0e0e0", borderRadius: 16, padding: 28, background: "#F1EFE8" }}>

            {/* Name / roll header */}
            <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 20, background: "#E6F1FB", borderRadius: 12, padding: "1.3rem 1.5rem" }}>
              <button onClick={() => { setStudent(null); setAttendance({ overallPct: null, daily: [] }); setRoll(""); }}
                style={{ background: "rgba(24,95,165,0.12)", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", color: "#185FA5", fontSize: 15, whiteSpace: "nowrap" }}>
                ← Back
              </button>
              <div style={{ width: 76, height: 76, borderRadius: "50%", background: "#B5D4F4", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 600, color: "#0C447C", flexShrink: 0 }}>
                {student.name?.[0] || "?"}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 24, color: "#042C53" }}>{student.name || "—"}</div>
                <div style={{ color: "#185FA5", fontSize: 16.5 }}>
                  {student.id}{student.category ? ` · ${student.category}` : ""}
                </div>
              </div>
            </div>

            {!hasAcademicProfile && (
              <div style={{ background: "#FAEEDA", color: "#854F0B", borderRadius: 10, padding: "12px 18px", marginBottom: 20, fontSize: 16 }}>
                No academic profile uploaded yet — showing attendance only.
              </div>
            )}

            {/* Stat cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 16, marginBottom: 20 }}>
              <StatCard bg="#E1F5EE" labelColor="#0F6E56" valueColor={gradeColor(attendance.overallPct)} label="Attendance"
                value={attendance.overallPct != null ? `${attendance.overallPct.toFixed(1)}%` : "—"} />
              <StatCard bg="#EEEDFE" labelColor="#534AB7" valueColor="#26215C" label="CGPA"
                value={cgpa != null ? cgpa.toFixed(2) : "—"} />
              <StatCard bg="#FBEAF0" labelColor="#993556" valueColor="#4B1528" label="Backlogs"
                value={N > 0 ? allBacklogs.length : "—"} />
              <StatCard bg="#FAEEDA" labelColor="#854F0B" valueColor="#412402" label="Fee balance"
                value={student.feeBalance != null ? `₹${student.feeBalance.toLocaleString("en-IN")}` : "—"} />
            </div>

            {/* Personal & family details */}
            <div style={{ background: "#fff", border: "1px solid #e0ded6", borderRadius: 12, padding: "1.3rem 1.5rem", marginBottom: 20 }}>
              <div style={{ fontSize: 16.5, fontWeight: 700, marginBottom: 14, color: "#2C2C2A" }}>Personal &amp; family details</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, fontSize: 16, color: "#444441" }}>
                <div><span style={{ color: "#5F5E5A" }}>Hostel:</span> {student.hostelType || "—"}</div>
                <div><span style={{ color: "#5F5E5A" }}>Student mobile:</span> {student.studentMobile || "—"}</div>
                <div><span style={{ color: "#5F5E5A" }}>Parent:</span> {student.parentName || "—"} {student.parentOccupation ? `(${student.parentOccupation})` : ""}</div>
                <div><span style={{ color: "#5F5E5A" }}>Parent mobile:</span> {student.parentMobile || "—"}</div>
              </div>
            </div>

            {/* Trend charts */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginBottom: 20 }}>
              <div style={{ background: "#E1F5EE", borderRadius: 12, padding: "1.3rem" }}>
                <div style={{ fontSize: 16.5, fontWeight: 700, marginBottom: 12, color: "#04342C" }}>
                  Attendance trend (cumulative, week-by-week)
                </div>
                {attendance.daily.length > 0 ? (
                  <TrendChart
                    canvasId="attChart"
                    labels={attendance.daily.map((d) => d.label)}
                    data={attendance.daily.map((d) => d.pct)}
                    color="#0F6E56"
                    bgColor="rgba(15,110,86,0.12)"
                    min={0} max={100}
                    ariaLabel="Cumulative week-wise attendance trend"
                  />
                ) : (
                  <div style={{ fontSize: 16, color: "#5F5E5A", padding: "20px 0", textAlign: "center" }}>No attendance data yet</div>
                )}
              </div>

              <div style={{ background: "#EEEDFE", borderRadius: 12, padding: "1.3rem" }}>
                <div style={{ fontSize: 16.5, fontWeight: 700, marginBottom: 12, color: "#26215C" }}>
                  Mentor comments
                </div>
                {(student.mentorComments && student.mentorComments.length > 0) ? (
                  <div style={{ maxHeight: 220, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
                    {[...(student.mentorComments || [])].reverse().map((c, i) => (
                      <div key={i} style={{ background: "#fff", borderRadius: 8, padding: "10px 14px", fontSize: 15 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontWeight: 600, color: "#534AB7" }}>{c.date}</span>
                          {c.mentorName && <span style={{ color: "#888", fontSize: 13.5 }}>{c.mentorName}</span>}
                        </div>
                        <div style={{ color: "#333", lineHeight: 1.4 }}>{c.comment}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 15, color: "#888", padding: "20px 0", textAlign: "center" }}>No mentor comments yet</div>
                )}
              </div>
            </div>

            {/* Semester table */}
            <div style={{ background: "#fff", border: "1px solid #e0ded6", borderRadius: 12, padding: "1.3rem 1.5rem" }}>
              <div style={{ fontSize: 16.5, fontWeight: 700, marginBottom: 14 }}>Semester-wise performance</div>
              {semList.length > 0 ? (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 16 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #e0ded6" }}>
                      <td style={th}>Sem</td>
                      <td style={th}>SGPA</td>
                      <td style={th}>Backlogs</td>
                    </tr>
                  </thead>
                  <tbody>
                    {semList.map((s) => (
                      <tr key={s.num} style={{ borderBottom: "1px solid #f0eee6" }}>
                        <td style={td}>{SEM_LABELS[s.num]}</td>
                        <td style={{ ...td, color: s.sgpa === 0 ? "#A32D2D" : "#222", fontWeight: s.sgpa === 0 ? 600 : 400 }}>
                          {s.sgpa === 0 ? "0 (Failed)" : s.sgpa}
                        </td>
                        <td style={td}>
                          {s.backlogs.length
                            ? s.backlogs.map((b, i) => (
                                <span key={i} style={{ background: "#FBEAF0", color: "#993556", padding: "4px 12px", borderRadius: 8, fontSize: 14.5, marginRight: 6, display: "inline-block", marginBottom: 4 }}>
                                  {b}
                                </span>
                              ))
                            : <span style={{ color: "#999" }}>—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ fontSize: 16, color: "#5F5E5A", textAlign: "center", padding: "14px 0" }}>No semester data uploaded yet</div>
              )}

              {N > 0 && (
                <div style={{ marginTop: 16, fontSize: 16 }}>
                  <strong>Active backlogs:</strong>{" "}
                  {allBacklogs.length
                    ? allBacklogs.map((b, i) => (
                        <span key={i} style={{ background: "#FBEAF0", color: "#993556", padding: "4px 12px", borderRadius: 8, fontSize: 14.5, marginRight: 6, display: "inline-block" }}>
                          {b}
                        </span>
                      ))
                    : <span style={{ color: "#166534" }}>None</span>}
                </div>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  );
}

const th = { textAlign: "left", padding: "10px 8px", fontSize: 14.5, fontWeight: 700, color: "#888" };
const td = { padding: "10px 8px" };
