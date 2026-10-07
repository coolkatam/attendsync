// src/timetableUpload/TimetableUploadScreen.jsx
// Coordinator Duties > Timetable Upload.
//   1. pick the year (it decides which sections the file is matched against)
//   2. upload any Excel timetable. There is no template: the sheet is read as it is, sections, subjects and faculty are
//      matched to what the portal already knows, and anything it is unsure about is settled on screen. The overlaps,
//      suggested changes and each faculty member's workload are shown here and in a downloadable report
//   3. publish, once there are no overlaps: the year's timetable is saved as the master timetable, every later
//      upload is checked against it, and it can be replaced or withdrawn from the "Published timetables" card

import React, { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import { collection, onSnapshot, getDocs, updateDoc, setDoc, deleteDoc, doc } from "firebase/firestore";
import { db } from "../firebase";
import { P, Btn, Card, Sel, Spinner } from "../components/UI";
import { MASTER_ADMIN_PHONE } from "../utils";
import { parseSmart } from "./smartParser";
import WeekCards from "../timetable/WeekCards";
import { DAYS } from "../timetable/timetableModel";
import { groupBlocks, detectOverlaps, checkCombos, suggestionsFor, computeWorkload } from "./overlapCheck";
import { addReportSheets, writeReport } from "./reportBuilder";
import { yearOfSection, DAY_NAMES, fmtRange } from "./timeUtils";
import { facultyListOf, shortOf } from "../sections/subjectUtils";

const YEARS = ["I", "II", "III", "IV"];
const MONO = "'IBM Plex Mono', monospace";
const th = { textAlign: "center", fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: P.gray, padding: "7px 8px", borderBottom: "1.5px solid " + P.border, whiteSpace: "nowrap" };
const td = { padding: "8px 8px", borderBottom: "1px solid " + P.border, textAlign: "center", fontFamily: MONO, fontSize: 13 };

function Pill({ color, bg, children }) {
  return <span style={{ display: "inline-block", fontSize: 12, fontWeight: 700, color, background: bg, padding: "4px 12px", borderRadius: 20 }}>{children}</span>;
}

const akey = t => String(t || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const NO_ANSWERS = { faculty: {}, subject: {}, section: {} };

// One section's classes as the day cards, each showing the faculty as read.
function sectionWeek(blocks, id) {
  const week = DAYS.map(() => []);
  blocks.filter(b => b.sectionId === id).forEach(b => week[b.day].push({
    id: b.id, locked: false, day: b.day, start: b.start, end: b.end, type: b.type === "note" ? "other" : b.type,
    subject: b.token + (b.combo ? " (" + b.combo + ")" : ""), section: b.faculty.map(f => f.name).join(" / "), year: "", room: "",
    periods: b.periods, asst: false, conflicts: [], excluded: false,
  }));
  week.forEach(l => l.sort((a, b) => a.start - b.start));
  return week;
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
  const [confirming, setConfirming] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [notice, setNotice] = useState("");
  const [withdrawYear, setWithdrawYear] = useState("");
  const [answers, setAnswers] = useState(NO_ANSWERS);
  const wbRef = useRef(null);
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
    const unsubPub = onSnapshot(collection(db, "masterTimetables"), snap => {
      if (!alive) return;
      setPublishedErr(false);
      setPublished(snap.docs.map(d => ({ year: d.id, ...d.data() })));
    }, () => { if (alive) setPublishedErr(true); });
    return () => { alive = false; unsubPub(); };
  }, []);

  if (!sections || !people) return <Spinner />;

  const yearSections = sections.filter(s => yearOfSection(s) === year);
  const noYear = sections.filter(s => !yearOfSection(s));
  const facultyByPhone = {};
  people.forEach(p => { facultyByPhone[p.phone] = p; });
  const hasSubjects = yearSections.some(s => (s.subjects || []).length > 0);

  function analyse(wb, res) {
    const ctxSections = yearSections.map(s => ({
      id: s.id, name: s.name,
      subjects: (s.subjects || []).map(sub => ({ name: sub.name, short: shortOf(sub), type: sub.type || "Theory", faculty: facultyListOf(sub) })),
    }));
    const parse = parseSmart(wb, { year, sections: ctxSections, people }, res);
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
      wbRef.current = wb;
      setAnswers(NO_ANSWERS);
      setResult(analyse(wb, NO_ANSWERS));
    } catch (err) {
      setError("This file could not be read as an Excel workbook (" + err.message + "). Use the downloaded template and save it as .xlsx.");
    }
    setBusy(false);
  }

  // The coordinator's answer to something the reader was unsure about; the sheet is read again with it.
  function answer(field, key, value) {
    const next = { ...answers, [field]: { ...answers[field], [key]: value } };
    setAnswers(next);
    if (wbRef.current) setResult(analyse(wbRef.current, next));
  }

  function downloadReport() {
    const rep = addReportSheets(result.wb, {
      blocks: result.blocks, conflicts: result.conflicts, suggestions: result.suggestions, workload: result.workload, sections: result.parse.sections,
      publishedLabel: b => "already published (Year " + (b.publishedYear || "?") + (b.publishedBy ? ", by " + b.publishedBy : "") + ")",
    });
    writeReport(rep, "Timetable report - Year " + year + ".xlsx");
  }

  async function publishNow() {
    setPublishing(true); setError(""); setNotice("");
    try {
      const keep = b => ({
        id: b.id, sectionId: b.sectionId, sectionName: b.sectionName, day: b.day, start: b.start, end: b.end,
        token: b.token, subject: b.subject, type: b.type, combo: b.combo || "", periods: b.periods,
        faculty: b.faculty.map(f => ({ key: f.key, name: f.name, phone: f.phone || null, external: !!f.external, role: f.role })),
      });
      const data = JSON.parse(JSON.stringify({
        year,
        blocks: result.blocks.map(keep),
        sections: result.parse.sections.map(sec => ({ id: sec.id, name: sec.name, slots: sec.slots.map(x => ({ start: x.start, end: x.end, brk: !!x.brk })) })),
        publishedBy: user.phone, publishedByName: user.name || user.phone, publishedAt: new Date().toISOString(),
        fileName: fileName || "",
      }));
      if (JSON.stringify(data).length > 900000) throw new Error("this timetable is too large to store in one piece");
      await setDoc(doc(db, "masterTimetables", year), data);
      setNotice("Year " + year + " timetable published: " + data.sections.length + " sections, " + data.blocks.length + " classes. Later uploads for other years are now checked against it.");
      setResult(null); setFileName(""); setConfirming(false);
    } catch (err) {
      setError("Could not publish (" + err.message + "). Nothing was changed.");
    }
    setPublishing(false);
  }

  async function withdraw(y) {
    setError(""); setNotice("");
    try {
      await deleteDoc(doc(db, "masterTimetables", y));
      setNotice("Year " + y + " timetable withdrawn. It is no longer used for overlap checks.");
    } catch (err) { setError("Could not withdraw it (" + err.message + ")."); }
    setWithdrawYear("");
  }

  const alreadyPublished = published.find(p => p.year === year);
  const errors = result ? result.parse.problems.filter(p => p.level === "error") : [];
  const notes = result ? result.parse.problems.concat(result.comboProblems).filter(p => p.level !== "error") : [];
  const pending = result ? result.parse.pending : [];
  const ready = result && errors.length === 0 && result.conflicts.length === 0 && pending.length === 0;

  return (
    <div style={{ padding: "24px clamp(16px, 3vw, 32px) 80px", maxWidth: "min(1500px, 96vw)", margin: "0 auto", display: "grid", gap: 18 }}>
      <Card style={{ margin: 0, padding: "18px 20px" }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>1. Choose the year</div>
        <div style={{ fontSize: 13, color: P.gray, marginBottom: 14, lineHeight: 1.6 }}>
          The portal already knows this year's sections, subjects and faculty. Your Excel is matched against them, so it can be in any layout.
        </div>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ width: 160 }}><Sel label="Year" value={year} onChange={v => { setYear(v || "III"); setResult(null); setFileName(""); wbRef.current = null; setAnswers(NO_ANSWERS); }} options={YEARS.map(y => ({ value: y, label: "Year " + y }))} /></div>
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
            These sections have no subjects yet. Add subjects and faculty first (Sections & Subjects) so the Excel can be matched to them.
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
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>2. Upload the timetable Excel</div>
        <div style={{ fontSize: 13, color: P.gray, marginBottom: 14, lineHeight: 1.6 }}>
          Any Excel timetable works: one block per section with the period timings across the top and the days down the side. Section names, subjects and faculty names are matched to the portal (titles like Dr or Mr, initials and small spelling differences are fine).
          If the sheet lists faculty beside the subjects, those names are used; otherwise the faculty assigned in the portal are used. Anything the portal isn't sure about is asked below. Nothing is saved or sent to any faculty member until you publish.
        </div>
        <input ref={fileRef} type="file" accept=".xlsx,.xlsm,.xls" onChange={onFile} style={{ display: "none" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <Btn onClick={() => fileRef.current && fileRef.current.click()} disabled={busy || yearSections.length === 0 || !hasSubjects}>{busy ? "Reading…" : "Choose Excel file"}</Btn>
          {fileName && <span style={{ fontSize: 13, color: P.gray }}>{fileName}</span>}
        </div>
        {publishedErr && <div style={{ fontSize: 12.5, color: P.amber, marginTop: 10 }}>Published timetables of other years could not be loaded, so overlaps with them can't be checked yet.</div>}
        {error && <div style={{ fontSize: 13, color: P.red, background: P.redL, borderRadius: 8, padding: "8px 12px", marginTop: 10 }}>{error}</div>}
      </Card>

      {notice && <div style={{ fontSize: 13.5, color: P.green, background: P.greenL, borderRadius: 10, padding: "12px 16px", fontWeight: 600 }}>{notice}</div>}

      {published.length > 0 && (
        <Card style={{ margin: 0, padding: "16px 20px" }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Published timetables</div>
          <div style={{ fontSize: 12.5, color: P.gray, marginBottom: 10 }}>Every new upload is checked against these. To change a published year, upload its corrected sheet and publish again, or withdraw it here.</div>
          {published.slice().sort((a, b) => a.year.localeCompare(b.year)).map(p => (
            <div key={p.year} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "9px 0", borderTop: "1px solid " + P.border }}>
              <span style={{ fontWeight: 700, fontSize: 14, minWidth: 70 }}>Year {p.year}</span>
              <span style={{ fontSize: 13, color: P.gray, flex: 1, minWidth: 240 }}>
                {(p.sections || []).map(x => x.name).join(", ")} · {(p.blocks || []).length} classes · by {p.publishedByName || "—"}{p.publishedAt ? " on " + new Date(p.publishedAt).toLocaleDateString() : ""}
              </span>
              {withdrawYear === p.year ? (
                <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ fontSize: 12.5, color: P.red }}>Withdraw Year {p.year}?</span>
                  <Btn small onClick={() => withdraw(p.year)}>Yes, withdraw</Btn>
                  <Btn small onClick={() => setWithdrawYear("")}>Keep</Btn>
                </span>
              ) : <Btn small onClick={() => setWithdrawYear(p.year)}>Withdraw</Btn>}
            </div>
          ))}
        </Card>
      )}

      {result && confirming && (
        <Card style={{ margin: 0, padding: "16px 20px", borderColor: P.blue }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Publish the Year {year} timetable?</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.6, marginBottom: 12 }}>
            {result.parse.sections.length} sections and {result.blocks.length} classes will be saved as the master timetable for Year {year}.
            {alreadyPublished && <> <b style={{ color: P.amber }}>This replaces the Year {year} timetable already published by {alreadyPublished.publishedByName || "someone"}.</b></>}
            {" "}Attendance and marks stay with each subject's Main faculty; Assisting faculty are shown on the timetable only.
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <Btn onClick={publishNow} disabled={publishing}>{publishing ? "Publishing…" : "Yes, publish"}</Btn>
            <Btn onClick={() => setConfirming(false)} disabled={publishing}>Cancel</Btn>
          </div>
        </Card>
      )}

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
                {pending.length > 0 && <Pill color={P.amber} bg={P.amberL}>{pending.length} to confirm</Pill>}
                {result.conflicts.length > 0 && <Pill color={P.red} bg={P.redL}>{result.conflicts.length} overlap{result.conflicts.length === 1 ? "" : "s"} to clear</Pill>}
                {ready && <Pill color={P.green} bg={P.greenL}>No overlaps — ready to publish</Pill>}
                <Btn small onClick={downloadReport}>Download report (Excel)</Btn>
                <Btn small disabled={!ready || publishing} onClick={() => setConfirming(true)}>Publish Year {year}</Btn>
              </div>
            </div>
          </Card>

          {pending.length > 0 && (
            <Card style={{ margin: 0, padding: "16px 20px", borderColor: P.amber }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Please confirm ({pending.length})</div>
              <div style={{ fontSize: 12.5, color: P.gray, marginBottom: 8 }}>The portal wasn't sure about these. Choose the right one and the timetable is read again straight away.</div>
              {pending.map(p => (
                <div key={p.id} style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", padding: "10px 0", borderTop: "1px solid " + P.border }}>
                  <div style={{ flex: "1 1 280px", minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{p.kind === "faculty" ? "Faculty" : "Subject"}: “{p.text}”</div>
                    <div style={{ fontSize: 12, color: P.gray }}>{p.where.join(", ")} · {p.count} {p.count === 1 ? "cell" : "cells"}</div>
                  </div>
                  <select aria-label={"Choose for " + p.text} defaultValue="" onChange={e => e.target.value && answer(p.kind, p.key, e.target.value)}
                    style={{ border: "1.5px solid " + P.border, borderRadius: 8, padding: "8px 10px", fontSize: 13.5, fontFamily: "inherit", background: "#fff", maxWidth: "100%", minWidth: 240 }}>
                    <option value="">Choose…</option>
                    {p.kind === "faculty" ? (
                      <>
                        {p.options.length > 0 && <optgroup label="Closest matches">{p.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</optgroup>}
                        <option value="ext">Faculty from outside the portal (keep “{p.text}”)</option>
                        <optgroup label="Everyone in the portal">{people.slice().sort((a, b) => a.name.localeCompare(b.name)).map(x => <option key={x.phone} value={x.phone}>{x.name}</option>)}</optgroup>
                      </>
                    ) : (
                      <>
                        {p.options.length > 0 && <optgroup label="Closest matches">{p.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</optgroup>}
                        <optgroup label="All subjects in this section">{Array.from(new Set(p.allOptions)).map(n => <option key={n} value={n}>{n}</option>)}</optgroup>
                        <option value="note">Not a subject: keep it as a note</option>
                      </>
                    )}
                  </select>
                </div>
              ))}
            </Card>
          )}

          {result.parse.skipped.length > 0 && (
            <Card style={{ margin: 0, padding: "16px 20px" }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Timetables in the file that are not read</div>
              <div style={{ fontSize: 12.5, color: P.gray, marginBottom: 8 }}>These didn't match any Year {year} section, so they are left out. If one is really yours, say which section it is.</div>
              {result.parse.skipped.map((k, i) => (
                <div key={i} style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", padding: "6px 0", borderTop: "1px solid " + P.border }}>
                  <span style={{ flex: "1 1 220px", fontSize: 13.5, fontWeight: 600 }}>{k.title} <span style={{ fontWeight: 400, color: P.gray }}>· sheet {k.sheet}</span></span>
                  <select aria-label={"Section for " + k.title} defaultValue="" onChange={e => e.target.value && answer("section", akey(k.title), e.target.value)}
                    style={{ border: "1.5px solid " + P.border, borderRadius: 8, padding: "6px 10px", fontSize: 13, fontFamily: "inherit", background: "#fff", minWidth: 200 }}>
                    <option value="">Leave out</option>
                    {yearSections.map(x => <option key={x.id} value={x.id}>Read as {x.name}</option>)}
                  </select>
                </div>
              ))}
            </Card>
          )}

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

          <Card style={{ margin: 0, padding: "16px 20px" }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>How each section was read</div>
            <div style={{ fontSize: 12.5, color: P.gray, marginBottom: 10 }}>Check these against your sheet before publishing. Each class shows the faculty it was matched to.</div>
            {result.parse.sections.map(sec => (
              <details key={sec.id} style={{ borderTop: "1px solid " + P.border, padding: "8px 0" }}>
                <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 14 }}>{sec.name} <span style={{ fontWeight: 400, color: P.gray }}>· {result.blocks.filter(b => b.sectionId === sec.id).length} classes</span></summary>
                <div style={{ marginTop: 10 }}><WeekCards week={sectionWeek(result.blocks, sec.id)} editable={false} compact /></div>
              </details>
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
