// src/timetableDesign/steps.jsx
// The question screens of "Design a timetable". Each takes { a, set, ctx }: the answers so far, a function that
// changes some of them, and what the portal already knows (sections, subjects, faculty, timings).

import React from "react";
import { P, Btn } from "../components/UI";
import { parseTimeToken, fmtClock } from "../timetableUpload/timeUtils";
import { buildTimings, validateTimings, periodsOn, DAY_LONG, DAY_ABBR } from "./designModel";

const MONO = "'IBM Plex Mono', monospace";
export const inp = { border: "1.5px solid " + P.border, borderRadius: 8, padding: "8px 10px", fontSize: 14, fontFamily: "inherit", background: "#fff", boxSizing: "border-box" };
export const small = { fontSize: 12.5, color: P.gray, lineHeight: 1.6 };
export const lbl = { display: "block", fontSize: 11.5, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: P.gray, marginBottom: 6 };

export function Q({ title, hint, children }) {
  return (
    <div style={{ padding: "14px 0", borderTop: "1px solid " + P.border }}>
      <div style={{ fontWeight: 700, fontSize: 14.5, marginBottom: hint ? 3 : 8 }}>{title}</div>
      {hint && <div style={{ ...small, marginBottom: 8 }}>{hint}</div>}
      {children}
    </div>
  );
}

export function Radio({ checked, onChange, children }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer", padding: "3px 0" }}>
      <input type="radio" checked={checked} onChange={onChange} style={{ accentColor: P.blue }} />{children}
    </label>
  );
}
export function Check({ checked, onChange, children }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer", padding: "3px 0" }}>
      <input type="checkbox" checked={!!checked} onChange={e => onChange(e.target.checked)} style={{ accentColor: P.blue, width: 16, height: 16 }} />{children}
    </label>
  );
}
export function NumIn({ value, onChange, width = 80, min = 0, max, placeholder }) {
  return <input type="number" min={min} max={max} value={value === undefined || value === null ? "" : value} placeholder={placeholder} onChange={e => onChange(e.target.value)} style={{ ...inp, width }} />;
}


// ── Step: year ───────────────────────────────────────────────────────────────────────────
export function YearWarnings({ ctx }) {
  const w = (ctx && ctx.yearWarnings) || [];
  if (!w.length) return null;
  return (
    <div style={{ fontSize: 13, color: "#1a2230", background: P.amberL, border: "1px solid " + P.amber, borderRadius: 8, padding: "10px 12px", margin: "10px 0", lineHeight: 1.55 }}>
      <b style={{ color: P.amber }}>Please check the section's year</b>
      {w.map(x => <div key={x.id} style={{ marginTop: 4 }}>{x.text}</div>)}
      <div style={{ marginTop: 6, color: P.gray }}>To correct it: Coordinator Duties › All Sections › Sections & Subjects, and set the right year for that section. Nothing has been changed for you.</div>
    </div>
  );
}

