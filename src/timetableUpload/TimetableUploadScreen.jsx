// src/timetableUpload/TimetableUploadScreen.jsx
// Coordinator Duties > Timetable Upload.
//   1. pick the year and download the Excel template (pre-filled with that year's subjects, short names and faculty)
//   2. upload the filled workbook: it is read, checked against everything already published, and the
//      overlaps, suggested changes and each faculty member's workload are shown here and in a downloadable report
//   3. (next update) publish, once there are no overlaps, to put the classes into each faculty member's timetable

import React, { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import { collection, onSnapshot, getDocs, updateDoc, doc } from "firebase/firestore";
import { db } from "../firebase";
import { P, Btn, Card, Sel, Spinner } from "../components/UI";
import { MASTER_ADMIN_PHONE } from "../utils";
import { buildTemplate } from "./templateBuilder";
import { parseWorkbook } from "./timetableParser";
import { groupBlocks, detectOverlaps, checkCombos, suggestionsFor, computeWorkload } from "./overlapCheck";
import { addReportSheets } from "./reportBuilder";
import { yearOfSection, DAY_NAMES, fmtRange } from "./timeUtils";
import { facultyListOf, shortOf } from "../sections/subjectUtils";

const YEARS = ["I", "II", "III", "IV"];
const MONO = "'IBM Plex Mono', monospace";
const th = { textAlign: "center", fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: P.gray, padding: "7px 8px", borderBottom: "1.5px solid " + P.border, whiteSpace: "nowrap" };
const td = { padding: "8px 8px", borderBottom: "1px solid " + P.border, textAlign: "center", fontFamily: MONO, fontSize: 13 };

function Pill({ color, bg, children }) {
  return <span style={{ display: "inline-block", fontSize: 12, fontWeight: 700, color, background: bg, padding: "4px 12px", borderRadius: 20 }}>{children}</span>;
}

function blockLabel(b) {
  return b.sectionName + " · " + DAY_NAMES[b.day].slice(0, 3) + " " + fmtRange(b.start, b.end) + " · " + b.token;
}

export default function TimetableUploadScreen({ user }) {
  const [sections, setSections] = useState(null);
  const [people, setPeople] = useState(null);
  const [published, setPublished] = useState([]);
  const [publishedErr, setPublishedErr] = useState(false);
  const [year, setYear] = useState("III");
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef(null);
  const seeAll = user.phone === MASTER_ADMIN_PHONE || user.role === "hod";

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "sections"), snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => !s.deleted);
      setSections(seeAll ? all : all.filter(s => s.adminPhone === user.phone));
    });
    return unsub;
  }, [user.phone, seeAll]);

  useEffect(() => {
    let alive = true;
    Promise.all([getDocs(collection(db, "users")), getDocs(collection(db, "facultyProfiles"))]).then(([us, ps]) => {
      if (!alive) return;
      const emp = {};
      ps.forEach(d => { emp[d.id] = (d.data().bio || {}).employeeId || ""; });
      const list = [];
      us.forEach(d => { const u = d.data(); if (u.status === "approved") list.push({ phone: d.id, name: u.name || d.id, employeeId: emp[d.id] || u.employeeId || "" }); });
      setPeople(list);
    });
    getDocs(collection(db, "masterTimetables")).then(snap => {
      if (!alive) return;
      setPublished(snap.docs.map(d => ({ year: d.id, ...d.data() })));
    }).catch(() => { if (alive) setPublishedErr(true); });
    return () => { alive = false; };
  }, []);

  if (!sections || !people) return <Spinner />;

  const yearSections = sections.filter(s => yearOfSection(s) === year);
  const noYear = sections.filter(s => !yearOfSection(s));
  const facultyByPhone = {};
  people.forEach(p => { facultyByPhone[p.phone] = p; });
  const hasSubjects = yearSections.some(s => (s.subjects || []).length > 0);

  function download() {
    const wb = buildTemplate({ year, sections: yearSections, facultyByPhone });
    XLSX.writeFile(wb, "Timetable Template - Year " + year + ".xlsx");
  }

  function analyse(wb) {
    const ctxSections = yearSections.map(s => ({
      id: s.id, name: s.name,
      subjects: (s.subjects || []).map(sub => ({ name: sub.name, short: shortOf(sub), type: sub.type || "Theory", faculty: facultyListOf(sub) })),
    }));
    const parse = parseWorkbook(wb, { year, sections: ctxSections, people });
    const blocks = groupBlocks(parse.entries, "upload");
    const publishedBlocks = published.filter(p => p.year !== year).flatMap(p =>
      (p.blocks || []).map(b => ({ ...b, source: "published", publishedBy: p.publishedByName || "", publishedYear: p.year })));
    const conflicts = detectOverlaps(blocks, publishedBlocks);
    const allBlocks = blocks.map(b => ({ ...b, source: "upload" })).concat(publishedBlocks);
    const slotsBy = {};
    parse.sections.forEach(s => { slotsBy[s.id] = s.slots; });
    const suggestions = conflicts.map(c => suggestionsFor(c, slotsBy, allBlocks));
    const comboProblems = checkCombos(blocks);
    const workload = computeWorkload(blocks);
    return { wb, parse, blocks, conflicts, suggestions, comboProblems, workload };
  }

  async function onFile(e) {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    setBusy(true); setError(""); setResult(null); setFileName(f.name);
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
      setResult(analyse(wb));
    } catch (err) {
      setError("This file could not be read as an Excel workbook (" + err.message + "). Use the downloaded template and save it as .xlsx.");
    }
    setBusy(false);
  }

  function downloadReport() {
    const rep = addReportSheets(result.wb, {
      blocks: result.blocks, conflicts: result.conflicts, suggestions: result.suggestions, workload: result.workload,
      publishedLabel: b => "already published (Year " + (b.publishedYear || "?") + (b.publishedBy ? ", by " + b.publishedBy : "") + ")",
    });
    XLSX.writeFile(rep, "Timetable report - Year " + year + ".xlsx");
  }

  const errors = result ? result.parse.problems.filter(p => p.level === "error") : [];
  const notes = result ? result.parse.problems.concat(result.comboProblems).filter(p => p.level !== "error") : [];
  const ready = result && errors.length === 0 && result.conflicts.length === 0;

  return (
    <div style={{ padding: "24px clamp(16px, 3vw, 32px) 80px", maxWidth: "min(1500px, 96vw)", margin: "0 auto", display: "grid", gap: 18 }}>
      <Card style={{ margin: 0, padding: "18px 20px" }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>1. Choose the year and download the template</div>
        <div style={{ fontSize: 13, color: P.gray, marginBottom: 14, lineHeight: 1.6 }}>
          The template has a sample, this year's subjects with short names, the faculty assigned to them, the instructions, and one blank timetable block for every section. Fill it in and upload it below.
        </div>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ width: 160 }}><Sel label="Year" value={year} onChange={v => { setYear(v || "III"); setResult(null); setFileName(""); }} options={YEARS.map(y => ({ value: y, label: "Year " + y }))} /></div>
          <div style={{ marginBottom: 12 }}><Btn onClick={download} disabled={yearSections.length === 0 || !hasSubjects}>Download template (Year {year})</Btn></div>
        </div>
        {yearSections.length === 0 ? (
          <div style={{ fontSize: 13, color: P.amber, background: P.amberL, borderRadius: 8, padding: "8px 12px" }}>
            No sections found for Year {year}. Add them under Coordinator Duties › All Sections › Sections & Subjects (section names start with the year, like III-A).
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 12.5, color: P.gray }}>Sections in Year {year}:</span>
            {yearSections.map(s => (
              <span key={s.id} style={{ fontFamily: MONO, fontWeight: 700, fontSize: 12.5, background: P.bg, border: "1px solid " + P.border, borderRadius: 20, padding: "4px 12px" }}>
                {s.name} <span style={{ fontWeight: 400, color: P.gray }}>· {(s.subjects || []).length} subjects</span>
              </span>
            ))}
          </div>
        )}
        {yearSections.length > 0 && !hasSubjects && (
          <div style={{ fontSize: 13, color: P.amber, background: P.amberL, borderRadius: 8, padding: "8px 12px", marginTop: 10 }}>
            These sections have no subjects yet. Add subjects and faculty first (Sections & Subjects), then download the template.
          </div>
        )}
      </Card>

      {noYear.length > 0 && (
        <Card style={{ margin: 0, padding: "16px 20px" }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Sections whose name doesn't show a year</div>
          <div style={{ fontSize: 13, color: P.gray, marginBottom: 12 }}>Tell the portal which year each one belongs to so it appears in the right template.</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "6px 18px" }}>
            {noYear.map(s => (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ flex: 1, fontWeight: 600, fontSize: 13.5 }}>{s.name}</span>
                <select aria-label={"Year of " + s.name} defaultValue="" onChange={e => e.target.value && updateDoc(doc(db, "sections", s.id), { year: e.target.value })}
                  style={{ border: "1px solid " + P.border, borderRadius: 8, padding: "7px 10px", fontSize: 13.5, fontFamily: "inherit", background: "#fff" }}>
                  <option value="">Year…</option>
                  {YEARS.map(y => <option key={y} value={y}>Year {y}</option>)}
                </select>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card style={{ margin: 0, padding: "18px 20px" }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>2. Upload the filled workbook</div>
        <div style={{ fontSize: 13, color: P.gray, marginBottom: 14, lineHeight: 1.6 }}>
          The sheet is read straight away. Nothing is saved or sent to any faculty member at this stage, and the check includes every timetable already published for the other years.
          Once it has been checked, a <b>Download report (Excel)</b> button appears below with every faculty member's individual timetable, the overlaps with suggested changes, and the workload summary.
        </div>
        <input ref={fileRef} type="file" accept=".xlsx,.xlsm,.xls" onChange={onFile} style={{ display: "none" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <Btn onClick={() => fileRef.current && fileRef.current.click()} disabled={busy || yearSections.length === 0}>{busy ? "Reading…" : "Choose Excel file"}</Btn>
          {fileName && <span style={{ fontSize: 13, color: P.gray }}>{fileName}</span>}
        </div>
        {publishedErr && <div style={{ fontSize: 12.5, color: P.amber, marginTop: 10 }}>Published timetables of other years could not be loaded, so overlaps with them can't be checked yet.</div>}
        {error && <div style={{ fontSize: 13, color: P.red, background: P.redL, borderRadius: 8, padding: "8px 12px", marginTop: 10 }}>{error}</div>}
      </Card>

      {result && (
        <>
          <Card style={{ margin: 0, padding: "16px 20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>What was read</div>
                <div style={{ fontSize: 13.5, color: P.gray }}>
                  <b style={{ color: "#1a2230" }}>{result.parse.sections.length}</b> section{result.parse.sections.length === 1 ? "" : "s"} ·{" "}
                  <b style={{ color: "#1a2230" }}>{result.blocks.length}</b> classes ·{" "}
                  <b style={{ color: "#1a2230" }}>{result.workload.length}</b> faculty with workload
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                {errors.length > 0 && <Pill color={P.red} bg={P.redL}>{errors.length} problem{errors.length === 1 ? "" : "s"} to fix</Pill>}
                {result.conflicts.length > 0 && <Pill color={P.red} bg={P.redL}>{result.conflicts.length} overlap{result.conflicts.length === 1 ? "" : "s"} to clear</Pill>}
                {ready && <Pill color={P.green} bg={P.greenL}>No overlaps — ready to publish</Pill>}
                <Btn small onClick={downloadReport}>Download report (Excel)</Btn>
                <Btn small disabled>Publish (coming in the next update)</Btn>
              </div>
            </div>
          </Card>

          {errors.length > 0 && (
            <Card style={{ margin: 0, padding: "16px 20px", borderColor: P.red }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: P.red, marginBottom: 8 }}>Problems that must be fixed</div>
              {errors.map((p, i) => <div key={i} style={{ fontSize: 13.5, padding: "4px 0" }}>• {p.text}</div>)}
            </Card>
          )}

          <Card style={{ margin: 0, padding: "16px 20px" }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Overlaps</div>
            <div style={{ fontSize: 12.5, color: P.gray, marginBottom: 12 }}>A faculty member has two classes at overlapping times. Each one lists changes that clear it without creating a new clash. Fix them in the sheet and upload again.</div>
            {result.conflicts.length === 0 ? (
              <div style={{ fontSize: 13.5, color: P.green }}>No overlaps found.</div>
            ) : result.conflicts.map((c, i) => (
              <div key={i} style={{ border: "1px solid " + P.border, borderRadius: 10, padding: "12px 14px", marginBottom: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{c.name} · {DAY_NAMES[c.day]}</div>
                <div style={{ fontSize: 13, color: "#1a2230", marginBottom: 2 }}>A: {blockLabel(c.a)}</div>
                <div style={{ fontSize: 13, color: "#1a2230", marginBottom: 8 }}>
                  B: {blockLabel(c.b)}
                  {c.b.source === "published" && <span style={{ color: P.amber }}> (already published for Year {c.b.publishedYear || "?"}{c.b.publishedBy ? " by " + c.b.publishedBy : ""})</span>}
                </div>
                {result.suggestions[i].map((s, k) => (
                  <div key={k} style={{ background: P.bg, borderRadius: 8, padding: "8px 12px", marginBottom: 6 }}>
                    {result.suggestions[i].length > 1 && <div style={{ fontSize: 11.5, fontWeight: 700, color: P.gray, marginBottom: 3, textTransform: "uppercase" }}>If you change {s.block.sectionName} · {s.block.token}</div>}
                    {s.options.map((o, j) => <div key={j} style={{ fontSize: 13, padding: "2px 0" }}>• {o.text}</div>)}
                  </div>
                ))}
              </div>
            ))}
          </Card>

          {notes.length > 0 && (
            <Card style={{ margin: 0, padding: "16px 20px" }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>Notes</div>
              {notes.map((p, i) => (
                <div key={i} style={{ fontSize: 13, padding: "3px 0", color: p.level === "warn" ? P.amber : P.gray }}>
                  {p.level === "warn" ? "⚠ " : "• "}{p.text}
                </div>
              ))}
            </Card>
          )}

          <Card style={{ margin: 0, padding: "16px 20px" }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Workload from this timetable</div>
            <div style={{ fontSize: 12.5, color: P.gray, marginBottom: 10 }}>Only faculty named in the sheet's faculty tables get workload. Assisting faculty are counted too (shown under "of which assisting").</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 900 }}>
                <thead>
                  <tr>
                    <th style={{ ...th, textAlign: "left" }}>Faculty</th>
                    <th style={th}>Teaching</th><th style={th}>Other duties</th><th style={{ ...th, color: P.blue }}>Overall</th><th style={th}>Of which assisting</th>
                    <th style={th}>Theory</th><th style={th}>Lab</th><th style={th}>Drawing</th>
                    {DAY_NAMES.map(d => <th key={d} style={th}>{d.slice(0, 3)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {result.workload.map(w => (
                    <tr key={w.key}>
                      <td style={{ ...td, textAlign: "left", fontFamily: "inherit", fontWeight: 600 }}>{w.name}{w.external && <span style={{ fontWeight: 400, color: P.gray, fontSize: 12 }}> (outside portal)</span>}</td>
                      <td style={td}>{w.teaching}</td><td style={td}>{w.other}</td><td style={{ ...td, fontWeight: 700, color: P.blue }}>{w.overall}</td><td style={td}>{w.asst}</td>
                      <td style={td}>{w.theory}</td><td style={td}>{w.lab}</td><td style={td}>{w.drawing}</td>
                      {w.perDay.map((n, i) => <td key={i} style={td}>{n}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {result.workload.length === 0 && <div style={{ fontSize: 13, color: P.gray, padding: "10px 4px" }}>No faculty were found in the timetable.</div>}
          </Card>
        </>
      )}
    </div>
  );
}
