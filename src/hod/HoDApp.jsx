// src/hod/HoDApp.jsx
// Wrapper shown when user.role === "hod".
// The HoD is also a teaching faculty, so this gives them three tabs:
//   📋 Attendance     — same as FacultyApp (their assigned subjects)
//   📝 Internal Marks — same as faculty marks entry (their assigned subjects)
//   🔍 Student Info   — the HoD student lookup (search any roll number)

import { useState } from "react";
import FacultyApp from "../FacultyApp";
import HoDStudentLookup from "./HoDStudentLookup";

export default function HoDApp({ user, onLogout }) {
  const [tab, setTab] = useState("studentInfo"); // studentInfo | faculty

  if (tab === "faculty") {
    // FacultyApp already contains Attendance + Internal Marks + Mentor tabs internally.
    // We add a floating "Student Info" switch button on top of it.
    return (
      <div style={{ position: "relative" }}>
        <FacultyApp user={user} onLogout={onLogout} />
        <button
          onClick={() => setTab("studentInfo")}
          style={{
            position: "fixed", bottom: 20, right: 20, zIndex: 1000,
            background: "#1a56a0", color: "#fff", border: "none", borderRadius: 30,
            padding: "12px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer",
            boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
          }}>
          🔍 Student Info
        </button>
      </div>
    );
  }

  // Student Info view (default) with a switch to faculty duties
  return (
    <div style={{ position: "relative" }}>
      <HoDStudentLookup user={user} onLogout={onLogout} />
      <button
        onClick={() => setTab("faculty")}
        style={{
          position: "fixed", bottom: 20, right: 20, zIndex: 1000,
          background: "#166534", color: "#fff", border: "none", borderRadius: 30,
          padding: "12px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer",
          boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
        }}>
        📋 My Teaching (Attendance & Marks)
      </button>
    </div>
  );
}