export function StepYear({ ctx, year, setYear, setSelected, published = [] }) {
  const pubDoc = published.find(p => p.year === year);
  const isPublished = id => !!pubDoc && (pubDoc.blocks || []).some(b => b.sectionId === id);
  const chosen = ctx.selectedIds || [];
  const toggle = id => setSelected(chosen.includes(id) ? chosen.filter(x => x !== id) : chosen.concat(id));
  return (
    <>
      <Q title="Which year is this timetable for?" hint="The portal already knows that year's sections, subjects and faculty, so you won't be asked for them again.">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {["I", "II", "III", "IV"].map(y => (
            <button key={y} onClick={() => setYear(y)} style={{ padding: "9px 20px", borderRadius: 9, fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit", border: "1.5px solid " + (year === y ? P.blue : P.border), background: year === y ? P.blue : "#fff", color: year === y ? "#fff" : P.navy }}>Year {y}</button>
          ))}
        </div>
      </Q>
      {ctx.allSections.length > 0 && (
        <Q title="Which section?" hint="Tick the section you want to design. One section at a time is the usual way; tick more than one only if you want them designed together (needed for a class taken by several sections jointly).">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
            {ctx.allSections.map(s => {
              const on = chosen.includes(s.id);
              return (
                <label key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "11px 14px", borderRadius: 10, border: "1.5px solid " + (on ? P.blue : P.border), background: on ? P.blueL : "#fff" }}>
                  <input type="checkbox" checked={on} onChange={() => toggle(s.id)} style={{ accentColor: P.blue, width: 17, height: 17 }} />
                  <span style={{ flex: 1 }}>
                    <b style={{ fontFamily: MONO, fontSize: 13.5 }}>{s.name}</b>
                    <span style={{ display: "block", fontSize: 12, color: P.gray }}>{s.subjects.length} subjects{isPublished(s.id) ? " · timetable already published" : ""}</span>
                  </span>
                </label>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <Btn small variant="ghost" onClick={() => setSelected(ctx.allSections.map(s => s.id))}>Select all</Btn>
            <Btn small variant="ghost" onClick={() => setSelected([])}>Clear</Btn>
          </div>
        </Q>
      )}
      {ctx.allSections.length > 0 && ctx.yearSections.length === 0 ? (
        <div style={{ fontSize: 13.5, color: P.gray, padding: "4px 0" }}>No section is chosen yet. Tick the section you want to design above.</div>
      ) : ctx.yearSections.length === 0 ? (
        <div style={{ fontSize: 13, color: P.amber, background: P.amberL, borderRadius: 8, padding: "10px 12px" }}>No sections found for Year {year}. Add them under Coordinator Duties › All Sections › Sections & Subjects (section names start with the year, like III-A).</div>
      ) : (
        <div style={{ ...small }}>
          <div style={{ fontWeight: 700, color: P.navy, marginBottom: 6 }}>What the portal has for Year {year}{ctx.yearSections.length ? ", for the section" + (ctx.yearSections.length === 1 ? "" : "s") + " you are designing" : ""}</div>
          {ctx.yearSections.map(s => (
            <div key={s.id} style={{ padding: "3px 0" }}><b style={{ fontFamily: MONO, color: "#1a2230" }}>{s.name}</b> · {s.subjects.length} subjects, {s.subjects.filter(x => x.faculty.length === 0).length === 0 ? "all with faculty" : s.subjects.filter(x => x.faculty.length === 0).length + " without faculty"}</div>
          ))}
          <YearWarnings ctx={ctx} />
        </div>
      )}
    </>
  );
}

// ── Step: days and periods ───────────────────────────────────────────────────────────────
export function StepTimings({ a, set }) {
  const T = buildTimings(a);
  const problems = validateTimings(a);
  const parsed = parseTimeToken(a.firstStart);
  const setBreak = (i, patch) => set({ breaks: a.breaks.map((b, k) => (k === i ? { ...b, ...patch } : b)) });
  const days = a.days === 6 ? 6 : 5;
  return (
    <>
      <Q title="Working days">
        <Radio checked={days === 5} onChange={() => set({ days: 5 })}>Monday to Friday</Radio>
        <Radio checked={days === 6} onChange={() => set({ days: 6 })}>Monday to Saturday</Radio>
        {days === 6 && (
          <div style={{ marginLeft: 26, marginTop: 6 }}>
            <Radio checked={!a.satHalf} onChange={() => set({ satHalf: false })}>Saturday is a full day</Radio>
            <Radio checked={!!a.satHalf} onChange={() => set({ satHalf: true })}>Saturday is a half day, with <NumIn value={a.satPeriods} onChange={v => set({ satPeriods: v })} width={64} min={1} max={12} /> periods</Radio>
          </div>
        )}
      </Q>
      <Q title="Periods and timings" hint="Tell me the basics. I'll work out every period's time below, and you can change any of them.">
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div><span style={lbl}>Periods per day</span><NumIn value={a.periodsPerDay} onChange={v => set({ periodsPerDay: v })} width={90} min={1} max={12} /></div>
          <div>
            <span style={lbl}>First period starts at</span>
            <input value={a.firstStart} onChange={e => set({ firstStart: e.target.value })} style={{ ...inp, width: 110 }} placeholder="9:00" />
            {parsed !== null && <span style={{ ...small, marginLeft: 8 }}>= {fmtClock(parsed)}</span>}
          </div>
          <div><span style={lbl}>Normal period length (minutes)</span><NumIn value={a.periodMins} onChange={v => set({ periodMins: v })} width={90} min={5} max={240} /></div>
        </div>
      </Q>
      <Q title="Breaks" hint="Add the short break and the lunch break, if any. Say after which period each one comes and how long it is.">
        {a.breaks.map((b, i) => (
          <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "5px 0" }}>
            <select value={b.label} onChange={e => setBreak(i, { label: e.target.value })} style={{ ...inp, width: 150 }}>
              {["Break", "Short break", "Lunch"].map(x => <option key={x}>{x}</option>)}
            </select>
            <span style={small}>after period</span><NumIn value={b.after} onChange={v => setBreak(i, { after: v })} width={64} min={1} max={11} />
            <span style={small}>for</span><NumIn value={b.mins} onChange={v => setBreak(i, { mins: v })} width={70} min={1} max={180} /><span style={small}>minutes</span>
            <Btn small variant="ghost" onClick={() => set({ breaks: a.breaks.filter((_, k) => k !== i) })}>Remove</Btn>
          </div>
        ))}
        <Btn small variant="outline" onClick={() => set({ breaks: [...a.breaks, { after: 1, mins: 10, label: "Break" }] })}>+ Add a break</Btn>
      </Q>

      {problems.map((p, i) => <div key={i} style={{ fontSize: 13, color: p.level === "error" ? P.red : P.amber, background: p.level === "error" ? P.redL : P.amberL, borderRadius: 8, padding: "8px 12px", margin: "8px 0" }}>{p.text}</div>)}

      {!T.error && (
        <Q title="Here are the timings" hint="Is this right? If a period is longer or shorter than the rest (say the first period, or the afternoon ones), change its length here and the rest move along.">
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", minWidth: 420 }}>
              <thead><tr>{["Period", "From", "To", "Minutes"].map(h => <th key={h} style={{ textAlign: "left", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: P.gray, padding: "6px 14px 6px 0", borderBottom: "1.5px solid " + P.border }}>{h}</th>)}</tr></thead>
              <tbody>
                {T.slots.map((s, i) => s.brk ? (
                  <tr key={i} style={{ background: "#f6efdc" }}>
                    <td style={{ padding: "6px 14px 6px 8px", fontSize: 13, fontWeight: 700, color: "#6b4e16" }}>{s.label}</td>
                    <td style={{ padding: "6px 14px 6px 0", fontFamily: MONO, fontSize: 13 }}>{fmtClock(s.start)}</td>
                    <td style={{ padding: "6px 14px 6px 0", fontFamily: MONO, fontSize: 13 }}>{fmtClock(s.end)}</td>
                    <td style={{ padding: "4px 0" }}><NumIn value={a.breaks.find(b => Number(b.after) === T.slots[i - 1].n).mins} onChange={v => setBreak(a.breaks.findIndex(b => Number(b.after) === T.slots[i - 1].n), { mins: v })} width={70} min={1} max={180} /></td>
                  </tr>
                ) : (
                  <tr key={i}>
                    <td style={{ padding: "6px 14px 6px 8px", fontSize: 13, fontWeight: 700 }}>Period {s.n}</td>
                    <td style={{ padding: "6px 14px 6px 0", fontFamily: MONO, fontSize: 13 }}>{fmtClock(s.start)}</td>
                    <td style={{ padding: "6px 14px 6px 0", fontFamily: MONO, fontSize: 13 }}>{fmtClock(s.end)}</td>
                    <td style={{ padding: "4px 0" }}><NumIn value={(a.periodOverrides || {})[s.n] ?? a.periodMins} onChange={v => set({ periodOverrides: { ...(a.periodOverrides || {}), [s.n]: v } })} width={70} min={5} max={240} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ ...small, marginTop: 8 }}>The day ends at {fmtClock(T.dayEnd)}{days === 6 && a.satHalf ? "; Saturday uses the first " + periodsOn(a, 5) + " periods." : "."}</div>
          <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 9, background: a.timingsConfirmed ? P.greenL : P.bg, border: "1.5px solid " + (a.timingsConfirmed ? P.green : P.border) }}>
            <Check checked={a.timingsConfirmed} onChange={v => set({ timingsConfirmed: v })}><b>Yes, these timings are correct</b></Check>
          </div>
        </Q>
      )}
    </>
  );
}

// ── Step: together ───────────────────────────────────────────────────────────────────────
export function StepTogether({ a, set, ctx }) {
  const labs = ctx.subjects.filter(s => s.type !== "Theory");
  const toggleIn = (list, v) => (list.includes(v) ? list.filter(x => x !== v) : [...list, v]);
  return (
    <>
      <Q title="Labs that run at the same time (batches)" hint="If the batches of a section do different labs in the same slot (for example batch 1 in one lab and batch 2 in another), tick those labs together. They are then placed in the same periods, each with its own faculty. Leave this empty if every lab runs on its own.">
        {a.parallel.map((g, gi) => (
          <div key={gi} style={{ border: "1.5px solid " + P.border, borderRadius: 10, padding: "10px 12px", marginBottom: 8 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 18px" }}>
              {labs.map(l => <Check key={l.name} checked={g.includes(l.name)} onChange={() => set({ parallel: a.parallel.map((x, k) => (k === gi ? toggleIn(x, l.name) : x)) })}>{l.name}</Check>)}
            </div>
            <div style={{ marginTop: 6 }}><Btn small variant="ghost" onClick={() => set({ parallel: a.parallel.filter((_, k) => k !== gi) })}>Remove this group</Btn></div>
          </div>
        ))}
        {labs.length < 2 ? <div style={small}>This year has fewer than two lab subjects, so there is nothing to group.</div> : <Btn small variant="outline" onClick={() => set({ parallel: [...a.parallel, []] })}>+ Add a group of labs</Btn>}
      </Q>
      <Q title="Classes taken by several sections together" hint="An elective or a combined class that two or more sections attend at the same time with the same faculty. Pick the subject and the sections that join.">
        {ctx.yearSections.length < 2 && <div style={{ ...small, marginBottom: 8 }}>You are designing one section, so there is nothing to join. To design a joint class, go to the Year tab and tick two or more sections.</div>}
        {a.joint.map((j, ji) => {
          const subj = ctx.subjects.find(s => s.name === j.subject);
          const setJ = patch => set({ joint: a.joint.map((x, k) => (k === ji ? { ...x, ...patch } : x)) });
          return (
            <div key={ji} style={{ border: "1.5px solid " + P.border, borderRadius: 10, padding: "10px 12px", marginBottom: 8 }}>
              <select value={j.subject} onChange={e => setJ({ subject: e.target.value, sections: [] })} style={{ ...inp, width: 260 }}>
                <option value="">Choose a subject…</option>
                {ctx.subjects.filter(s => s.sections.length > 1).map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
              </select>
              {subj && <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 18px", marginTop: 6 }}>{subj.sections.map(sec => <Check key={sec.id} checked={j.sections.includes(sec.id)} onChange={() => setJ({ sections: toggleIn(j.sections, sec.id) })}>{sec.name}</Check>)}</div>}
              <div style={{ marginTop: 6 }}><Btn small variant="ghost" onClick={() => set({ joint: a.joint.filter((_, k) => k !== ji) })}>Remove</Btn></div>
            </div>
          );
        })}
        <Btn small variant="outline" onClick={() => set({ joint: [...a.joint, { subject: "", sections: [] }] })}>+ Add a joint class</Btn>
      </Q>
    </>
  );
}

// ── Step: faculty limits ─────────────────────────────────────────────────────────────────
export function StepLimits({ a, set }) {
  return (
    <>
      <Q title="Daily limits for a faculty member" hint="These are never broken. Lab and drawing sessions count together; a session counts once however many periods it has.">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 16 }}>
          <div><span style={lbl}>Most theory periods in a day</span><NumIn value={a.maxTheoryPerDay} onChange={v => set({ maxTheoryPerDay: v })} width={90} min={1} max={12} /></div>
          <div><span style={lbl}>Most lab sessions in a day</span><NumIn value={a.maxLabPerDay} onChange={v => set({ maxLabPerDay: v })} width={90} min={1} max={6} /></div>
          <div><span style={lbl}>Most periods in a day, lab and theory together</span><NumIn value={a.maxTotalPerDay} onChange={v => set({ maxTotalPerDay: v })} width={90} min={1} max={12} /></div>
        </div>
      </Q>
      <Q title="Back-to-back classes" hint="Can a faculty member have classes in consecutive periods?">
        <Radio checked={!!a.consecutive} onChange={() => set({ consecutive: true })}>Yes, up to <NumIn value={a.maxRun} onChange={v => set({ maxRun: v })} width={64} min={2} max={8} /> classes in a row (a lab session counts as one class)</Radio>
        <Radio checked={!a.consecutive} onChange={() => set({ consecutive: false })}>No, always a gap between two classes</Radio>
      </Q>
    </>
  );
}

// ── Step: availability ───────────────────────────────────────────────────────────────────
function SlotGrid({ a, cells, onToggle, onDay }) {
  const maxP = Number(a.periodsPerDay) || 1;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "separate", borderSpacing: 3 }}>
        <thead><tr><th /><>{Array.from({ length: maxP }, (_, p) => <th key={p} style={{ fontSize: 11, color: P.gray, fontWeight: 700, padding: "0 2px" }}>P{p + 1}</th>)}</></tr></thead>
        <tbody>
          {Array.from({ length: a.days }, (_, d) => (
            <tr key={d}>
              <td><button onClick={() => onDay(d)} style={{ fontSize: 12, fontWeight: 700, color: P.blue, background: "none", border: "none", cursor: "pointer", padding: "0 8px 0 0", fontFamily: "inherit" }}>{DAY_ABBR[d]}</button></td>
              {Array.from({ length: maxP }, (_, p) => p < periodsOn(a, d) ? (
                <td key={p}><button onClick={() => onToggle(d, p)} style={{ width: 34, height: 28, borderRadius: 6, border: "1.5px solid " + (cells[d + "-" + p] ? P.red : P.border), background: cells[d + "-" + p] ? P.red : "#fff", cursor: "pointer" }} aria-label={DAY_LONG[d] + " period " + (p + 1)} /></td>
              ) : <td key={p} />)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StepAvailability({ a, set, ctx }) {
  const rows = a.availability;
  const setRow = (i, patch) => set({ availability: rows.map((r, k) => (k === i ? { ...r, ...patch } : r)) });
  const toggle = (i, d, p) => { const c = { ...rows[i].cells }; const k = d + "-" + p; if (c[k]) delete c[k]; else c[k] = true; setRow(i, { cells: c }); };
  const day = (i, d) => {
    const c = { ...rows[i].cells };
    const all = Array.from({ length: periodsOn(a, d) }, (_, p) => p);
    const full = all.every(p => c[d + "-" + p]);
    all.forEach(p => { if (full) delete c[d + "-" + p]; else c[d + "-" + p] = true; });
    setRow(i, { cells: c });
  };
  return (
    <Q title="Faculty who are not free at some times" hint="For someone who can't come on certain days or periods, or who is shared with another department and is here only at certain times. Pick the person, then mark the slots. Press a day's name to mark the whole day. Skip this if there is nobody like that.">
      {rows.map((r, i) => (
        <div key={i} style={{ border: "1.5px solid " + P.border, borderRadius: 10, padding: "12px 14px", marginBottom: 10 }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
            <select value={r.phone} onChange={e => setRow(i, { phone: e.target.value })} style={{ ...inp, minWidth: 240 }}>
              <option value="">Choose a faculty member…</option>
              {ctx.people.map(p => <option key={p.phone} value={p.phone}>{p.name}</option>)}
            </select>
            <Btn small variant="ghost" onClick={() => set({ availability: rows.filter((_, k) => k !== i) })}>Remove</Btn>
          </div>
          <Radio checked={r.mode === "blocked"} onChange={() => setRow(i, { mode: "blocked" })}>Not available in the slots I mark (red)</Radio>
          <Radio checked={r.mode === "only"} onChange={() => setRow(i, { mode: "only" })}>Available <b>only</b> in the slots I mark (shared with another department)</Radio>
          <div style={{ marginTop: 8 }}><SlotGrid a={a} cells={r.cells || {}} onToggle={(d, p) => toggle(i, d, p)} onDay={d => day(i, d)} /></div>
        </div>
      ))}
      <Btn small variant="outline" onClick={() => set({ availability: [...rows, { phone: "", mode: "blocked", cells: {} }] })}>+ Add a faculty member</Btn>
    </Q>
  );
}

