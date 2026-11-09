// src/timetableUpload/TimetableEntry.jsx
// Coordinator Duties > Timetable: the admin first chooses whether to upload a timetable they already have
// or have the portal design one from a few questions.

import React, { useState } from "react";
import { P, Btn } from "../components/UI";
import TimetableUploadScreen from "./TimetableUploadScreen";
import DesignScreen from "../timetableDesign/DesignScreen";

function Choice({ title, text, action, onClick, accent }) {
  return (
    <button onClick={onClick} style={{ textAlign: "left", background: "#fff", border: "1.5px solid " + P.border, borderRadius: 16, padding: "26px 26px 24px", cursor: "pointer", fontFamily: "inherit", display: "flex", flexDirection: "column", gap: 10 }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = accent; e.currentTarget.style.boxShadow = "0 8px 22px rgba(22,50,79,0.1)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = P.border; e.currentTarget.style.boxShadow = "none"; }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: "#1a2230" }}>{title}</div>
      <div style={{ fontSize: 14, color: P.gray, lineHeight: 1.65 }}>{text}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: accent, marginTop: 6 }}>{action} →</div>
    </button>
  );
}

export default function TimetableEntry({ user }) {
  const [mode, setMode] = useState(null);
  if (mode === "design") return <DesignScreen user={user} onBack={() => setMode(null)} />;
  if (mode === "upload") {
    return (
      <div>
        <div style={{ padding: "16px clamp(16px, 3vw, 32px) 0", maxWidth: "min(1500px, 96vw)", margin: "0 auto" }}>
          <Btn small variant="ghost" onClick={() => setMode(null)}>← Upload or design</Btn>
        </div>
        <TimetableUploadScreen user={user} />
      </div>
    );
  }
  return (
    <div style={{ padding: "32px clamp(16px, 3vw, 32px) 80px", maxWidth: "min(1100px, 96vw)", margin: "0 auto" }}>
      <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>How would you like to make the timetable?</div>
      <div style={{ fontSize: 14, color: P.gray, marginBottom: 24 }}>Either way it is checked for overlaps before it is published.</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 18 }}>
        <Choice accent={P.blue} title="Upload a timetable" text="You already have the timetable in Excel. The portal reads it in any layout, finds overlaps, suggests fixes and shows every faculty member's workload." action="Upload an Excel file" onClick={() => setMode("upload")} />
        <Choice accent={P.teal} title="Design a timetable" text="Answer a few questions about periods, breaks, subjects and faculty limits. The portal designs up to three clash-free versions for you to choose from, in one Excel file." action="Start the questions" onClick={() => setMode("design")} />
      </div>
    </div>
  );
}
