// HoDStudentLookup.jsx
// Search-only screen (data entry lives in each section's "Student Data" tab in AdminApp.js).
// Lives in src/hod/HoDStudentLookup.jsx, alongside studentDataUpload.js and hodAttendance.js.

import { useState, useEffect, useRef } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { getAttendanceSummary } from "./hodAttendance";

const SEM_LABELS = { 1: "I-I", 2: "I-II", 3: "II-I", 4: "II-II", 5: "III-I", 6: "III-II", 7: "IV-I", 8: "IV-II" };
// Fixed credits per semester, used for credit-weighted CGPA.
const SEM_CREDITS = { 1: 19, 2: 21, 3: 20, 4: 21, 5: 22, 6: 22, 7: 23, 8: 12 };

function gradeColor(pct) {
  if (pct == null) return "#5F5E5A";
  if (pct < 65) return "#A32D2D";
  if (pct < 75) return "#854F0B";
  return "#0F6E56";
}

function monthLabel(ym) {
  const [y, m] = ym.split("-");
  const names = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return names[Number(m) - 1] + " " + y.slice(2);
}

function StatCard({ bg, labelColor, valueColor, label, value }) {
  return (
    <div style={{ background: bg, borderRadius: 8, padding: "0.85rem" }}>
      <div style={{ fontSize: 12, color: labelColor, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 600, color: valueColor }}>{value}</div>
    </div>
  );
}

function TrendChart({ canvasId, labels, data, color, bgColor, min, max, ariaLabel }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!window.Chart) {
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js";
      script.onload = () => draw();
      document.body.appendChild(script);
    } else {
      draw();
    }
    return () => { if (chartRef.current) chartRef.current.destroy(); };

    function draw() {
      if (!canvasRef.current || !window.Chart) return;
      if (chartRef.current) chartRef.current.destroy();
      chartRef.current = new window.Chart(canvasRef.current, {
        type: "line",
        data: { labels, datasets: [{ data, borderColor: color, backgroundColor: bgColor, fill: true, tension: 0.3, pointRadius: 3 }] },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { min, max, grid: { color: "#cfd9e6" }, ticks: { color: "#6b7b8c", font: { size: 10 } } },
            x: { grid: { display: false }, ticks: { color: "#6b7b8c", font: { size: 10 } } },
          },
        },
      });
    }
  }, [labels, data, color, bgColor, min, max]);

  return (
    <div style={{ position: "relative", height: 120 }}>
      <canvas ref={canvasRef} id={canvasId} role="img" aria-label={ariaLabel} />
    </div>
  );
}

