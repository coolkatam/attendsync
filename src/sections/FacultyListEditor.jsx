// src/sections/FacultyListEditor.jsx
// An ordered list of faculty for one subject: the first row is the Main
// faculty (attendance and marks stay with them), the rest are Assisting
// faculty who share the timetable load. An empty string is a row not yet filled in.

import React from "react";
import { P, Btn } from "../components/UI";

export function cleanList(list) {
  const out = [];
  (list || []).forEach(p => { if (p && !out.includes(p)) out.push(p); });
  return out;
}

export default function FacultyListEditor({ list, onChange, facultyOptions }) {
  const rows = list.length ? list : [""];
  const setAt = (i, v) => { const n = rows.slice(); n[i] = v; onChange(n); };
  const removeAt = i => { const n = rows.filter((_, k) => k !== i); onChange(n.length ? n : [""]); };
  const makeMain = i => { const n = rows.slice(); const [x] = n.splice(i, 1); n.unshift(x); onChange(n); };

  return (
    <div>
      {rows.map((p, i) => (
        <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
          <span style={{ width: 158, fontSize: 12, fontWeight: 700, borderRadius: 20, padding: "5px 12px", textAlign: "center", boxSizing: "border-box", background: i === 0 ? P.blueL : P.bg, color: i === 0 ? P.blue : P.gray, border: "1px solid " + (i === 0 ? "transparent" : P.border) }}>
            {i === 0 ? "Main faculty" : "Assisting faculty " + i}
          </span>
          <select value={p} onChange={e => setAt(i, e.target.value)} aria-label={i === 0 ? "Main faculty" : "Assisting faculty " + i}
            style={{ flex: 1, minWidth: 220, border: "1px solid " + P.border, borderRadius: 8, padding: "9px 12px", fontSize: 14, fontFamily: "inherit", background: "#fff" }}>
            <option value="">— select faculty —</option>
            {facultyOptions.filter(o => o.value === p || !rows.includes(o.value)).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {i > 0 && p && (
            <button type="button" onClick={() => makeMain(i)}
              style={{ border: "1px solid " + P.border, background: "#fff", borderRadius: 8, padding: "7px 12px", fontSize: 12.5, fontWeight: 600, color: P.blue, cursor: "pointer", fontFamily: "inherit" }}>
              Make main
            </button>
          )}
          {(rows.length > 1 || p) && (
            <button type="button" onClick={() => removeAt(i)} aria-label="Remove this faculty"
              style={{ border: "1px solid " + P.border, background: "#fff", borderRadius: 8, width: 34, height: 34, color: P.red, cursor: "pointer", fontSize: 15, fontFamily: "inherit" }}>
              ×
            </button>
          )}
        </div>
      ))}
      <Btn small variant="outline" onClick={() => onChange([...rows, ""])}>+ Add faculty</Btn>
      <div style={{ fontSize: 12, color: P.gray, marginTop: 8, lineHeight: 1.5 }}>
        The first faculty is the Main faculty, who marks attendance and enters marks. Assisting faculty share the subject's timetable workload.
      </div>
    </div>
  );
}
