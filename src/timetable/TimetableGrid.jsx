// src/timetable/TimetableGrid.jsx
// The days x periods table. Editable on the faculty's own screen, read-only
// for the HoD workload view and for printing.

import React from "react";
import { P } from "../components/UI";
import { DAYS, TL, TYPE_STYLE, labelsOf } from "./timetableModel";

const MONO = "'IBM Plex Mono', monospace";

export default function TimetableGrid({ model, editable, sel, onSelect, colCtl, onTimeCommit, onDeleteCol, compact }) {
  const labs = labelsOf(model);
  const n = model.slots.length;
  const h = compact ? 62 : 80;

  function cellBox(extra) {
    return {
      display: "flex", flexDirection: "column", justifyContent: "center", gap: 1, width: "100%", height: h,
      padding: compact ? "6px 9px" : "8px 11px", borderRadius: 10, border: "1.5px solid transparent",
      textAlign: "left", overflow: "hidden", fontFamily: "inherit", fontSize: "inherit", boxSizing: "border-box", ...extra,
    };
  }

  function renderCell(d, i, c, span) {
    const isSel = !!sel && sel.d === d && sel.i === i;
    const Tag = editable ? "button" : "div";
    const common = editable ? { type: "button", onClick: () => onSelect(d, i) } : {};
    const selStyle = isSel ? { outline: "2.5px solid " + P.blue, outlineOffset: 1 } : {};
    const cur = editable ? { cursor: "pointer" } : {};

    if (!c) {
      return (
        <td key={i}>
          <Tag {...common} aria-label={editable ? DAYS[d][1] + " " + labs[i].text + ": free" : undefined}
            style={cellBox({ background: "transparent", border: "1.5px dashed " + P.border, color: P.gray, alignItems: "center", fontSize: 12.5, ...cur, ...selStyle })}>
            Free
          </Tag>
        </td>
      );
    }
    if (c.type === "lunch") {
      return (
        <td key={i} colSpan={span}>
          <Tag {...common} aria-label={editable ? DAYS[d][1] + " " + labs[i].text + ": lunch" : undefined}
            style={cellBox({
              backgroundImage: "repeating-linear-gradient(135deg,#f1f4f7 0 9px,#e7ecf1 9px 18px)", color: P.gray,
              alignItems: "center", fontWeight: 600, fontSize: 11.5, letterSpacing: "0.16em", textTransform: "uppercase",
              border: "1.5px dashed " + P.border, ...cur, ...selStyle,
            })}>
            Lunch
          </Tag>
        </td>
      );
    }
    const ts = TYPE_STYLE[c.type];
    const meta = [c.section, c.room].filter(Boolean).join(" · ");
    return (
      <td key={i} colSpan={span}>
        <Tag {...common} aria-label={editable ? DAYS[d][1] + " " + labs[i].text + ": " + (c.subject || "no subject yet") : undefined}
          style={cellBox({ background: ts.bg, color: ts.fg, ...cur, ...selStyle })}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", opacity: 0.8 }}>
            {TL[c.type]}{span > 1 ? " · " + span + " periods" : ""}
          </span>
          <span style={{ fontSize: compact ? 13 : 14.5, fontWeight: 600, lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontStyle: c.subject ? "normal" : "italic", opacity: c.subject ? 1 : 0.7 }}>
            {c.subject || "Add subject"}
          </span>
          {meta && <span style={{ fontFamily: MONO, fontSize: 11.5, opacity: 0.85, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{meta}</span>}
        </Tag>
      </td>
    );
  }

  const rows = DAYS.map((day, d) => {
    const tds = [];
    let covered = -1;
    for (let i = 0; i < n; i++) {
      if (i <= covered) continue;
      const c = model.cells[d][i];
      const span = c ? Math.min(c.span, n - i) : 1;
      if (c) covered = i + span - 1;
      tds.push(renderCell(d, i, c, span));
    }
    return (
      <tr key={d}>
        <th scope="row" style={{ width: 86, textAlign: "left", verticalAlign: "middle", position: "sticky", left: 0, background: "#fff", zIndex: 1, paddingRight: 6, fontWeight: 400 }}>
          <span style={{ display: "block", fontWeight: 700, fontSize: 14.5 }}>{day[0]}</span>
          <span style={{ display: "block", fontSize: 11.5, color: P.gray }}>{day[1]}</span>
        </th>
        {tds}
      </tr>
    );
  });

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "separate", borderSpacing: 6, width: "100%", tableLayout: "fixed", minWidth: 92 + n * 112 }}>
        <thead>
          <tr>
            <th style={{ width: 86 }} />
            {model.slots.map((s, i) => (
              <th key={i} scope="col" style={{ padding: "2px 4px 6px", textAlign: "left", fontSize: 12, color: P.gray, position: "relative", verticalAlign: "bottom", fontWeight: 600 }}>
                <span style={{ display: "block", fontFamily: MONO, fontWeight: 600, fontSize: 13, color: labs[i].lunch ? P.gray : "#1a2230", textTransform: labs[i].lunch ? "uppercase" : "none", letterSpacing: labs[i].lunch ? "0.1em" : 0 }}>{labs[i].text}</span>
                <span
                  contentEditable={!!editable}
                  suppressContentEditableWarning
                  spellCheck={false}
                  title={editable ? "Click to edit this timing" : undefined}
                  onBlur={editable ? e => onTimeCommit(i, e.currentTarget.textContent) : undefined}
                  onKeyDown={editable ? e => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } } : undefined}
                  style={{ display: "inline-block", fontFamily: MONO, fontSize: 11.5, minWidth: "4ch", borderBottom: editable ? "1px dotted " + P.gray : "none", cursor: editable ? "text" : "default" }}>
                  {s.time}
                </span>
                {colCtl && (
                  <button type="button" onClick={() => onDeleteCol(i)} disabled={n <= 1} aria-label={"Delete column " + labs[i].text}
                    style={{ position: "absolute", top: 0, right: 2, width: 20, height: 20, borderRadius: "50%", border: "1px solid " + P.border, background: "#fff", color: P.red, cursor: n <= 1 ? "not-allowed" : "pointer", lineHeight: 1, padding: 0, fontSize: 14 }}>
                    ×
                  </button>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{rows}</tbody>
      </table>
    </div>
  );
}

export function TypeLegend() {
  const item = (k, label) => (
    <span key={k} style={{ display: "inline-flex", alignItems: "center" }}>
      <i style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, marginRight: 7, background: TYPE_STYLE[k].dot }} />{label}
    </span>
  );
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 10, fontSize: 12.5, color: P.gray }}>
      {item("theory", "Theory")}{item("lab", "Lab")}{item("drawing", "Drawing")}{item("other", "Other (mentoring, duty)")}{item("lunch", "Lunch")}
      <span style={{ display: "inline-flex", alignItems: "center" }}>
        <i style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, marginRight: 7, border: "1.5px dashed " + P.gray }} />Free
      </span>
    </div>
  );
}
