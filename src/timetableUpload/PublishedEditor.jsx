// src/timetableUpload/PublishedEditor.jsx
// Edit a published timetable on screen: click a class to move it, swap it, change its faculty or remove it; click an
// empty period to add a class. Every edit is checked for overlaps (faculty, section, other years' published
// timetables) before it is accepted, and nothing is saved until "Save changes". Saving updates the master
// timetable, which faculty see in My Timetable.

import React, { useState, useEffect, useRef } from "react";
import { collection, doc, getDoc, getDocs, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { P, Btn, Card, Spinner } from "../components/UI";
import FacultyListEditor from "../sections/FacultyListEditor";
import { facultyListOf } from "../sections/subjectUtils";
import { DAY_NAMES, fmtRange, fmtClock } from "./timeUtils";
import { suggestMoves } from "./overlapCheck";
import { publishMaster } from "./publishMaster";
import { startOptions, moveBlock, swapBlocks, changeFaculty, removeBlock, addBlock, checkEdit, loadWarnings } from "./editChecks";

const MONO = "'IBM Plex Mono', monospace";
const PALETTE = [["DDEBF7", "1F4E79"], ["E2F0D9", "375623"], ["FFF2CC", "7F6000"], ["FCE4D6", "843C0C"], ["E4DFEC", "4B2E83"], ["D9F2F0", "0F5F5A"], ["F8E1F4", "8A2B7E"], ["FDE2E4", "9B2C3B"], ["DCE6F9", "2B4C9B"], ["F3E5C8", "6B4E16"]];
const sel = { border: "1.5px solid " + P.border, borderRadius: 8, padding: "8px 10px", fontSize: 14, fontFamily: "inherit", background: "#fff", boxSizing: "border-box" };
const lbl = { display: "block", fontSize: 11.5, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: P.gray, marginBottom: 5 };

export default function PublishedEditor({ year, user, onBack }) {
  const [master, setMaster] = useState(undefined);       // undefined = loading, null = not found
  const [blocks, setBlocks] = useState([]);
  const [others, setOthers] = useState([]);              // blocks of other years' published timetables
  const [portalSections, setPortalSections] = useState([]);
  const [people, setPeople] = useState([]);
  const [secId, setSecId] = useState("");
  const [pick, setPick] = useState(null);                // { kind: "block", id } | { kind: "cell", day, start }
  const [msg, setMsg] = useState(null);                  // { ok, text, problems, ideas, warnings }
  const [log, setLog] = useState([]);
  const [saving, setSaving] = useState(false);
  const first = useRef(true);

  useEffect(() => {
    let alive = true;
    getDoc(doc(db, "masterTimetables", year)).then(s => {
      if (!alive) return;
      if (!s.exists()) { setMaster(null); return; }
      const d = { year, ...s.data() };
      setMaster(d); setBlocks((d.blocks || []).map(b => ({ ...b }))); setSecId((d.sections || [])[0] ? d.sections[0].id : "");
    });
    getDocs(collection(db, "users")).then(us => {
      if (!alive) return;
      const list = [];
      us.forEach(d => { const u = d.data(); if (u.status === "approved") list.push({ phone: d.id, name: u.name || d.id }); });
      setPeople(list.sort((a, b) => a.name.localeCompare(b.name)));
    });
    const u1 = onSnapshot(collection(db, "masterTimetables"), snap => {
      if (!alive) return;
      setOthers(snap.docs.filter(d => d.id !== year).flatMap(d => (d.data().blocks || []).map(b => ({ ...b, source: "published", publishedYear: d.id, publishedBy: d.data().publishedByName || "" }))));
    }, () => {});
    const u2 = onSnapshot(collection(db, "sections"), snap => { if (alive) setPortalSections(snap.docs.map(d => ({ id: d.id, ...d.data() }))); }, () => {});
    return () => { alive = false; u1(); u2(); };
  }, [year]);

  if (master === undefined) return <Spinner />;
  if (master === null) return (
    <div style={{ padding: 24 }}><Btn small variant="ghost" onClick={onBack}>← Back</Btn><div style={{ marginTop: 16, color: P.gray }}>There is no published timetable for Year {year}.</div></div>
  );

  const sections = master.sections || [];
  const section = sections.find(s => s.id === secId) || sections[0];
  const slots = section ? section.slots : [];
  const days = blocks.some(b => b.day === 5) ? 6 : 5;
  const dirty = log.length > 0;
  const colourOf = (() => { const t = Array.from(new Set(blocks.map(b => b.token))).sort(); const m = new Map(t.map((x, i) => [x, PALETTE[i % PALETTE.length]])); return x => m.get(x) || PALETTE[0]; })();
  const peopleBy = new Map(people.map(p => [p.phone, p]));
  const facObj = phone => { const p = peopleBy.get(phone); return p ? { key: phone, name: p.name, phone, external: false } : null; };
  const portalSection = portalSections.find(s => s.id === (section && section.id));

  const picked = pick && pick.kind === "block" ? blocks.find(b => b.id === pick.id) : null;

  function apply(result, ofBlock) {
    if (result.error) { setMsg({ ok: false, text: result.error }); return; }
    const chk = checkEdit(result.blocks, result.editedIds, others);
    if (!chk.ok) {
      let ideas = [];
      if (ofBlock) {
        const sec = sections.find(s => s.id === ofBlock.sectionId);
        const all = blocks.map(b => ({ ...b, source: "upload" })).concat(others);
        ideas = suggestMoves({ ...ofBlock, source: "upload" }, sec ? sec.slots : [], all).map(o => o.text).slice(0, 3);
      }
      setMsg({ ok: false, text: "Not changed. This edit would cause a clash:", problems: chk.problems.map(p => p.text), ideas });
      return;
    }
    setBlocks(result.blocks);
    setLog(l => l.concat(result.text));
    setMsg({ ok: true, text: result.text, warnings: loadWarnings(result.blocks, result.editedIds) });
    setPick(null);
  }

  async function save() {
    setSaving(true);
    try {
      await publishMaster({ year, blocks, sections, user, edited: true, keepFrom: master });
      setMaster({ ...master, blocks }); setLog([]); setPick(null);
      setMsg({ ok: true, text: "Saved. The Year " + year + " timetable is updated, and faculty see the change in My Timetable." });
    } catch (err) { setMsg({ ok: false, text: "Could not save (" + err.message + "). Nothing was changed." }); }
    setSaving(false);
  }
  function discard() {
    if (!window.confirm("Throw away the " + log.length + " unsaved change" + (log.length === 1 ? "" : "s") + "?")) return;
    setBlocks((master.blocks || []).map(b => ({ ...b }))); setLog([]); setPick(null); setMsg(null);
  }

  return (
    <div style={{ padding: "24px clamp(16px, 3vw, 32px) 90px", maxWidth: "min(1400px, 96vw)", margin: "0 auto", display: "grid", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Btn small variant="ghost" onClick={() => (dirty && !window.confirm("You have unsaved changes. Leave without saving?") ? null : onBack())}>← Back</Btn>
        <div style={{ fontWeight: 800, fontSize: 20 }}>Edit the Year {year} timetable</div>
        <div style={{ fontSize: 13, color: P.gray }}>Published by {master.publishedByName || "—"}{master.publishedAt ? " on " + new Date(master.publishedAt).toLocaleDateString() : ""}{master.lastEditedAt ? " · last edited by " + (master.lastEditedByName || "—") + " on " + new Date(master.lastEditedAt).toLocaleDateString() : ""}</div>
      </div>

      <div style={{ fontSize: 13.5, color: P.gray, lineHeight: 1.6 }}>Click a class to move, swap, change or remove it. Click an empty period to add a class. Every change is checked for overlaps first, and one that would clash is not made.</div>

      {msg && (
        <div style={{ fontSize: 13.5, color: msg.ok ? P.green : P.red, background: msg.ok ? P.greenL : P.redL, borderRadius: 10, padding: "12px 16px" }}>
          <div style={{ fontWeight: 700 }}>{msg.text}</div>
          {(msg.problems || []).map((t, i) => <div key={i} style={{ marginTop: 4 }}>• {t}</div>)}
          {(msg.ideas || []).length > 0 && <div style={{ marginTop: 8, color: "#1a2230" }}><b>You could instead:</b>{msg.ideas.map((t, i) => <div key={i}>• {t}</div>)}</div>}
          {(msg.warnings || []).map((t, i) => <div key={i} style={{ marginTop: 4, color: P.amber }}>⚠ {t} (allowed, but check it is what you want)</div>)}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {sections.map(s => (
          <button key={s.id} onClick={() => { setSecId(s.id); setPick(null); }} style={{ padding: "7px 16px", borderRadius: 20, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", border: "1.5px solid " + (section && section.id === s.id ? P.blue : P.border), background: section && section.id === s.id ? P.blue : "#fff", color: section && section.id === s.id ? "#fff" : P.navy }}>{s.name}</button>
        ))}
      </div>

      <Card style={{ margin: 0, padding: "14px 16px" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "separate", borderSpacing: 3, minWidth: 700 }}>
            <thead>
              <tr><th />{slots.map((s, i) => <th key={i} style={{ fontSize: 10.5, color: P.gray, fontWeight: 700, padding: "2px 4px", whiteSpace: "nowrap" }}>{s.brk ? (s.label || "Break") : "P" + (slots.slice(0, i).filter(x => !x.brk).length + 1)}<div style={{ fontWeight: 400, fontFamily: MONO }}>{fmtRange(s.start, s.end)}</div></th>)}</tr>
            </thead>
            <tbody>
              {Array.from({ length: days }, (_, d) => (
                <tr key={d}>
                  <td style={{ fontSize: 12, fontWeight: 700, paddingRight: 8 }}>{DAY_NAMES[d].slice(0, 3)}</td>
                  {(() => {
                    const cells = [];
                    const mine = blocks.filter(b => b.sectionId === (section && section.id) && b.day === d);
                    let i = 0;
                    while (i < slots.length) {
                      const s = slots[i];
                      if (s.brk) { cells.push(<td key={i} style={{ background: "#f6efdc", borderRadius: 5, width: 18 }} />); i++; continue; }
                      const starts = mine.filter(b => b.start === s.start);
                      const cover = mine.filter(b => b.start < s.start && s.end <= b.end);
                      const hit = starts.length ? starts : cover;
                      if (!hit.length) {
                        const on = pick && pick.kind === "cell" && pick.day === d && pick.start === s.start;
                        cells.push(<td key={i}><button onClick={() => { setPick({ kind: "cell", day: d, start: s.start }); setMsg(null); }} style={{ width: "100%", minWidth: 74, height: 34, background: on ? P.blueL : "#fafafa", border: "1.5px dashed " + (on ? P.blue : P.border), borderRadius: 5, cursor: "pointer", color: "#b6bdc6", fontSize: 14 }} aria-label={"Add a class on " + DAY_NAMES[d] + " " + fmtRange(s.start, s.end)}>+</button></td>);
                        i++; continue;
                      }
                      // a class of several periods is one block across them
                      let j = i;
                      if (starts.length) { const end = Math.max(...starts.map(b => b.end)); while (j + 1 < slots.length && slots[j + 1].end <= end) j++; }
                      cells.push(
                        <td key={i} colSpan={j - i + 1}>
                          <div style={{ display: "grid", gap: 2 }}>
                            {hit.map(b => {
                              const [bg, fg] = colourOf(b.token);
                              const on = pick && pick.kind === "block" && pick.id === b.id;
                              return <button key={b.id} onClick={() => { setPick({ kind: "block", id: b.id }); setMsg(null); }} title={b.faculty.map(f => f.name).join(", ") || "no faculty"} style={{ background: "#" + bg, color: "#" + fg, border: on ? "2.5px solid " + P.navy : "2.5px solid transparent", borderRadius: 5, padding: "6px 6px", fontSize: 11.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", minWidth: 74 }}>{b.token}</button>;
                            })}
                          </div>
                        </td>
                      );
                      i = j + 1;
                    }
                    return cells;
                  })()}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {picked && <BlockPanel key={picked.id} b={picked} section={section} slots={slots} days={days} blocks={blocks} people={people} facObj={facObj} apply={apply} remove={() => { if (window.confirm("Remove " + picked.token + " from " + picked.sectionName + "?")) apply(removeBlock(blocks, picked.id)); }} />}
      {pick && pick.kind === "cell" && section && <AddPanel key={pick.day + "-" + pick.start} cell={pick} section={section} portalSection={portalSection} people={people} facObj={facObj} blocks={blocks} apply={apply} />}

      {dirty && (
        <div style={{ position: "sticky", bottom: 12, background: "#fff", border: "1.5px solid " + P.blue, borderRadius: 12, padding: "12px 16px", boxShadow: "0 6px 20px rgba(22,50,79,0.18)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{log.length} unsaved change{log.length === 1 ? "" : "s"}</div>
            <div style={{ display: "flex", gap: 10 }}><Btn variant="outline" onClick={discard} disabled={saving}>Discard</Btn><Btn onClick={save} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Btn></div>
          </div>
          <details style={{ marginTop: 6 }}><summary style={{ fontSize: 12.5, color: P.gray, cursor: "pointer" }}>What will change</summary>{log.map((t, i) => <div key={i} style={{ fontSize: 12.5, padding: "2px 0" }}>• {t}</div>)}</details>
        </div>
      )}
    </div>
  );
}

export function BlockPanel({ b, section, slots, days, blocks, people, facObj, apply, remove }) {
  const opts = startOptions(b, slots);
  const [day, setDay] = useState(b.day);
  const [start, setStart] = useState(b.start);
  const swapWith = blocks.filter(x => x.id !== b.id && x.sectionId === b.sectionId && (x.periods || 1) === (b.periods || 1) && !(x.day === b.day && x.start === b.start));
  const [swapId, setSwapId] = useState("");
  const external = b.faculty.filter(f => f.external);
  const [list, setList] = useState(b.faculty.filter(f => !f.external).map(f => f.key));
  const opt = people.map(p => ({ value: p.phone, label: p.name }));
  const teachingIdx = start => slots.filter(s => !s.brk && s.start <= start).length;
  return (
    <Card style={{ margin: 0, padding: "16px 18px", borderColor: P.navy }}>
      <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 2 }}>{b.token} <span style={{ fontWeight: 500, color: P.gray, fontSize: 13 }}>· {b.sectionName} · {DAY_NAMES[b.day]} {fmtRange(b.start, b.end)} · {b.periods || 1} period{(b.periods || 1) === 1 ? "" : "s"}</span></div>
      <div style={{ fontSize: 13, color: P.gray, marginBottom: 12 }}>{b.faculty.map(f => f.name).join(", ") || "No faculty"}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 18 }}>
        <div>
          <span style={lbl}>Move to</span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <select value={day} onChange={e => setDay(Number(e.target.value))} style={sel}>{Array.from({ length: days }, (_, d) => <option key={d} value={d}>{DAY_NAMES[d]}</option>)}</select>
            <select value={start} onChange={e => setStart(Number(e.target.value))} style={sel}>{opts.map(o => <option key={o.start} value={o.start}>Period {teachingIdx(o.start)} · {fmtRange(o.start, o.end)}</option>)}</select>
            <Btn small onClick={() => apply(moveBlock(blocks, b.id, day, start, slots), b)}>Move</Btn>
          </div>
        </div>
        <div>
          <span style={lbl}>Swap with another class of {section.name}</span>
          {swapWith.length === 0 ? <div style={{ fontSize: 13, color: P.gray }}>No other class of the same length.</div> : (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <select value={swapId} onChange={e => setSwapId(e.target.value)} style={{ ...sel, maxWidth: 260 }}>
                <option value="">Choose…</option>
                {swapWith.slice().sort((x, y) => x.day - y.day || x.start - y.start).map(x => <option key={x.id} value={x.id}>{DAY_NAMES[x.day].slice(0, 3)} {fmtRange(x.start, x.end)} · {x.token}</option>)}
              </select>
              <Btn small disabled={!swapId} onClick={() => apply(swapBlocks(blocks, b.id, swapId), b)}>Swap</Btn>
            </div>
          )}
        </div>
      </div>
      <div style={{ marginTop: 16 }}>
        <span style={lbl}>Faculty</span>
        <FacultyListEditor list={list} onChange={setList} facultyOptions={opt} />
        {external.length > 0 && <div style={{ fontSize: 12.5, color: P.gray, marginTop: 6 }}>From outside the portal, kept as they are: {external.map(f => f.name).join(", ")}.</div>}
        <div style={{ marginTop: 8 }}><Btn small variant="outline" onClick={() => apply(changeFaculty(blocks, b.id, list.filter(Boolean).map(facObj).filter(Boolean).concat(external)), b)}>Change faculty</Btn></div>
      </div>
      {remove && <div style={{ marginTop: 14, borderTop: "1px solid " + P.border, paddingTop: 12 }}><Btn small variant="danger" onClick={remove}>Remove this class</Btn></div>}
    </Card>
  );
}

function AddPanel({ cell, section, portalSection, people, facObj, blocks, apply }) {
  const subs = portalSection ? (portalSection.subjects || []) : [];
  const [subName, setSubName] = useState("");
  const [other, setOther] = useState("");
  const [periods, setPeriods] = useState(1);
  const sub = subs.find(s => s.name === subName);
  const [list, setList] = useState([]);
  const opt = people.map(p => ({ value: p.phone, label: p.name }));
  function chooseSub(name) { setSubName(name); const s = subs.find(x => x.name === name); setList(s ? facultyListOf(s) : []); }
  const type = sub ? String(sub.type || "Theory").toLowerCase() : "other";
  const token = sub ? String(sub.short || sub.name).toUpperCase().replace(/\s+/g, " ") : other.trim().toUpperCase();
  return (
    <Card style={{ margin: 0, padding: "16px 18px", borderColor: P.blue }}>
      <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 10 }}>Add a class to {section.name} · {DAY_NAMES[cell.day]} from {fmtClock(cell.start)}</div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div><span style={lbl}>Subject</span>
          <select value={subName} onChange={e => chooseSub(e.target.value)} style={{ ...sel, minWidth: 220 }}>
            <option value="">Another activity…</option>{subs.map(s => <option key={s.id || s.name} value={s.name}>{s.name}</option>)}
          </select>
        </div>
        {!sub && <div><span style={lbl}>Activity name</span><input value={other} onChange={e => setOther(e.target.value)} placeholder="e.g. Sports" style={{ ...sel, width: 180 }} /></div>}
        <div><span style={lbl}>Periods</span><input type="number" min="1" max="4" value={periods} onChange={e => setPeriods(Number(e.target.value) || 1)} style={{ ...sel, width: 80 }} /></div>
      </div>
      <div style={{ marginTop: 14 }}><span style={lbl}>Faculty (optional)</span><FacultyListEditor list={list} onChange={setList} facultyOptions={opt} /></div>
      <div style={{ marginTop: 12 }}>
        <Btn small disabled={!token} onClick={() => apply(addBlock(blocks, section, cell.day, cell.start, { token, subject: sub ? sub.name : token, type, faculty: list.filter(Boolean).map(facObj).filter(Boolean).map((f, i) => ({ ...f, role: i === 0 ? "main" : "asst" })), periods }))}>Add this class</Btn>
      </div>
    </Card>
  );
}
