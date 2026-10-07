// src/timetable/WeekCards.jsx
// The week as six soft-coloured day cards (Monday to Saturday). Each lists that day's classes and duties in time
// order with the day's total periods at the bottom. Published classes carry a small padlock; clashes show in red.

import React from "react";
import { P } from "../components/UI";
import { DAYS, DAY_COLORS, TL, TYPE_STYLE, fmtSpan, metaOf } from "./timetableModel";

const MONO = "'IBM Plex Mono', monospace";

function Lock() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-label="Published, locked" style={{ flexShrink: 0 }}>
      <rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function Entry({ e, ink, editable, onEdit }) {
  const bad = e.conflicts.length > 0;
  const canEdit = editable && !e.locked;
  const Tag = canEdit ? "button" : "div";
  const other = e.conflicts[0];
  return (
    <Tag type={canEdit ? "button" : undefined} onClick={canEdit ? () => onEdit(e) : undefined}
      style={{
        display: "block", width: "100%", textAlign: "left", boxSizing: "border-box", fontFamily: "inherit", color: "#1a2230",
        background: "rgba(255,255,255,0.78)", borderRadius: 10, padding: "8px 10px", cursor: canEdit ? "pointer" : "default",
        border: bad ? "1.5px solid " + P.red : "1.5px solid rgba(255,255,255,0.9)", opacity: e.excluded ? 0.8 : 1,
      }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: MONO, fontSize: 12, fontWeight: 600, color: ink }}>
        <i style={{ width: 8, height: 8, borderRadius: 3, background: TYPE_STYLE[e.type].dot, flexShrink: 0 }} />
        {fmtSpan(e.start, e.end)}
        {e.locked && <span style={{ marginLeft: "auto", display: "inline-flex" }}><Lock /></span>}
      </div>
      <div style={{ fontWeight: 700, fontSize: 13.5, lineHeight: 1.3, marginTop: 3, wordBreak: "break-word" }}>
        {e.subject || TL[e.type]}{e.asst && <span style={{ fontWeight: 500, color: P.gray }}> (Asst.)</span>}
      </div>
      {(metaOf(e) || e.type !== "theory") && (
        <div style={{ fontSize: 12, color: P.gray, marginTop: 1, lineHeight: 1.35 }}>
          {[metaOf(e), e.type === "lab" ? "Lab" : e.type === "drawing" ? "Drawing" : ""].filter(Boolean).join(" · ")}
        </div>
      )}
      {bad && (
        <div style={{ fontSize: 11.5, fontWeight: 600, color: P.red, marginTop: 4, lineHeight: 1.35 }}>
          Overlaps {other.subject || TL[other.type]} ({fmtSpan(other.start, other.end)}){e.excluded ? ". Not counted until fixed" : ""}
        </div>
      )}
    </Tag>
  );
}

export default function WeekCards({ week, editable, onAdd, onEdit, compact }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(" + (compact ? 150 : 176) + "px, 1fr))", gap: compact ? 8 : 12, alignItems: "stretch" }}>
      {DAYS.map((day, d) => {
        const c = DAY_COLORS[d];
        const list = week[d];
        const total = list.reduce((n, e) => n + (e.excluded ? 0 : e.periods), 0);
        return (
          <section key={day[0]} aria-label={day[1]} style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
            <div style={{ background: c.head, color: c.ink, borderRadius: 12, padding: "10px 12px", textAlign: "center", fontWeight: 800, fontSize: compact ? 14 : 16, letterSpacing: "0.05em", textTransform: "uppercase" }}>{day[1]}</div>
            <div style={{ background: c.body, borderRadius: 12, padding: 8, display: "flex", flexDirection: "column", gap: 8, flex: 1, minHeight: compact ? 90 : 220 }}>
              {list.length === 0 && <div style={{ color: P.gray, fontSize: 12.5, textAlign: "center", padding: "14px 4px" }}>Nothing scheduled</div>}
              {list.map(e => <Entry key={e.id} e={e} ink={c.ink} editable={editable} onEdit={onEdit} />)}
              {editable && (
                <button type="button" onClick={() => onAdd(d)}
                  style={{ marginTop: "auto", border: "1.5px dashed " + c.ink + "55", background: "transparent", color: c.ink, borderRadius: 10, padding: "8px 6px", fontWeight: 700, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>
                  + Add duty or class
                </button>
              )}
            </div>
            <div style={{ background: c.head, color: c.ink, borderRadius: 12, padding: "8px 12px", fontWeight: 800, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.03em" }}>
              Total: {total} {total === 1 ? "period" : "periods"}
            </div>
          </section>
        );
      })}
    </div>
  );
}
