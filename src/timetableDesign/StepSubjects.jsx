// src/timetableDesign/StepSubjects.jsx
// "Subjects and periods": how many periods a week for every subject, and for the activities that are not subjects in
// the portal (library, tutorials, sports, clubs and anything else). A live total shows, for every section, how many of
// the week's periods the numbers use. Options on each row cover a different number for one section and, for classes
// run on an outside trainer's own timetable (CRT, say), fixed days and periods.

import React, { useState } from "react";
import { P, Btn } from "../components/UI";
import { newExtra, DAY_LONG, num, periodsOn } from "./designModel";
import { Q, Radio, Check, NumIn, YearWarnings, inp, small, lbl } from "./steps";

const MONO = "'IBM Plex Mono', monospace";
const OTHER_PRESETS = [{ name: "Library", label: "Library" }, { name: "Tutorials", label: "Tutorials" }, { name: "Sports", label: "Sports" }, { name: "Club activities", label: "Club activities / Misc" }];
const th = { textAlign: "left", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: P.gray, padding: "6px 10px 6px 0", borderBottom: "1.5px solid " + P.border };
const td = { padding: "8px 10px 8px 0", borderBottom: "1px solid " + P.border, verticalAlign: "middle" };

// day and period dropdowns, one row for each period of the week, for each section
function SlotsEditor({ a, sections, countOf, fixed, onChange }) {
  return (
    <div>
      {sections.map((sec, si) => {
        const count = Math.min(12, Math.max(0, Math.floor(countOf(sec.id))));
        const rows = (fixed || {})[sec.id] || [];
        const setRow = (k, patch) => { const r = Array.from({ length: count }, (_, i) => rows[i] || { day: "", period: "" }); r[k] = { ...r[k], ...patch }; onChange({ ...(fixed || {}), [sec.id]: r }); };
        return (
          <div key={sec.id} style={{ padding: "8px 0", borderTop: si ? "1px dashed " + P.border : "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
              <b style={{ fontFamily: MONO, fontSize: 13 }}>{sec.name}</b>
              <span style={small}>{count} slot{count === 1 ? "" : "s"}</span>
              {si === 0 && sections.length > 1 && count > 0 && <Btn small variant="ghost" onClick={() => { const f = { ...(fixed || {}) }; sections.forEach(o => { f[o.id] = rows.slice(0, count).map(r => ({ ...r })); }); onChange(f); }}>Use these for every section</Btn>}
            </div>
            {Array.from({ length: count }, (_, k) => {
              const r = rows[k] || { day: "", period: "" };
              return (
                <div key={k} style={{ display: "flex", gap: 8, alignItems: "center", padding: "3px 0" }}>
                  <span style={{ ...small, width: 48 }}>Slot {k + 1}</span>
                  <select value={r.day} onChange={e => setRow(k, { day: e.target.value })} style={{ ...inp, width: 140 }}>
                    <option value="">Day…</option>{Array.from({ length: a.days }, (_, d) => <option key={d} value={d}>{DAY_LONG[d]}</option>)}
                  </select>
                  <select value={r.period} onChange={e => setRow(k, { period: e.target.value })} style={{ ...inp, width: 130 }}>
                    <option value="">Period…</option>{Array.from({ length: Number(a.periodsPerDay) || 0 }, (_, p) => <option key={p} value={p + 1}>Period {p + 1}</option>)}
                  </select>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// one total for everything ticked, in one place. Sections that differ show a range and the detail underneath.
function TotalBar({ totals, fallback }) {
  if (!totals.length) return <div style={{ ...small, margin: "0 0 14px" }}>A week has {fallback || "?"} periods in each section. Fix the timings in Days and periods to see the totals.</div>;
  const have = totals[0].have;
  const needs = totals.map(t => t.need), lo = Math.min(...needs), hi = Math.max(...needs);
  const over = hi > have, short = lo < have;
  const badge = over ? { text: (hi - have) + " too many: reduce something", bg: P.redL, fg: P.red }
    : short ? { text: (have - lo) + " more to allot: no blank periods allowed", bg: P.amberL, fg: P.amber }
    : { text: "Every period is filled", bg: P.greenL, fg: P.green };
  return (
    <div style={{ border: "1.5px solid " + P.border, borderRadius: 10, padding: "12px 16px", margin: "0 0 16px", background: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: P.navy }}>
          Total periods covered: <span style={{ fontFamily: MONO }}>{lo === hi ? lo : lo + " to " + hi}</span> <span style={{ color: P.gray, fontWeight: 600 }}>out of {have}</span>
        </div>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: badge.fg, background: badge.bg, borderRadius: 20, padding: "5px 14px" }}>{badge.text}</span>
      </div>
      {lo !== hi && <div style={{ fontSize: 12, color: P.gray, marginTop: 6 }}>The sections you ticked differ: {totals.map(t => t.s.name + " " + t.need).join(", ")}.</div>}
    </div>
  );
}

export default function StepSubjects({ a, set, ctx, calc }) {
  const [open, setOpen] = useState({});
  const [custom, setCustom] = useState("");
  const toggle = key => setOpen({ ...open, [key]: !open[key] });

  const setLoad = (name, patch) => set({ loads: { ...a.loads, [name]: { ...(a.loads[name] || {}), ...patch } } });
  const setPer = (name, sid, v) => setLoad(name, { perSection: { ...((a.loads[name] || {}).perSection || {}), [sid]: v } });

  const extras = a.extras || [];
  const xOf = name => extras.find(x => x.name.toLowerCase() === name.toLowerCase());
  const upsertX = (name, patch) => {
    const cur = xOf(name);
    if (cur) set({ extras: extras.map(x => (x === cur ? { ...x, ...patch } : x)) });
    else set({ extras: [...extras, { ...newExtra(name), periods: 0, ...patch }] });
  };
  const customs = extras.filter(x => !OTHER_PRESETS.some(p => p.name.toLowerCase() === x.name.toLowerCase()));

  // the live total: how many of each section's periods these numbers use
  const spec = calc && calc.spec;
  const totals = spec ? spec.sections.map(s => ({ s, need: spec.units.filter(u => u.sectionIds.includes(s.id)).reduce((t, u) => t + u.size, 0), have: spec.P.reduce((t, n) => t + n, 0) })) : [];
  const haveDefault = Array.from({ length: a.days }, (_, d) => periodsOn(a, d)).reduce((t, n) => t + n, 0);

  const subjectRow = s => {
    const l = a.loads[s.name] || {};
    const theory = s.type === "Theory";
    const countOf = sid => num((l.perSection || {})[sid], num(l.periods, 0));
    return (
      <React.Fragment key={s.name}>
        <tr>
          <td style={td}><b style={{ fontSize: 14 }}>{s.name}</b><div style={{ fontSize: 11.5, color: P.gray }}>in {s.sections.length} section{s.sections.length === 1 ? "" : "s"}{l.mode === "fixed" ? " · fixed slots" : ""}</div></td>
          <td style={{ ...td, fontSize: 13, color: P.gray }}>{s.type}</td>
          <td style={td}><NumIn value={l.periods} onChange={v => setLoad(s.name, { periods: v })} width={76} min={0} max={30} /></td>
          <td style={td}>
            {theory ? (
              <select value={String(l.block || 1)} onChange={e => setLoad(s.name, { block: Number(e.target.value) })} style={{ ...inp, width: 200 }}>
                <option value="1">Single periods</option><option value="2">Double periods (2 together)</option>
              </select>
            ) : (
              <span style={{ fontSize: 13 }}><NumIn value={l.block} onChange={v => setLoad(s.name, { block: v })} width={60} min={1} max={6} /> <span style={small}>periods per session</span>
                {(() => { const per = num(l.periods, 0), b = Math.max(1, num(l.block, 3)); if (!per) return null; if (per <= b) return <div style={{ fontSize: 11.5, marginTop: 3, color: P.green, fontWeight: 600 }}>= 1 session of {per} period{per === 1 ? "" : "s"} a week</div>; const full = Math.floor(per / b), rem = per % b; return <div style={{ fontSize: 11.5, marginTop: 3, color: rem ? P.amber : P.green, fontWeight: 600 }}>= {full + " session" + (full === 1 ? "" : "s") + " of " + b}{rem ? " + 1 shorter session of " + rem : ""} a week</div>; })()}
              </span>
            )}
          </td>
          <td style={td}><Check checked={l.avoidFirst} onChange={v => setLoad(s.name, { avoidFirst: v })}>avoid</Check></td>
          <td style={td}><Check checked={l.avoidLast} onChange={v => setLoad(s.name, { avoidLast: v })}>avoid</Check></td>
          <td style={{ ...td, textAlign: "right" }}><Btn small variant="ghost" onClick={() => toggle("s:" + s.name)}>{open["s:" + s.name] ? "Hide options" : "Options"}</Btn></td>
        </tr>
        {open["s:" + s.name] && (
          <tr><td colSpan={7} style={{ padding: "10px 12px 14px", background: P.bg, borderBottom: "1px solid " + P.border }}>
            {s.sections.length > 1 && (
              <div style={{ marginBottom: 12 }}>
                <span style={lbl}>A different number of periods for a section (leave blank to use {l.periods ?? "the number above"})</span>
                <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                  {s.sections.map(sec => <div key={sec.id}><div style={{ ...small, marginBottom: 3 }}>{sec.name}</div><NumIn value={(l.perSection || {})[sec.id] ?? ""} onChange={v => setPer(s.name, sec.id, v)} width={90} min={0} max={30} placeholder={String(l.periods ?? "")} /></div>)}
                </div>
              </div>
            )}
            <span style={lbl}>How should it be placed?</span>
            <Radio checked={l.mode !== "fixed"} onChange={() => setLoad(s.name, { mode: "flex" })}>Flexible: the portal places it wherever it fits</Radio>
            <Radio checked={l.mode === "fixed"} onChange={() => setLoad(s.name, { mode: "fixed" })}>Fixed: I will give the day and period myself (for example an outside trainer's own timetable)</Radio>
            {l.mode === "fixed" && <div style={{ marginTop: 8 }}><SlotsEditor a={a} sections={s.sections} countOf={countOf} fixed={l.fixed} onChange={f => setLoad(s.name, { fixed: f })} /></div>}
          </td></tr>
        )}
      </React.Fragment>
    );
  };

  const otherRow = (name, label, removable) => {
    const x = xOf(name) || { ...newExtra(name), periods: 0 };
    const key = "x:" + name;
    const countOf = sid => num((x.perSection || {})[sid], num(x.periods, 0));
    return (
      <React.Fragment key={name}>
        <tr>
          <td style={td}><b style={{ fontSize: 14 }}>{label}</b><div style={{ fontSize: 11.5, color: P.gray }}>{x.mode === "fixed" ? "fixed slots" : "every section"}</div></td>
          <td style={td}><NumIn value={x.periods} onChange={v => upsertX(name, { periods: v })} width={76} min={0} max={30} /></td>
          <td style={td}>
            <select value={String(x.block || 1)} onChange={e => upsertX(name, { block: Number(e.target.value) })} style={{ ...inp, width: 200 }}>
              <option value="1">Single periods</option><option value="2">2 periods together</option><option value="3">3 periods together</option>
            </select>
          </td>
          <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
            <Btn small variant="ghost" onClick={() => toggle(key)}>{open[key] ? "Hide options" : "Options"}</Btn>
            {removable && <Btn small variant="ghost" onClick={() => set({ extras: extras.filter(e => e !== xOf(name)) })} style={{ marginLeft: 6 }}>Remove</Btn>}
          </td>
        </tr>
        {open[key] && (
          <tr><td colSpan={4} style={{ padding: "10px 12px 14px", background: P.bg, borderBottom: "1px solid " + P.border }}>
            {ctx.yearSections.length > 1 && (
              <div style={{ marginBottom: 12 }}>
                <span style={lbl}>A different number of periods for a section (leave blank to use {x.periods || "the number above"})</span>
                <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                  {ctx.yearSections.map(sec => <div key={sec.id}><div style={{ ...small, marginBottom: 3 }}>{sec.name}</div><NumIn value={(x.perSection || {})[sec.id] ?? ""} onChange={v => upsertX(name, { perSection: { ...(x.perSection || {}), [sec.id]: v } })} width={90} min={0} max={30} placeholder={String(x.periods || "")} /></div>)}
                </div>
              </div>
            )}
            <span style={lbl}>How should it be placed?</span>
            <Radio checked={x.mode !== "fixed"} onChange={() => upsertX(name, { mode: "flex" })}>Flexible: the portal places it wherever it fits</Radio>
            <Radio checked={x.mode === "fixed"} onChange={() => upsertX(name, { mode: "fixed" })}>Fixed: I will give the day and period myself</Radio>
            {x.mode === "fixed" && <div style={{ marginTop: 8 }}><SlotsEditor a={a} sections={ctx.yearSections} countOf={countOf} fixed={x.fixed} onChange={f => upsertX(name, { fixed: f })} /></div>}
            <div style={{ marginTop: 12 }}>
              <span style={lbl}>Who takes it?</span>
              <Radio checked={!x.sameTrainer} onChange={() => upsertX(name, { sameTrainer: false })}>Not the same for every section, or it doesn't matter</Radio>
              <Radio checked={!!x.sameTrainer} onChange={() => upsertX(name, { sameTrainer: true })}>The same faculty or trainer takes all sections (their slots can't overlap across sections: I check that)</Radio>
              {x.sameTrainer && (
                <div style={{ marginLeft: 26, marginTop: 6, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <select value={x.trainer.kind === "portal" ? x.trainer.phone : x.trainer.kind === "ext" ? "__ext" : ""} onChange={e => { const v = e.target.value; upsertX(name, { trainer: v === "__ext" ? { kind: "ext", phone: "", name: x.trainer.name || "" } : v ? { kind: "portal", phone: v, name: "" } : { kind: "none", phone: "", name: "" } }); }} style={{ ...inp, minWidth: 240 }}>
                    <option value="">Choose…</option>
                    {ctx.people.map(p => <option key={p.phone} value={p.phone}>{p.name}</option>)}
                    <option value="__ext">Someone from outside the college</option>
                  </select>
                  {x.trainer.kind === "ext" && <input value={x.trainer.name} onChange={e => upsertX(name, { trainer: { kind: "ext", phone: "", name: e.target.value } })} placeholder="Trainer's name" style={{ ...inp, width: 220 }} />}
                </div>
              )}
            </div>
          </td></tr>
        )}
      </React.Fragment>
    );
  };

  return (
    <>
      <YearWarnings ctx={ctx} />
      <TotalBar totals={totals} fallback={haveDefault} />

      <Q title="How many periods a week for each subject?" hint="One number per subject applies to every section that has it. Use Options to give one section a different number, or to fix its days and periods. By “hours” I always mean periods. I've filled in usual values: change what is different.">
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 800 }}>
            <thead><tr>{["Subject", "Type", "Periods a week", "Class pattern", "Avoid first period", "Avoid last period", ""].map((h, i) => <th key={i} style={th}>{h}</th>)}</tr></thead>
            <tbody>{ctx.subjects.map(subjectRow)}</tbody>
          </table>
        </div>
        <div style={{ ...small, maxWidth: 560, marginTop: 10 }}>“Avoid” is a wish, not a rule: if the timetable can't be built without it, I'll bend it and tell you where.</div>
      </Q>

      <Q title="Other periods in the timetable" hint="Activities that are not subjects in the portal. Put the periods a week for each section; leave 0 if there are none. Use Options if one trainer takes all sections, or if the slots are fixed.">
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 700 }}>
            <thead><tr>{["Activity", "Periods a week", "Pattern", ""].map((h, i) => <th key={i} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {OTHER_PRESETS.map(p => otherRow(p.name, p.label, false))}
              {customs.map(x => otherRow(x.name, x.name, true))}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
          <input value={custom} onChange={e => setCustom(e.target.value)} placeholder="Another activity (type its name, e.g. CRT)" style={{ ...inp, width: 330 }} />
          <Btn small onClick={() => { const n = custom.trim(); if (n && !xOf(n) && !OTHER_PRESETS.some(p => p.name.toLowerCase() === n.toLowerCase())) { upsertX(n, { periods: 1 }); setCustom(""); } }}>Add</Btn>
        </div>
      </Q>

      <Q title="Labs and drawing">
        <Check checked={a.labOnceADay !== false} onChange={v => set({ labOnceADay: v })}>One lab session a day for a section (labs that run together as batches count as one)</Check>
        <Check checked={a.labAcrossBreak} onChange={v => set({ labAcrossBreak: v })}>A lab session may continue across a break</Check>
        <div style={{ marginTop: 8 }}><span style={lbl}>Preferred time for labs</span>
          <select value={a.labPref} onChange={e => set({ labPref: e.target.value })} style={{ ...inp, width: 220 }}>
            <option value="any">No preference</option><option value="morning">Morning</option><option value="afternoon">Afternoon</option>
          </select>
        </div>
      </Q>
      <Q title="Same subject twice in one day?" hint="Usually a subject comes once a day. Switch this on only if you are happy for a subject to come twice in a day for a section.">
        <Check checked={a.repeatSameDay} onChange={v => set({ repeatSameDay: v })}>Allow the same subject twice in a day</Check>
      </Q>
    </>
  );
}
