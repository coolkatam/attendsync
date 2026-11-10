// src/timetableDesign/DesignScreen.jsx
// Coordinator Duties > Timetable > Design a timetable.
// A short run of questions (what the portal already knows is not asked again), then up to three different,
// clash-free timetables for the year, downloaded as one Excel workbook: TT-1, Ind-1, TT-2, Ind-2, TT-3, Ind-3.
// TT-n is every section's timetable; Ind-n is every faculty member's own. Answers are kept on this computer as a draft.

import React, { useState, useEffect, useMemo, useRef } from "react";
import { collection, onSnapshot, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { P, Btn, Card, Spinner } from "../components/UI";
import { MASTER_ADMIN_PHONE } from "../utils";
import { yearOfSection, fmtRange } from "../timetableUpload/timeUtils";
import { computeWorkload } from "../timetableUpload/overlapCheck";
import { subjectColours } from "../timetableUpload/reportBuilder";
import { facultyListOf, guessType } from "../sections/subjectUtils";
import { defaultAnswers, periodsOn, DAY_ABBR } from "./designModel";
import { buildSpec, designVersions } from "./generator";
import { writeDesignWorkbook, sectionsOf } from "./designExport";
import { publishMaster } from "../timetableUpload/publishMaster";
import { Q, StepYear, StepTimings, StepTogether, StepLimits, StepAvailability } from "./steps";
import StepSubjects from "./StepSubjects";

const MONO = "'IBM Plex Mono', monospace";
const STEPS = [
  { id: "year", title: "Year" },
  { id: "time", title: "Days and periods" },
  { id: "subj", title: "Subjects and periods" },
  { id: "tog", title: "Labs and joint classes" },
  { id: "lim", title: "Faculty limits" },
  { id: "av", title: "Availability" },
  { id: "rev", title: "Review" },
];
const TIMING_KEYS = ["days", "satHalf", "satPeriods", "periodsPerDay", "firstStart", "periodMins", "periodOverrides", "breaks"];

const draftKey = (phone, year) => "ttdesign-v1:" + phone + ":" + year;
function loadDraft(phone, year) {
  try { const s = localStorage.getItem(draftKey(phone, year)); if (s) return { ...defaultAnswers(), ...JSON.parse(s) }; } catch (e) { /* no saved draft */ }
  return defaultAnswers();
}

// A version's section timetable as a small grid: days down, periods across.
function SectionGrid({ spec, blocks, sectionId, colourOf }) {
  const slots = spec.timings.slots;
  const mine = blocks.filter(b => b.sectionId === sectionId);
  const days = spec.D;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "separate", borderSpacing: 3, minWidth: 640 }}>
        <thead>
          <tr>
            <th />
            {slots.map((s, i) => <th key={i} style={{ fontSize: 10.5, color: P.gray, fontWeight: 700, padding: "2px 4px", whiteSpace: "nowrap" }}>{s.brk ? (s.label || "Break") : "P" + s.n}<div style={{ fontWeight: 400, fontFamily: MONO }}>{fmtRange(s.start, s.end)}</div></th>)}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: days }, (_, d) => (
            <tr key={d}>
              <td style={{ fontSize: 12, fontWeight: 700, paddingRight: 8 }}>{DAY_ABBR[d]}</td>
              {slots.map((s, i) => {
                if (s.brk) return <td key={i} style={{ background: "#f6efdc", borderRadius: 5, width: 18 }} />;
                const hit = mine.filter(b => b.day === d && b.start <= s.start && s.end <= b.end);
                if (d === 5 && s.n > periodsOn(spec.a, 5)) return <td key={i} style={{ background: "#f3f4f6", borderRadius: 5 }} />;
                if (hit.length === 0) return <td key={i} style={{ background: "#fafafa", border: "1px dashed " + P.border, borderRadius: 5, textAlign: "center", color: "#c3c9d0", fontSize: 12 }}>-</td>;
                const [bg, fg] = colourOf(hit[0].token);
                return (
                  <td key={i} title={hit.map(b => b.token + " - " + (b.faculty.map(f => f.name).join(", ") || "no faculty")).join("\n")} style={{ background: "#" + bg, color: "#" + fg, borderRadius: 5, padding: "5px 6px", textAlign: "center", fontSize: 11.5, fontWeight: 700, minWidth: 74 }}>
                    {hit.map(b => b.token).join(" / ")}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VersionCard({ spec, v, n, colourOf, onPublish }) {
  const [sec, setSec] = useState(spec.sections[0] ? spec.sections[0].id : "");
  const load = useMemo(() => computeWorkload(v.blocks).filter(w => !w.external), [v]);
  const most = load.slice().sort((x, y) => y.teaching - x.teaching)[0];
  const least = load.slice().sort((x, y) => x.teaching - y.teaching)[0];
  return (
    <Card style={{ margin: 0, padding: "16px 18px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 8 }}>
        <div style={{ fontWeight: 800, fontSize: 17 }}>Version {n} <span style={{ fontWeight: 500, fontSize: 13, color: P.gray }}>· sheets TT-{n} and Ind-{n}</span></div>
        <Btn small onClick={onPublish}>Use and publish this version</Btn>
        <div style={{ fontSize: 13, color: P.gray }}>{v.blocks.length} classes · no overlaps{most ? " · heaviest load " + most.name + " (" + most.teaching + " periods)" : ""}{least && least !== most ? ", lightest " + least.name + " (" + least.teaching + ")" : ""}</div>
      </div>
      {v.relaxed.length > 0 ? (
        <details style={{ marginBottom: 10 }}>
          <summary style={{ fontSize: 13, color: P.amber, fontWeight: 700, cursor: "pointer" }}>{v.relaxed.length} preference{v.relaxed.length === 1 ? "" : "s"} could not be kept</summary>
          <div style={{ fontSize: 12.5, color: P.gray, padding: "6px 0 0 14px" }}>{v.relaxed.map((t, i) => <div key={i}>• {t}</div>)}</div>
        </details>
      ) : <div style={{ fontSize: 13, color: P.green, marginBottom: 10 }}>Every preference you gave is kept.</div>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        {spec.sections.map(s => (
          <button key={s.id} onClick={() => setSec(s.id)} style={{ padding: "5px 12px", borderRadius: 20, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", border: "1.5px solid " + (sec === s.id ? P.blue : P.border), background: sec === s.id ? P.blue : "#fff", color: sec === s.id ? "#fff" : P.navy }}>{s.name}</button>
        ))}
      </div>
      <SectionGrid spec={spec} blocks={v.blocks} sectionId={sec} colourOf={colourOf} />
    </Card>
  );
}

export default function DesignScreen({ user, onBack }) {
  const [sections, setSections] = useState(null);
  const [people, setPeople] = useState(null);
  const [published, setPublished] = useState([]);
  const [year, setYear] = useState("III");
  const [a, setA] = useState(() => loadDraft(user.phone, "III"));
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [sets, setSets] = useState([]);       // each: { versions, problems, attempts, completes }
  const [specUsed, setSpecUsed] = useState(null);
  const [showSet, setShowSet] = useState(0);
  const [confirmN, setConfirmN] = useState(0);   // version waiting for "Yes, publish"
  const [pubBusy, setPubBusy] = useState(false);
  const [pubMsg, setPubMsg] = useState({ ok: true, text: "" });
  const sigs = useRef([]);
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
    getDocs(collection(db, "users")).then(us => {
      if (!alive) return;
      const list = [];
      us.forEach(d => { const u = d.data(); if (u.status === "approved") list.push({ phone: d.id, name: u.name || d.id }); });
      setPeople(list.sort((x, y) => x.name.localeCompare(y.name)));
    });
    const unsubPub = onSnapshot(collection(db, "masterTimetables"), snap => { if (alive) setPublished(snap.docs.map(d => ({ year: d.id, ...d.data() }))); }, () => {});
    return () => { alive = false; unsubPub(); };
  }, []);

  useEffect(() => { try { localStorage.setItem(draftKey(user.phone, year), JSON.stringify(a)); } catch (e) { /* storage off */ } }, [a, user.phone, year]);

  const ctx = useMemo(() => {
    const yearSections = (sections || []).filter(s => yearOfSection(s) === year).map(s => ({
      id: s.id, name: s.name,
      subjects: (s.subjects || []).map(sub => ({
        name: sub.name, token: String(sub.short || sub.name || "").toUpperCase().replace(/\s+/g, " "),
        type: sub.type || guessType(sub.name), faculty: facultyListOf(sub),
      })),
    }));
    const byName = new Map();
    yearSections.forEach(s => s.subjects.forEach(sub => {
      if (!byName.has(sub.name)) byName.set(sub.name, { name: sub.name, type: sub.type, sections: [] });
      byName.get(sub.name).sections.push({ id: s.id, name: s.name });
    }));
    return { yearSections, subjects: Array.from(byName.values()), people: people || [] };
  }, [sections, people, year]);

  // every subject gets a starting number; nothing already typed is overwritten
  useEffect(() => {
    if (!ctx.subjects.length) return;
    setA(prev => {
      let changed = false;
      const loads = { ...prev.loads };
      ctx.subjects.forEach(s => {
        if (!loads[s.name]) { loads[s.name] = s.type === "Theory" ? { periods: 4, block: 1 } : { periods: 3, block: Number(prev.labBlock) || 3 }; changed = true; }
      });
      return changed ? { ...prev, loads } : prev;
    });
  }, [ctx.subjects]);

  const calc = useMemo(() => {
    const other = published.filter(p => p.year !== year).flatMap(p => (p.blocks || []).map(b => ({ ...b, source: "published", publishedYear: p.year, publishedBy: p.publishedByName || "" })));
    return buildSpec({ year, a, sections: ctx.yearSections, people: ctx.people, published: other });
  }, [year, a, ctx, published]);

  if (!sections || !people) return <Spinner />;

  const set = patch => setA(prev => {
    const next = { ...prev, ...patch };
    if (TIMING_KEYS.some(k => k in patch) && !("timingsConfirmed" in patch)) next.timingsConfirmed = false;
    return next;
  });
  const changeYear = y => { setYear(y); setA(loadDraft(user.phone, y)); setSets([]); setSpecUsed(null); sigs.current = []; };

  const hasSubjects = ctx.yearSections.some(s => s.subjects.length > 0);
  const sid = STEPS[step].id;
  const canNext = sid === "year" ? ctx.yearSections.length > 0 && hasSubjects : true;

  const built = calc;
  const errors = (a.timingsConfirmed ? [] : [{ level: "error", step: "time", text: "The period timings haven't been checked yet. Open Days and periods, look at the timings, and tick “these timings are correct”." }]).concat(built.problems.filter(p => p.level === "error"));
  const warns = built.problems.filter(p => p.level !== "error");
  const goTo = id => { const i = STEPS.findIndex(x => x.id === id); if (i >= 0) { setStep(i); window.scrollTo(0, 0); } };

  function design(more) {
    if (!built || !built.spec) return;
    setBusy(true);
    setTimeout(() => {
      const res = designVersions(built.spec, ctx.people, { count: 3, skip: more ? sigs.current : [], timeMs: 9000 });
      res.versions.forEach(v => sigs.current.push(v.sig));
      setSpecUsed(built.spec);
      setSets(prev => (more ? [...prev, res] : [res]));
      setShowSet(more ? sets.length : 0);
      setBusy(false);
    }, 60);
  }

  async function publishVersion(n) {
    const v = sets[showSet].versions[n - 1];
    setPubBusy(true); setPubMsg({ ok: true, text: "" });
    try {
      await publishMaster({ year, blocks: v.blocks, sections: sectionsOf(specUsed), user, fileName: "Designed in the portal (version " + n + ")" });
      setPubMsg({ ok: true, text: "Year " + year + " timetable published from Version " + n + ": " + specUsed.sections.length + " sections, " + v.blocks.length + " classes. Faculty now see their classes in My Timetable." });
      setConfirmN(0);
    } catch (err) {
      setPubMsg({ ok: false, text: "Could not publish (" + err.message + "). Nothing was changed." });
    }
    setPubBusy(false);
  }

  const current = sets[showSet];
  const alreadyPublished = published.find(p => p.year === year);
  const colourOf = current && current.versions.length ? subjectColours(current.versions.flatMap(v => v.blocks)) : null;

  return (
    <div style={{ padding: "24px clamp(16px, 3vw, 32px) 80px", maxWidth: "min(1300px, 96vw)", margin: "0 auto", display: "grid", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Btn small variant="ghost" onClick={onBack}>← Back</Btn>
        <div style={{ fontWeight: 800, fontSize: 20 }}>Design a timetable</div>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {STEPS.map((s, i) => (
          <button key={s.id} onClick={() => setStep(i)} style={{ padding: "6px 12px", borderRadius: 20, fontSize: 12.5, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", border: "1.5px solid " + (i === step ? P.blue : P.border), background: i === step ? P.blue : "#fff", color: i === step ? "#fff" : P.navy }}>{i + 1}. {s.title}</button>
        ))}
      </div>

      <Card style={{ margin: 0, padding: "10px 22px 18px" }}>
          <div style={{ fontWeight: 800, fontSize: 17, padding: "12px 0 0" }}>{STEPS[step].title}</div>
          {sid === "year" && <StepYear ctx={ctx} year={year} setYear={changeYear} />}
          {sid === "time" && <StepTimings a={a} set={set} />}
          {sid === "subj" && <StepSubjects a={a} set={set} ctx={ctx} calc={calc} />}
          {sid === "tog" && <StepTogether a={a} set={set} ctx={ctx} />}
          {sid === "lim" && <StepLimits a={a} set={set} />}
          {sid === "av" && <StepAvailability a={a} set={set} ctx={ctx} />}
          {sid === "rev" && (
            <>
              <Q title="Anything else I should know?" hint="Type it here. I can't act on free text, but it is kept with your answers for whoever reads them, and I'll tell you if I couldn't do something you asked for above.">
                <textarea value={a.notes} onChange={e => set({ notes: e.target.value })} rows={3} style={{ width: "100%", boxSizing: "border-box", border: "1.5px solid " + P.border, borderRadius: 8, padding: "9px 12px", fontSize: 14, fontFamily: "inherit" }} />
              </Q>
              <Q title="Before I design">
                {errors.length === 0 && <div style={{ fontSize: 14, color: P.green, fontWeight: 600 }}>Nothing stops the design. {built && built.spec ? built.spec.units.length + " classes to place across " + built.spec.sections.length + " section" + (built.spec.sections.length === 1 ? "" : "s") + "." : ""}</div>}
                {errors.length > 0 && <div style={{ fontSize: 13, fontWeight: 700, color: P.red, marginBottom: 6 }}>These need fixing before I can design. Each has a button that takes you to the right tab:</div>}
                {errors.map((p, i) => (
                  <div key={i} style={{ fontSize: 13.5, color: P.red, background: P.redL, borderRadius: 8, padding: "10px 12px", margin: "6px 0", display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
                    <span style={{ flex: "1 1 420px", lineHeight: 1.55 }}>{p.text}</span>
                    {p.step && <Btn small variant="outline" onClick={() => goTo(p.step)}>Go to {(STEPS.find(x => x.id === p.step) || {}).title}</Btn>}
                  </div>
                ))}
                {warns.map((p, i) => <div key={i} style={{ fontSize: 13, color: P.amber, padding: "3px 0" }}>⚠ {p.text}</div>)}
              </Q>
              {built && built.spec && (
                <Q title="Weekly periods per section">
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {built.spec.sections.map(s => {
                      const need = built.spec.units.filter(u => u.sectionIds.includes(s.id)).reduce((t, u) => t + u.size, 0);
                      const have = built.spec.P.reduce((t, n) => t + n, 0);
                      return <span key={s.id} style={{ fontSize: 13, background: need > have ? P.redL : P.bg, border: "1px solid " + P.border, borderRadius: 20, padding: "5px 12px" }}><b style={{ fontFamily: MONO }}>{s.name}</b> · {need} of {have} periods</span>;
                    })}
                  </div>
                </Q>
              )}
            </>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, paddingTop: 16, borderTop: "1px solid " + P.border, marginTop: 8 }}>
            <Btn variant="outline" disabled={step === 0} onClick={() => setStep(step - 1)}>← Back</Btn>
            {sid !== "rev"
              ? <Btn disabled={!canNext} onClick={() => setStep(step + 1)}>Next →</Btn>
              : <Btn disabled={busy || errors.length > 0 || !built || !built.spec} onClick={() => design(false)}>{busy ? "Designing…" : sets.length ? "Design again" : "Design the timetables"}</Btn>}
          </div>
        </Card>

      {busy && <Card style={{ margin: 0, padding: 20 }}><Spinner /><div style={{ textAlign: "center", color: P.gray, fontSize: 14 }}>Designing clash-free timetables…</div></Card>}

      {!busy && current && (
        <>
          {sets.length > 1 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {sets.map((s, i) => <button key={i} onClick={() => setShowSet(i)} style={{ padding: "6px 14px", borderRadius: 20, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", border: "1.5px solid " + (i === showSet ? P.blue : P.border), background: i === showSet ? P.blue : "#fff", color: i === showSet ? "#fff" : P.navy }}>Set {i + 1}</button>)}
            </div>
          )}
          {current.versions.length === 0 ? (
            <Card style={{ margin: 0, padding: "16px 20px", borderColor: P.red }}>
              <div style={{ fontWeight: 800, fontSize: 16, color: P.red, marginBottom: 6 }}>I couldn't make a timetable with these answers</div>
              <div style={{ fontSize: 13.5, marginBottom: 8, lineHeight: 1.6 }}>I tried {current.attempts} different arrangements. {sets.length > 1 ? "No new version was found this time: the earlier ones may be the only ones that fit." : "Here is what got in the way:"}</div>
              {current.problems.map((t, i) => <div key={i} style={{ fontSize: 13.5, padding: "3px 0" }}>• {t}</div>)}
              <div style={{ fontSize: 13, color: P.gray, marginTop: 10 }}>Go back and loosen one of these (a daily limit, a subject's periods, a faculty member's unavailable slots), then design again.</div>
            </Card>
          ) : (
            <>
              <Card style={{ margin: 0, padding: "14px 18px", borderColor: P.green }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 16, color: P.green }}>{current.versions.length} clash-free version{current.versions.length === 1 ? "" : "s"} ready</div>
                    <div style={{ fontSize: 13, color: P.gray, marginTop: 2 }}>The Excel file has {current.versions.length * 2} sheets: {current.versions.map((_, i) => "TT-" + (i + 1) + ", Ind-" + (i + 1)).join(", ")}. TT is every section's timetable, Ind is every faculty member's own.{current.versions.length < 3 ? " Only " + current.versions.length + " genuinely different arrangement" + (current.versions.length === 1 ? "" : "s") + " fit your rules." : ""}</div>
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <Btn onClick={() => writeDesignWorkbook(specUsed, current.versions, "Timetable designs - Year " + year + (sets.length > 1 ? " (set " + (showSet + 1) + ")" : "") + ".xlsx")}>Download Excel</Btn>
                    <Btn variant="outline" disabled={busy} onClick={() => design(true)}>Design another set</Btn>
                  </div>
                </div>
              </Card>
              {pubMsg.text && <div style={{ fontSize: 13.5, color: pubMsg.ok ? P.green : P.red, background: pubMsg.ok ? P.greenL : P.redL, borderRadius: 10, padding: "12px 16px", fontWeight: 600 }}>{pubMsg.text}</div>}
              {confirmN > 0 && (
                <Card style={{ margin: 0, padding: "16px 20px", borderColor: P.blue }}>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Publish Version {confirmN} as the Year {year} timetable?</div>
                  <div style={{ fontSize: 13.5, lineHeight: 1.6, marginBottom: 12 }}>
                    It has no overlaps. {specUsed.sections.length} sections and {current.versions[confirmN - 1].blocks.length} classes will be saved as the master timetable.
                    {alreadyPublished && <> <b style={{ color: P.amber }}>This replaces the Year {year} timetable already published by {alreadyPublished.publishedByName || "someone"}.</b></>}
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <Btn onClick={() => publishVersion(confirmN)} disabled={pubBusy}>{pubBusy ? "Publishing…" : "Yes, publish"}</Btn>
                    <Btn variant="outline" onClick={() => setConfirmN(0)} disabled={pubBusy}>Cancel</Btn>
                  </div>
                </Card>
              )}
              {current.versions.map((v, i) => <VersionCard key={v.sig} spec={specUsed} v={v} n={i + 1} colourOf={colourOf} onPublish={() => { setPubMsg({ ok: true, text: "" }); setConfirmN(i + 1); }} />)}
              <div style={{ fontSize: 13, color: P.gray, lineHeight: 1.6 }}>Happy with one? Publish it. To change something first, download the Excel, edit that version's TT sheet, then go back and choose <b>Upload a timetable</b>: it asks which version to read, shows any overlaps your edits cause, can fix them for you, and then publishes.</div>
            </>
          )}
        </>
      )}
    </div>
  );
}
