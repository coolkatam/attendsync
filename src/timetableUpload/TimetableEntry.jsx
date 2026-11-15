// src/timetableUpload/TimetableEntry.jsx
// Coordinator Duties > Timetable: the admin first chooses whether to upload a timetable they already have
// or have the portal design one from a few questions. Timetables already published are listed below, each with an
// Edit button that opens the on-screen editor (every edit is checked for overlaps).

import React, { useState, useEffect } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { P, Btn } from "../components/UI";
import TimetableUploadScreen from "./TimetableUploadScreen";
import DesignScreen from "../timetableDesign/DesignScreen";
import PublishedEditor from "./PublishedEditor";
import { removeSections } from "./publishMaster";

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
  const [mode, setMode] = useState(null);       // null | "upload" | "design" | "edit"
  const [editYear, setEditYear] = useState("");
  const [published, setPublished] = useState([]);
  const [ask, setAsk] = useState(null);      // { year, ids, label } waiting for "Yes, remove"
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState({ ok: true, text: "" });

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "masterTimetables"), snap => {
      setPublished(snap.docs.map(d => ({ year: d.id, ...d.data() })).sort((a, b) => a.year.localeCompare(b.year)));
    }, () => {});
    return unsub;
  }, []);

  async function doRemove() {
    const doc = published.find(p => p.year === ask.year);
    setBusy(true);
    try {
      await removeSections({ year: ask.year, existing: doc, sectionIds: ask.ids, user });
      setNote({ ok: true, text: ask.label + " removed. Faculty no longer see those classes, and other timetables are no longer checked against them." });
      setAsk(null);
    } catch (err) { setNote({ ok: false, text: "Could not remove it (" + err.message + "). Nothing was changed." }); }
    setBusy(false);
  }

  if (mode === "design") return <DesignScreen user={user} onBack={() => setMode(null)} />;
  if (mode === "edit") return <PublishedEditor year={editYear} user={user} onBack={() => setMode(null)} />;
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
        <Choice accent={P.blue} title="Upload a timetable" text="You already have the timetable in Excel. The portal reads it in any layout, finds overlaps, suggests fixes (or makes them for you) and shows every faculty member's workload." action="Upload an Excel file" onClick={() => setMode("upload")} />
        <Choice accent={P.teal} title="Design a timetable" text="Answer a few questions about periods, breaks, subjects and faculty limits. The portal designs up to three clash-free versions for you to choose from, in one Excel file." action="Start the questions" onClick={() => setMode("design")} />
      </div>

      {published.length > 0 && (
        <div style={{ marginTop: 34 }}>
          <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 4 }}>Published timetables</div>
          <div style={{ fontSize: 13.5, color: P.gray, marginBottom: 12 }}>Need a change after publishing? Edit it here, on screen. Each change is checked for overlaps before it is accepted.</div>
          {note.text && <div style={{ fontSize: 13.5, color: note.ok ? P.green : P.red, background: note.ok ? P.greenL : P.redL, borderRadius: 10, padding: "10px 14px", marginBottom: 10, fontWeight: 600 }}>{note.text}</div>}
          {published.map(p => (
            <div key={p.year} style={{ background: "#fff", border: "1px solid " + P.border, borderRadius: 12, padding: "12px 16px", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 800, fontSize: 15, minWidth: 70 }}>Year {p.year}</span>
                <span style={{ flex: 1, minWidth: 220, fontSize: 13, color: P.gray }}>
                  {(p.blocks || []).length} classes · published by {p.publishedByName || "—"}{p.publishedAt ? " on " + new Date(p.publishedAt).toLocaleDateString() : ""}
                  {p.lastEditedAt ? " · edited by " + (p.lastEditedByName || "—") + " on " + new Date(p.lastEditedAt).toLocaleDateString() : ""}
                </span>
                <Btn small onClick={() => { setEditYear(p.year); setMode("edit"); }}>Edit on screen</Btn>
                <Btn small variant="outline" onClick={() => { setNote({ ok: true, text: "" }); setAsk({ year: p.year, ids: (p.sections || []).map(x => x.id), label: "The whole Year " + p.year + " timetable" }); }}>Remove the whole year</Btn>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                {(p.sections || []).map(x => (
                  <span key={x.id} style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 600, background: P.bg, border: "1px solid " + P.border, borderRadius: 20, padding: "4px 6px 4px 12px" }}>
                    {x.name}
                    <button onClick={() => { setNote({ ok: true, text: "" }); setAsk({ year: p.year, ids: [x.id], label: x.name }); }} title={"Remove " + x.name + "'s timetable"} aria-label={"Remove " + x.name + "'s timetable"} style={{ border: "none", background: "#e6e9ed", color: P.gray, borderRadius: "50%", width: 20, height: 20, cursor: "pointer", fontSize: 12, lineHeight: 1 }}>×</button>
                  </span>
                ))}
              </div>
              {ask && ask.year === p.year && (
                <div style={{ marginTop: 12, background: P.redL, border: "1px solid " + P.red, borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: P.red, marginBottom: 4 }}>Remove {ask.label}?</div>
                  <div style={{ fontSize: 13, marginBottom: 10, lineHeight: 1.55 }}>
                    Faculty will no longer see these classes in My Timetable, and the Faculty Workload figures drop with them. You can design or upload the timetable again afterwards. Attendance and marks are not affected.
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <Btn small variant="danger" onClick={doRemove} disabled={busy}>{busy ? "Removing…" : "Yes, remove"}</Btn>
                    <Btn small variant="outline" onClick={() => setAsk(null)} disabled={busy}>Keep it</Btn>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
