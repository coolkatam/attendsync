// src/timetableDesign/VersionEditor.jsx
// Minor changes to one designed version: every section's timetable as an editable grid. Click a class to move it,
// swap it with another class of the same section, or change its faculty. Each change is checked for overlaps first
// (faculty, section, other published timetables, and labs of different sections when those may not overlap); one that
// would clash is not made. Nothing is kept until "Save changes".

import React, { useState } from "react";
import { P, Btn, Card } from "../components/UI";
import { DAY_NAMES, fmtRange } from "../timetableUpload/timeUtils";
import { suggestMoves } from "../timetableUpload/overlapCheck";
import { checkEdit, loadWarnings } from "../timetableUpload/editChecks";
import { BlockPanel } from "../timetableUpload/PublishedEditor";

const MONO = "'IBM Plex Mono', monospace";

export default function VersionEditor({ spec, n, blocks, others, people, colourOf, onSave, onCancel }) {
  const [work, setWork] = useState(() => blocks.map(b => ({ ...b })));
  const [log, setLog] = useState([]);
  const [secId, setSecId] = useState(spec.sections[0] ? spec.sections[0].id : "");
  const [pick, setPick] = useState(null);
  const [msg, setMsg] = useState(null);

  const slots = spec.timings.slots;
  const section = { ...(spec.sections.find(s => s.id === secId) || spec.sections[0]), slots };
  const days = spec.D;
  const noLabOverlap = spec.a.labsOverlap === false;
  const peopleBy = new Map(people.map(p => [p.phone, p]));
  const facObj = phone => { const p = peopleBy.get(phone); return p ? { key: phone, name: p.name, phone, external: false } : null; };
  const teachIdx = start => slots.filter(s => !s.brk && s.start < start).length;     // 0-based
  const picked = pick ? work.find(b => b.id === pick) : null;

  function apply(result, ofBlock) {
    if (result.error) { setMsg({ ok: false, text: result.error }); return; }
    // a short day (a half-day Saturday) has fewer periods
    const late = result.editedIds.map(id => result.blocks.find(x => x.id === id)).find(b => b && teachIdx(b.start) + (b.periods || 1) > spec.P[b.day]);
    if (late) { setMsg({ ok: false, text: "Not changed. " + DAY_NAMES[late.day] + " has only " + spec.P[late.day] + " periods, so " + late.token + " can't go there." }); return; }
    const chk = checkEdit(result.blocks, result.editedIds, others, { noLabOverlap, year: spec.year });
    if (!chk.ok) {
      let ideas = [];
      if (ofBlock) {
        const all = work.map(b => ({ ...b, source: "upload" })).concat(others);
        ideas = suggestMoves({ ...ofBlock, source: "upload" }, slots, all).map(o => o.text).slice(0, 3);
      }
      setMsg({ ok: false, text: "Not changed. This edit would cause a clash:", problems: chk.problems.map(p => p.text), ideas });
      return;
    }
    const warnings = loadWarnings(result.blocks, result.editedIds, { maxTotal: spec.limits.maxTotal, maxTheory: spec.limits.maxTheory, maxLab: spec.limits.maxLab });
    if (spec.a.labOnceADay !== false) {
      const seen = new Set();
      result.editedIds.forEach(id => {
        const b = result.blocks.find(x => x.id === id);
        if (!b || (b.type !== "lab" && b.type !== "drawing")) return;
        const sessions = new Set(result.blocks.filter(x => x.sectionId === b.sectionId && x.day === b.day && (x.type === "lab" || x.type === "drawing")).map(x => x.start + "-" + x.end));
        if (sessions.size > 1 && !seen.has(b.sectionId + b.day)) { seen.add(b.sectionId + b.day); warnings.push(b.sectionName + " now has two lab sessions on " + DAY_NAMES[b.day] + "."); }
      });
    }
    setWork(result.blocks);
    setLog(l => l.concat(result.text));
    setMsg({ ok: true, text: result.text, warnings });
    setPick(null);
  }

  return (
    <Card style={{ margin: 0, padding: "16px 18px", borderColor: P.blue }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
        <div style={{ fontWeight: 800, fontSize: 17 }}>Minor changes to Version {n}</div>
        <div style={{ display: "flex", gap: 10 }}>
          <Btn variant="outline" onClick={() => (log.length && !window.confirm("Throw away the " + log.length + " change" + (log.length === 1 ? "" : "s") + " you made here?") ? null : onCancel())}>Cancel</Btn>
          <Btn disabled={!log.length} onClick={() => onSave(work, log)}>Save changes{log.length ? " (" + log.length + ")" : ""}</Btn>
        </div>
      </div>
      <div style={{ fontSize: 13.5, color: P.gray, lineHeight: 1.6, marginBottom: 10 }}>Click a class to move it, swap it with another class of the same section, or change its faculty. Every change is checked for overlaps first, and one that would clash is not made.</div>

      {msg && (
        <div style={{ fontSize: 13.5, color: msg.ok ? P.green : P.red, background: msg.ok ? P.greenL : P.redL, borderRadius: 10, padding: "12px 16px", marginBottom: 10 }}>
          <div style={{ fontWeight: 700 }}>{msg.text}</div>
          {(msg.problems || []).map((t, i) => <div key={i} style={{ marginTop: 4 }}>• {t}</div>)}
          {(msg.ideas || []).length > 0 && <div style={{ marginTop: 8, color: "#1a2230" }}><b>You could instead:</b>{msg.ideas.map((t, i) => <div key={i}>• {t}</div>)}</div>}
          {(msg.warnings || []).map((t, i) => <div key={i} style={{ marginTop: 4, color: P.amber }}>⚠ {t} (allowed, but check it is what you want)</div>)}
        </div>
      )}

      {spec.sections.length > 1 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          {spec.sections.map(s => (
            <button key={s.id} onClick={() => { setSecId(s.id); setPick(null); }} style={{ padding: "5px 12px", borderRadius: 20, fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", border: "1.5px solid " + (section.id === s.id ? P.blue : P.border), background: section.id === s.id ? P.blue : "#fff", color: section.id === s.id ? "#fff" : P.navy }}>{s.name}</button>
          ))}
        </div>
      )}

      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 3, minWidth: 700 }}>
          <thead>
            <tr><th />{slots.map((s, i) => <th key={i} style={{ fontSize: 10.5, color: P.gray, fontWeight: 700, padding: "2px 4px", whiteSpace: "nowrap" }}>{s.brk ? (s.label || "Break") : "P" + (slots.slice(0, i).filter(x => !x.brk).length + 1)}<div style={{ fontWeight: 400, fontFamily: MONO }}>{fmtRange(s.start, s.end)}</div></th>)}</tr>
          </thead>
          <tbody>
            {Array.from({ length: days }, (_, d) => {
              const mine = work.filter(b => b.sectionId === section.id && b.day === d);
              const cells = [];
              let i = 0;
              while (i < slots.length) {
                const s = slots[i];
                if (s.brk) { cells.push(<td key={i} style={{ background: "#f6efdc", borderRadius: 5, width: 18 }} />); i++; continue; }
                const starts = mine.filter(b => b.start === s.start);
                if (!starts.length) { cells.push(<td key={i} style={{ background: "#fafafa", border: "1px dashed " + P.border, borderRadius: 5, textAlign: "center", color: "#c3c9d0", fontSize: 12 }}>-</td>); i++; continue; }
                const end = Math.max(...starts.map(b => b.end));
                let j = i;
                while (j + 1 < slots.length && slots[j + 1].end <= end) j++;
                cells.push(
                  <td key={i} colSpan={j - i + 1}>
                    <div style={{ display: "grid", gap: 2 }}>
                      {starts.map(b => {
                        const [bg, fg] = colourOf(b.token);
                        const on = pick === b.id;
                        return <button key={b.id} onClick={() => { setPick(b.id); setMsg(null); }} title={b.faculty.map(f => f.name).join(", ") || "no faculty"} style={{ background: "#" + bg, color: "#" + fg, border: on ? "2.5px solid " + P.navy : "2.5px solid transparent", borderRadius: 5, padding: "6px 6px", fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", minWidth: 74 }}>{b.token}</button>;
                      })}
                    </div>
                  </td>
                );
                i = j + 1;
              }
              return <tr key={d}><td style={{ fontSize: 12, fontWeight: 700, paddingRight: 8 }}>{DAY_NAMES[d].slice(0, 3)}</td>{cells}</tr>;
            })}
          </tbody>
        </table>
      </div>

      {picked && <div style={{ marginTop: 14 }}><BlockPanel key={picked.id} b={picked} section={section} slots={slots} days={days} blocks={work} people={people} facObj={facObj} apply={apply} /></div>}
      {log.length > 0 && <details style={{ marginTop: 10 }}><summary style={{ fontSize: 12.5, color: P.gray, cursor: "pointer" }}>{log.length} change{log.length === 1 ? "" : "s"} so far</summary>{log.map((t, i) => <div key={i} style={{ fontSize: 12.5, padding: "2px 0" }}>• {t}</div>)}</details>}
    </Card>
  );
}