export default function HoDStudentLookup({ user, onLogout }) {
  const [roll, setRoll] = useState("");
  const [student, setStudent] = useState(null);
  const [attendance, setAttendance] = useState({ overallPct: null, monthly: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSearch(e) {
    e.preventDefault();
    if (!roll.trim()) return;
    const rollNumber = roll.trim();
    setLoading(true);
    setError("");
    setStudent(null);
    setAttendance({ overallPct: null, monthly: [] });
    try {
      const snap = await getDoc(doc(db, "students", rollNumber));
      const profile = snap.exists() ? snap.data() : null;
      const att = await getAttendanceSummary(rollNumber);

      if (!profile && att.overallPct == null) {
        setError(`No record found for roll number "${rollNumber}" — not in any section roster and no academic data uploaded.`);
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

  const semesters = student?.semesters
    ? Object.entries(student.semesters).sort((a, b) => Number(a[0]) - Number(b[0]))
    : [];
  const totalCredits = semesters.reduce((sum, [num]) => sum + (SEM_CREDITS[num] || 0), 0);
  const weightedSum = semesters.reduce((sum, [num, s]) => sum + s.sgpa * (SEM_CREDITS[num] || 0), 0);
  const cgpa = totalCredits > 0 ? weightedSum / totalCredits : null;
  const allBacklogs = semesters.flatMap(([, s]) => s.backlogs || []);
  const hasAcademicProfile = student && (student.name || semesters.length || student.feeBalance != null);

  return (
    <div>
      <div style={{ background: "#1a56a0", color: "#fff", padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>HoD Dashboard</div>
          <div style={{ fontSize: 13, opacity: 0.85 }}>Welcome, {user?.name || "HoD"}</div>
        </div>
        <button onClick={onLogout} style={{ background: "rgba(255,255,255,0.15)", color: "#fff", border: "none", borderRadius: 6, padding: "8px 16px", cursor: "pointer", fontWeight: 600 }}>
          Logout
        </button>
      </div>

      <div style={{ maxWidth: 700, margin: "0 auto", padding: 16, fontFamily: "inherit" }}>
        <h2 style={{ marginBottom: 12 }}>Student Lookup</h2>
        <form onSubmit={handleSearch} style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <input
            value={roll}
            onChange={(e) => setRoll(e.target.value)}
            placeholder="Enter roll number"
            style={{ flex: 1, padding: 10, fontSize: 16, border: "1px solid #ccc", borderRadius: 6 }}
          />
          <button type="submit" disabled={loading} style={{ padding: "10px 18px", borderRadius: 6 }}>
            {loading ? "Searching..." : "Search"}
          </button>
        </form>

        {error && <p style={{ color: "#d32f2f" }}>{error}</p>}

        {student && (
          <div style={{ border: "1px solid #e0e0e0", borderRadius: 12, padding: 18, background: "#F1EFE8" }}>

            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14, background: "#E6F1FB", borderRadius: 8, padding: "0.9rem 1rem" }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#B5D4F4", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 600, color: "#0C447C" }} title="Photo not uploaded yet">
                {student.name?.[0] || "?"}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 17, color: "#042C53" }}>{student.name || "—"}</div>
                <div style={{ color: "#185FA5", fontSize: 13 }}>
                  {student.id} {student.category ? `· ${student.category}` : ""}
                </div>
              </div>
            </div>

            {!hasAcademicProfile && (
              <div style={{ background: "#FAEEDA", color: "#854F0B", borderRadius: 8, padding: "8px 12px", marginBottom: 14, fontSize: 13 }}>
                No academic profile uploaded yet for this roll number — showing attendance only.
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 10, marginBottom: 12 }}>
              <StatCard bg="#E1F5EE" labelColor="#0F6E56" valueColor={gradeColor(attendance.overallPct)} label="Attendance"
                value={attendance.overallPct != null ? `${attendance.overallPct.toFixed(1)}%` : "—"} />
              <StatCard bg="#EEEDFE" labelColor="#534AB7" valueColor="#26215C" label="CGPA"
                value={cgpa != null ? cgpa.toFixed(2) : "—"} />
              <StatCard bg="#FBEAF0" labelColor="#993556" valueColor="#4B1528" label="Backlogs"
                value={allBacklogs.length || (semesters.length ? 0 : "—")} />
              <StatCard bg="#FAEEDA" labelColor="#854F0B" valueColor="#412402" label="Fee balance"
                value={student.feeBalance != null ? `₹${student.feeBalance.toLocaleString("en-IN")}` : "—"} />
            </div>

            <div style={{ background: "#fff", border: "1px solid #e0ded6", borderRadius: 8, padding: "0.9rem 1rem", marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "#2C2C2A" }}>Personal &amp; family details</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 13, color: "#444441" }}>
                <div><span style={{ color: "#5F5E5A" }}>Hostel:</span> {student.hostelType || "—"}</div>
                <div><span style={{ color: "#5F5E5A" }}>Student mobile:</span> {student.studentMobile || "—"}</div>
                <div><span style={{ color: "#5F5E5A" }}>Parent:</span> {student.parentName || "—"} {student.parentOccupation ? `(${student.parentOccupation})` : ""}</div>
                <div><span style={{ color: "#5F5E5A" }}>Parent mobile:</span> {student.parentMobile || "—"}</div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div style={{ background: "#E1F5EE", borderRadius: 8, padding: "0.85rem" }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: "#04342C" }}>Attendance trend (by month)</div>
                {attendance.monthly.length > 0 ? (
                  <TrendChart
                    canvasId="attChart"
                    labels={attendance.monthly.map((m) => monthLabel(m.month))}
                    data={attendance.monthly.map((m) => m.pct)}
                    color="#0F6E56"
                    bgColor="rgba(15,110,86,0.12)"
                    min={0} max={100}
                    ariaLabel="Monthly attendance trend"
                  />
                ) : (
                  <div style={{ fontSize: 13, color: "#5F5E5A", padding: "20px 0", textAlign: "center" }}>No attendance data yet</div>
                )}
              </div>
              <div style={{ background: "#E6F1FB", borderRadius: 8, padding: "0.85rem" }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: "#042C53" }}>SGPA trend</div>
                {semesters.length > 0 ? (
                  <TrendChart
                    canvasId="sgpaChart"
                    labels={semesters.map(([num]) => SEM_LABELS[num] || num)}
                    data={semesters.map(([, s]) => s.sgpa)}
                    color="#185FA5"
                    bgColor="rgba(24,95,165,0.12)"
                    min={0} max={10}
                    ariaLabel="SGPA trend across semesters"
                  />
                ) : (
                  <div style={{ fontSize: 13, color: "#5F5E5A", padding: "20px 0", textAlign: "center" }}>No SGPA data yet</div>
                )}
              </div>
            </div>

            <div style={{ background: "#fff", border: "1px solid #e0ded6", borderRadius: 8, padding: "0.9rem 1rem" }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Semester-wise performance</div>
              {semesters.length > 0 ? (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #e0ded6" }}>
                      <td style={td_h}>Sem</td><td style={td_h}>SGPA</td><td style={td_h}>Backlogs</td>
                    </tr>
                  </thead>
                  <tbody>
                    {semesters.map(([sem, s]) => (
                      <tr key={sem} style={{ borderBottom: "1px solid #f0eee6" }}>
                        <td style={td}>{SEM_LABELS[sem] || sem}</td>
                        <td style={td}>{s.sgpa}</td>
                        <td style={td}>
                          {s.backlogs?.length
                            ? s.backlogs.map((b) => (
                                <span key={b} style={{ background: "#FBEAF0", color: "#993556", padding: "2px 8px", borderRadius: 6, fontSize: 12, marginRight: 4 }}>{b}</span>
                              ))
                            : <span style={{ color: "#999" }}>—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ fontSize: 13, color: "#5F5E5A", textAlign: "center", padding: "10px 0" }}>No semester data uploaded yet</div>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  );
}

const td_h = { textAlign: "left", padding: "6px 4px", fontSize: 12, color: "#888" };
const td = { padding: "6px 4px" };
