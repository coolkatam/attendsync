
// src/marks/InternalMarksPage.jsx
// Faculty-facing internal marks entry.
// Tabs per subject: MID-1 | MID-2 | Assignment | Result  (Theory/Drawing)
//                  Lab Internal | Result                  (Lab)

import { useState, useEffect, useCallback } from "react";
import { collection, doc, getDoc, onSnapshot, setDoc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import {
  calcPartA, calcQ, calcPartBConv, calcMidTotal, calcPartBRaw,
  calcFinalInternal, calcAssignment, calcLabTotal,
  calcDrawingMidConv, calcDrawingMidRaw,
  validateTheory, validateLab,
  isLabSubject, isDrawingSubject,
  THEORY_MAX_TOTAL, LAB_MAX_TOTAL, DRAWING_MAX_TOTAL,
} from "./marksCalc";

const BLUE = "#1a56a0";

// Hide the up/down spinner arrows on number inputs across this whole page (Chrome/Safari + Firefox)
function NoSpinnerStyle() {
  return (
    <style>{`
      .marks-input::-webkit-outer-spin-button,
      .marks-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
      .marks-input[type=number] { -moz-appearance: textfield; }
    `}</style>
  );
}

// ── Tiny helpers ──────────────────────────────────────────────────────────────
function CellInput({ value, onChange, readOnly, warn }) {
  return (
    <input
      type="number" min="0" max="10"
      className="marks-input"
      value={value === undefined || value === null ? "" : value}
      onChange={e => onChange(e.target.value === "" ? "" : Number(e.target.value))}
      readOnly={readOnly}
      style={{
        width: 36, height: 28, border: readOnly ? "1px solid #e0e0e0" : "1px solid #b0c4de",
        borderRadius: 4, textAlign: "center", fontSize: 14, fontWeight: 600,
        background: readOnly ? "#f5f5f5" : warn ? "#fee2e2" : "#fff",
        color: readOnly ? "#888" : "#222",
        cursor: readOnly ? "default" : "text",
        padding: 2, boxSizing: "border-box",
      }}
    />
  );
}

function AutoCell({ value }) {
  return (
    <td style={{ padding: "3px 5px", textAlign: "center", fontWeight: 600, fontSize: 11, background: "#E6F1FB", color: "#185FA5", border: "0.5px solid #d0e4f8" }}>
      {value !== "" ? value : ""}
    </td>
  );
}

function GrandCell({ value }) {
  return (
    <td style={{ padding: "3px 5px", textAlign: "center", fontWeight: 600, fontSize: 12, background: "#EEEDFE", color: "#26215C", border: "0.5px solid #c5c2f0" }}>
      {value !== "" ? value : ""}
    </td>
  );
}

// ── Theory MID sheet ──────────────────────────────────────────────────────────
function TheoryMidSheet({ students, midData, onChange, locked }) {
  const td = { border: "0.5px solid var(--border)", padding: 0, textAlign: "center" };
  const th = (bg, color) => ({ padding: "4px 5px", textAlign: "center", fontWeight: 500, fontSize: 11, background: bg, color: color, border: "0.5px solid var(--border)", whiteSpace: "nowrap" });

  function get(roll, field) { return midData?.[roll]?.[field] ?? ""; }
  function set(roll, field, val) { onChange(roll, field, val); }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", fontSize: 11, minWidth: 700 }}>
        <thead>
          <tr>
            <th rowSpan={2} style={th("var(--surface-1)", "var(--text-muted)")}>Roll</th>
            <th rowSpan={2} style={{ ...th("var(--surface-1)", "var(--text-muted)"), textAlign: "left", minWidth: 100 }}>Name</th>
            <th colSpan={6} style={th("#E1F5EE", "#085041")}>Part A (max 10)</th>
            <th colSpan={19} style={th("#E6F1FB", "#0C447C")}>Part B — best of pairs → converted to 15</th>
            <th rowSpan={2} style={th("#EEEDFE", "#534AB7")}>Total (25)</th>
          </tr>
          <tr>
            {["1A","1B","1C","1D","1E"].map(l => <th key={l} style={th("#E1F5EE","#0F6E56")}>{l}</th>)}
            <th style={th("#9FE1CB","#085041")}>A</th>
            {[2,3,4,5,6,7].map(n => (
              <>
                <th key={`${n}a`} style={th("#E6F1FB","#185FA5")}>{n}A</th>
                <th key={`${n}b`} style={th("#E6F1FB","#185FA5")}>{n}B</th>
                <th key={`q${n}`} style={th("#B5D4F4","#0C447C")}>Q{n}</th>
              </>
            ))}
            <th style={th("#85B7EB","#042C53")}>Cvt</th>
          </tr>
        </thead>
        <tbody>
          {students.map((st, i) => {
            const m = midData?.[st.roll] || {};
            const pA = calcPartA(m);
            const qs = [2,3,4,5,6,7].map(n => calcQ(m[`b${n}a`], m[`b${n}b`]));
            const pBc = Math.round(calcPartBConv(m) * 10) / 10;
            const total = Math.round(pA + pBc);
            return (
              <tr key={st.roll} style={{ background: i % 2 === 0 ? "transparent" : "var(--surface-1)" }}>
                <td style={{ ...td, padding: "3px 6px", fontSize: 10, whiteSpace: "nowrap" }}>{st.roll}</td>
                <td style={{ ...td, padding: "3px 6px", textAlign: "left", whiteSpace: "nowrap" }}>{st.name || ""}</td>
                {["a1","a2","a3","a4","a5"].map(f => (
                  <td key={f} style={td}>
                    <CellInput value={get(st.roll, f)} onChange={v => set(st.roll, f, v)} readOnly={locked} />
                  </td>
                ))}
                <AutoCell value={pA || ""} />
                {[2,3,4,5,6,7].map((n, qi) => (
                  <>
                    <td key={`${n}a`} style={td}><CellInput value={get(st.roll, `b${n}a`)} onChange={v => set(st.roll, `b${n}a`, v)} readOnly={locked} /></td>
                    <td key={`${n}b`} style={td}><CellInput value={get(st.roll, `b${n}b`)} onChange={v => set(st.roll, `b${n}b`, v)} readOnly={locked} /></td>
                    <AutoCell key={`q${n}`} value={qs[qi] || ""} />
                  </>
                ))}
                <AutoCell value={pBc || ""} />
                <GrandCell value={total || ""} />
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Drawing MID sheet ─────────────────────────────────────────────────────────
function DrawingMidSheet({ students, midData, onChange, locked }) {
  const td = { border: "0.5px solid var(--border)", padding: 0, textAlign: "center" };
  const th = (bg, color) => ({ padding: "4px 5px", textAlign: "center", fontWeight: 500, fontSize: 11, background: bg, color: color, border: "0.5px solid var(--border)", whiteSpace: "nowrap" });

  function get(roll, field) { return midData?.[roll]?.[field] ?? ""; }
  function set(roll, field, val) { onChange(roll, field, val); }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", fontSize: 11, minWidth: 500 }}>
        <thead>
          <tr>
            <th rowSpan={2} style={th("var(--surface-1)", "var(--text-muted)")}>Roll</th>
            <th rowSpan={2} style={{ ...th("var(--surface-1)", "var(--text-muted)"), textAlign: "left", minWidth: 100 }}>Name</th>
            <th colSpan={13} style={th("#E6F1FB","#0C447C")}>Q1–Q6 · best of (Q1,Q2) + best of (Q3,Q4) + best of (Q5,Q6) → max 30 → converted to 15</th>
            <th rowSpan={2} style={th("#EEEDFE","#534AB7")}>MID (15)</th>
          </tr>
          <tr>
            {[1,2,3,4,5,6].map(n => (
              <>
                <th key={`${n}a`} style={th("#E6F1FB","#185FA5")}>{n}A</th>
                <th key={`${n}b`} style={th("#E6F1FB","#185FA5")}>{n}B</th>
                <th key={`q${n}`} style={th("#B5D4F4","#0C447C")}>Q{n}</th>
              </>
            ))}
            <th style={th("#85B7EB","#042C53")}>Cvt</th>
          </tr>
        </thead>
        <tbody>
          {students.map((st, i) => {
            const m = midData?.[st.roll] || {};
            const qs = [1,2,3,4,5,6].map(n => calcQ(m[`b${n}a`], m[`b${n}b`]));
            const conv = Math.round(calcDrawingMidConv(m) * 10) / 10;
            return (
              <tr key={st.roll} style={{ background: i % 2 === 0 ? "transparent" : "var(--surface-1)" }}>
                <td style={{ ...td, padding: "3px 6px", fontSize: 10, whiteSpace: "nowrap" }}>{st.roll}</td>
                <td style={{ ...td, padding: "3px 6px", textAlign: "left" }}>{st.name || ""}</td>
                {[1,2,3,4,5,6].map((n, qi) => (
                  <>
                    <td key={`${n}a`} style={td}><CellInput value={get(st.roll, `b${n}a`)} onChange={v => set(st.roll, `b${n}a`, v)} readOnly={locked} /></td>
                    <td key={`${n}b`} style={td}><CellInput value={get(st.roll, `b${n}b`)} onChange={v => set(st.roll, `b${n}b`, v)} readOnly={locked} /></td>
                    <AutoCell key={`q${n}`} value={qs[qi] || ""} />
                  </>
                ))}
                <AutoCell value={conv || ""} />
                <GrandCell value={Math.round(conv) || ""} />
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Lab sheet ─────────────────────────────────────────────────────────────────
function LabSheet({ students, labData, onChange, locked }) {
  const td = { border: "0.5px solid var(--border)", padding: 0 };
  const th = (bg, color) => ({ padding: "6px 10px", textAlign: "center", fontWeight: 500, fontSize: 12, background: bg, color: color, border: "0.5px solid var(--border)" });
  const fields = ["practical","script","viva","record"];

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", fontSize: 12, width: "100%" }}>
        <thead>
          <tr>
            <th style={th("var(--surface-1)","var(--text-muted)")}>Roll No</th>
            <th style={{ ...th("var(--surface-1)","var(--text-muted)"), textAlign: "left" }}>Name</th>
            {["Practical","Script","Viva","Record"].map(l => <th key={l} style={th("#E6F1FB","#185FA5")}>{l}</th>)}
            <th style={th("#E1F5EE","#0F6E56")}>Total (40)</th>
          </tr>
        </thead>
        <tbody>
          {students.map((st, i) => {
            const m = labData?.[st.roll] || {};
            const total = calcLabTotal(m);
            const over = total > LAB_MAX_TOTAL;
            return (
              <tr key={st.roll} style={{ background: i % 2 === 0 ? "transparent" : "var(--surface-1)" }}>
                <td style={{ ...td, padding: "4px 8px", fontSize: 11 }}>{st.roll}</td>
                <td style={{ ...td, padding: "4px 8px", textAlign: "left" }}>{st.name || ""}</td>
                {fields.map(f => (
                  <td key={f} style={{ border: "0.5px solid var(--border)", padding: 4, textAlign: "center" }}>
                    <input type="number" min="0" className="marks-input" value={m[f] ?? ""} onChange={e => onChange(st.roll, f, e.target.value === "" ? "" : Number(e.target.value))} readOnly={locked}
                      style={{ width: 60, height: 28, border: locked ? "1px solid #e0e0e0" : "1px solid #b0c4de", borderRadius: 4, textAlign: "center", fontSize: 14, fontWeight: 600, background: locked ? "#f5f5f5" : "#fff", padding: 2, boxSizing: "border-box" }} />
                  </td>
                ))}
                <td style={{ padding: "4px 8px", textAlign: "center", fontWeight: 600, fontSize: 12, background: over ? "#fee2e2" : "#E1F5EE", color: over ? "#b91c1c" : "#0F6E56", border: "0.5px solid var(--border)" }}>
                  {total || ""}
                  {over && <span style={{ fontSize: 10, display: "block" }}>Max 40</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Assignment sheet ──────────────────────────────────────────────────────────
function AssignmentSheet({ students, assignData, onChange, locked }) {
  const td = { border: "0.5px solid var(--border)", padding: 0 };
  const th = (bg, color) => ({ padding: "6px 10px", textAlign: "center", fontWeight: 500, fontSize: 12, background: bg, color: color, border: "0.5px solid var(--border)" });
  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8, padding: "0 2px" }}>
        Enter marks for each assignment (max 5 each). If only one assignment is given, leave A2 blank for all students — the system will use A1 as full marks. If A2 is entered for any student, both columns are used and the average is taken for all students.
      </div>
      <table style={{ borderCollapse: "collapse", fontSize: 12, width: "100%" }}>
        <thead>
          <tr>
            <th style={th("var(--surface-1)","var(--text-muted)")}>Roll No</th>
            <th style={{ ...th("var(--surface-1)","var(--text-muted)"), textAlign: "left" }}>Name</th>
            <th style={th("#FAEEDA","#854F0B")}>Assignment 1 (max 5)</th>
            <th style={th("#FAEEDA","#854F0B")}>Assignment 2 (max 5)</th>
          </tr>
        </thead>
        <tbody>
          {students.map((st, i) => {
            const m = assignData?.[st.roll] || {};
            return (
              <tr key={st.roll} style={{ background: i % 2 === 0 ? "transparent" : "var(--surface-1)" }}>
                <td style={{ ...td, padding: "4px 8px", fontSize: 11 }}>{st.roll}</td>
                <td style={{ ...td, padding: "4px 8px", textAlign: "left" }}>{st.name || ""}</td>
                <td style={{ border: "0.5px solid var(--border)", padding: 4, textAlign: "center" }}>
                  <input type="number" min="0" max="5" className="marks-input" value={m.a1 ?? ""} onChange={e => onChange(st.roll, "a1", e.target.value === "" ? "" : Number(e.target.value))} readOnly={locked}
                    style={{ width: 80, height: 28, border: locked ? "1px solid #e0e0e0" : "1px solid #b0c4de", borderRadius: 4, textAlign: "center", fontSize: 14, fontWeight: 600, background: locked ? "#f5f5f5" : "#fff", padding: 2, boxSizing: "border-box" }} />
                </td>
                <td style={{ border: "0.5px solid var(--border)", padding: 4, textAlign: "center" }}>
                  <input type="number" min="0" max="5" className="marks-input" value={m.a2 ?? ""} onChange={e => onChange(st.roll, "a2", e.target.value === "" ? "" : Number(e.target.value))} readOnly={locked}
                    style={{ width: 80, height: 28, border: locked ? "1px solid #e0e0e0" : "1px solid #b0c4de", borderRadius: 4, textAlign: "center", fontSize: 14, fontWeight: 600, background: locked ? "#f5f5f5" : "#fff", padding: 2, boxSizing: "border-box" }} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Day-to-day sheet (Drawing only) ──────────────────────────────────────────
function DayDaySheet({ students, ddData, onChange, locked }) {
  const td = { border: "0.5px solid var(--border)", padding: 0 };
  const th = (bg, color) => ({ padding: "6px 10px", textAlign: "center", fontWeight: 500, fontSize: 12, background: bg, color, border: "0.5px solid var(--border)" });
  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>Day-to-day performance marks (max 15 per student)</div>
      <table style={{ borderCollapse: "collapse", fontSize: 12, width: "100%" }}>
        <thead>
          <tr>
            <th style={th("var(--surface-1)","var(--text-muted)")}>Roll No</th>
            <th style={{ ...th("var(--surface-1)","var(--text-muted)"), textAlign: "left" }}>Name</th>
            <th style={th("#FAEEDA","#854F0B")}>Day-to-day (max 15)</th>
          </tr>
        </thead>
        <tbody>
          {students.map((st, i) => (
            <tr key={st.roll} style={{ background: i % 2 === 0 ? "transparent" : "var(--surface-1)" }}>
              <td style={{ ...td, padding: "4px 8px", fontSize: 11 }}>{st.roll}</td>
              <td style={{ ...td, padding: "4px 8px", textAlign: "left" }}>{st.name || ""}</td>
              <td style={{ border: "0.5px solid var(--border)", padding: 4, textAlign: "center" }}>
                <input type="number" min="0" max="15" className="marks-input" value={ddData?.[st.roll] ?? ""} onChange={e => onChange(st.roll, e.target.value === "" ? "" : Number(e.target.value))} readOnly={locked}
                  style={{ width: 80, height: 28, border: locked ? "1px solid #e0e0e0" : "1px solid #b0c4de", borderRadius: 4, textAlign: "center", fontSize: 14, fontWeight: 600, background: locked ? "#f5f5f5" : "#fff", padding: 2, boxSizing: "border-box" }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Result sheet ──────────────────────────────────────────────────────────────
function ResultSheet({ students, data, isLab, isDrawing }) {
  const td = (bg, color, fw) => ({ padding: "6px 8px", textAlign: "center", fontSize: 12, background: bg || "#fff", color: color || "#222", fontWeight: fw || 400, border: "1px solid #c8c8c8" });

  if (isLab) {
    const lab = data?.lab || {};
    return (
      <table style={{ borderCollapse: "collapse", fontSize: 12, width: "100%" }}>
        <thead>
          <tr>
            <th style={td("var(--surface-1)","var(--text-muted)",500)}>Roll No</th>
            <th style={{ ...td("var(--surface-1)","var(--text-muted)",500), textAlign: "left" }}>Name</th>
            <th style={td("#E6F1FB","#185FA5",500)}>Practical</th>
            <th style={td("#E6F1FB","#185FA5",500)}>Script</th>
            <th style={td("#E6F1FB","#185FA5",500)}>Viva</th>
            <th style={td("#E6F1FB","#185FA5",500)}>Record</th>
            <th style={td("#E1F5EE","#0F6E56",600)}>Total (40)</th>
          </tr>
        </thead>
        <tbody>
          {students.map((st,i) => {
            const m = lab[st.roll] || {};
            return (
              <tr key={st.roll} style={{ background: i%2===0?"transparent":"var(--surface-1)" }}>
                <td style={td()}>{st.roll}</td>
                <td style={{ ...td(), textAlign: "left" }}>{st.name||""}</td>
                <td style={td()}>{m.practical||""}</td>
                <td style={td()}>{m.script||""}</td>
                <td style={td()}>{m.viva||""}</td>
                <td style={td()}>{m.record||""}</td>
                <td style={td("#E1F5EE","#0F6E56",600)}>{calcLabTotal(m)||""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  const mid1 = data?.mid1 || {}, mid2 = data?.mid2 || {};
  const assign = data?.assignment || {}, dayday = data?.dayday || {};
  const hasA2 = students.some(st => assign[st.roll]?.a2 !== undefined && assign[st.roll]?.a2 !== "");

  return (
    <table style={{ borderCollapse: "collapse", fontSize: 12, width: "100%" }}>
      <thead>
        <tr>
          <th style={td("var(--surface-1)","var(--text-muted)",500)}>Roll No</th>
          <th style={{ ...td("var(--surface-1)","var(--text-muted)",500), textAlign: "left" }}>Name</th>
          {isDrawing ? (
            <>
              <th style={td("#E6F1FB","#185FA5",500)}>MID-1 (15)</th>
              <th style={td("#E6F1FB","#185FA5",500)}>MID-2 (15)</th>
              <th style={td("#FBEAF0","#993556",500)}>Final (15)</th>
              <th style={td("#FAEEDA","#854F0B",500)}>Day-to-day (15)</th>
              <th style={td("#E1F5EE","#0F6E56",600)}>Total (30)</th>
            </>
          ) : (
            <>
              <th style={td("#9FE1CB","#085041",500)}>M1 Part A</th>
              <th style={td("#85B7EB","#042C53",500)}>M1 Part B cvt</th>
              <th style={td("#E6F1FB","#185FA5",500)}>MID-1 (25)</th>
              <th style={td("#9FE1CB","#085041",500)}>M2 Part A</th>
              <th style={td("#85B7EB","#042C53",500)}>M2 Part B cvt</th>
              <th style={td("#E6F1FB","#185FA5",500)}>MID-2 (25)</th>
              <th style={td("#FBEAF0","#993556",500)}>Final (25)</th>
              <th style={td("#FAEEDA","#854F0B",500)}>A1</th>
              {hasA2 && <th style={td("#FAEEDA","#854F0B",500)}>A2</th>}
              <th style={td("#E1F5EE","#0F6E56",600)}>Total (30)</th>
            </>
          )}
        </tr>
      </thead>
      <tbody>
        {students.map((st, i) => {
          const m1 = mid1[st.roll]||{}, m2 = mid2[st.roll]||{};
          const a = assign[st.roll]||{};
          const dd = Number(dayday[st.roll])||0;
          if (isDrawing) {
            const c1 = Math.round(calcDrawingMidConv(m1)*10)/10;
            const c2 = Math.round(calcDrawingMidConv(m2)*10)/10;
            const fi = calcFinalInternal(c1, c2);
            return (
              <tr key={st.roll} style={{ background: i%2===0?"transparent":"var(--surface-1)" }}>
                <td style={td()}>{st.roll}</td>
                <td style={{ ...td(), textAlign: "left" }}>{st.name||""}</td>
                <td style={td("#E6F1FB","#185FA5")}>{c1||""}</td>
                <td style={td("#E6F1FB","#185FA5")}>{c2||""}</td>
                <td style={td("#FBEAF0","#993556")}>{fi||""}</td>
                <td style={td("#FAEEDA","#854F0B")}>{dd||""}</td>
                <td style={td("#E1F5EE","#0F6E56",600)}>{(fi+dd)||""}</td>
              </tr>
            );
          }
          const pA1=calcPartA(m1), pBc1=Math.round(calcPartBConv(m1)*10)/10;
          const pA2=calcPartA(m2), pBc2=Math.round(calcPartBConv(m2)*10)/10;
          const t1=Math.round(pA1+pBc1), t2=Math.round(pA2+pBc2);
          const fi=calcFinalInternal(t1,t2);
          const av=calcAssignment(a.a1, a.a2, hasA2);
          return (
            <tr key={st.roll} style={{ background: i%2===0?"transparent":"var(--surface-1)" }}>
              <td style={td()}>{st.roll}</td>
              <td style={{ ...td(), textAlign: "left" }}>{st.name||""}</td>
              <td style={td("#9FE1CB","#085041")}>{pA1||""}</td>
              <td style={td("#85B7EB","#042C53")}>{pBc1||""}</td>
              <td style={td("#E6F1FB","#185FA5",500)}>{t1||""}</td>
              <td style={td("#9FE1CB","#085041")}>{pA2||""}</td>
              <td style={td("#85B7EB","#042C53")}>{pBc2||""}</td>
              <td style={td("#E6F1FB","#185FA5",500)}>{t2||""}</td>
              <td style={td("#FBEAF0","#993556")}>{fi||""}</td>
              <td style={td("#FAEEDA","#854F0B")}>{a.a1||""}</td>
              {hasA2 && <td style={td("#FAEEDA","#854F0B")}>{a.a2||""}</td>}
              <td style={td("#E1F5EE","#0F6E56",600)}>{(fi+av)||""}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ── Subject entry view ────────────────────────────────────────────────────────
function SubjectView({ section, subject, user, onBack }) {
  const students = section.students || [];
  const isLab = isLabSubject(subject);
  const isDrawing = isDrawingSubject(subject);

  const tabs = isLab
    ? ["Lab Internal", "Result"]
    : isDrawing
    ? ["MID-1", "MID-2", "Day-to-day", "Result"]
    : ["MID-1", "MID-2", "Assignment", "Result"];

  const [tab, setTab] = useState(tabs[0]);
  const [data, setData] = useState({});
  const [status, setStatus] = useState("Not Started");
  const [saving, setSaving] = useState(false);
  const [locking, setLocking] = useState(false);

  const marksRef = doc(db, "internalMarks", section.id, "subjects", subject.id);

  useEffect(() => {
    const unsub = onSnapshot(marksRef, snap => {
      if (snap.exists()) { setData(snap.data()); setStatus(snap.data().status || "Not Started"); }
    });
    return unsub;
  }, [section.id, subject.id]);

  const locked = status === "Locked";

  // Autosave helper — debounced write
  const autoSave = useCallback(async (updater) => {
    setSaving(true);
    try {
      const snap = await getDoc(marksRef);
      const current = snap.exists() ? snap.data() : {};
      const updated = updater(current);
      if (!updated.status) updated.status = "Draft";
      await setDoc(marksRef, updated, { merge: true });
    } finally { setSaving(false); }
  }, [section.id, subject.id]);

  function handleMidChange(midKey, roll, field, val) {
    setData(prev => ({
      ...prev,
      [midKey]: { ...(prev[midKey] || {}), [roll]: { ...(prev[midKey]?.[roll] || {}), [field]: val } }
    }));
    autoSave(current => ({
      ...current,
      [midKey]: { ...(current[midKey] || {}), [roll]: { ...(current[midKey]?.[roll] || {}), [field]: val } },
      status: current.status === "Locked" ? "Locked" : "Draft",
    }));
  }

  function handleLabChange(roll, field, val) {
    setData(prev => ({ ...prev, lab: { ...(prev.lab||{}), [roll]: { ...(prev.lab?.[roll]||{}), [field]: val } } }));
    autoSave(current => ({
      ...current,
      lab: { ...(current.lab||{}), [roll]: { ...(current.lab?.[roll]||{}), [field]: val } },
      status: current.status === "Locked" ? "Locked" : "Draft",
    }));
  }

  function handleAssignChange(roll, field, val) {
    setData(prev => ({ ...prev, assignment: { ...(prev.assignment||{}), [roll]: { ...(prev.assignment?.[roll]||{}), [field]: val } } }));
    autoSave(current => ({
      ...current,
      assignment: { ...(current.assignment||{}), [roll]: { ...(current.assignment?.[roll]||{}), [field]: val } },
      status: current.status === "Locked" ? "Locked" : "Draft",
    }));
  }

  function handleDayDayChange(roll, val) {
    setData(prev => ({ ...prev, dayday: { ...(prev.dayday||{}), [roll]: val } }));
    autoSave(current => ({
      ...current,
      dayday: { ...(current.dayday||{}), [roll]: val },
      status: current.status === "Locked" ? "Locked" : "Draft",
    }));
  }

  async function handleLock() {
    if (!window.confirm("Lock marks? Faculty will not be able to edit after locking. Admin can unlock if needed.")) return;
    setLocking(true);
    try {
      await updateDoc(marksRef, { status: "Locked", lockedBy: user.phone, lockedAt: new Date().toISOString() });
      setStatus("Locked");
    } finally { setLocking(false); }
  }

  const statusStyle = status === "Locked" ? { bg: "#E1F5EE", color: "#0F6E56" } :
                      status === "Draft"  ? { bg: "#FAEEDA", color: "#854F0B" } :
                                            { bg: "var(--surface-1)", color: "var(--text-muted)" };

  return (
    <div>
      <div style={{ background: BLUE, color: "#fff", padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={onBack} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: "pointer" }}>← Back</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{subject.name}</div>
          <div style={{ fontSize: 12, opacity: .8 }}>{section.name} · {isLab ? "Lab" : isDrawing ? "Drawing" : "Theory"} · {isLab ? 40 : 30} marks</div>
        </div>
        <span style={{ fontSize: 11, background: statusStyle.bg, color: statusStyle.color, borderRadius: 20, padding: "3px 10px" }}>{status}</span>
        {saving && <span style={{ fontSize: 11, opacity: .7 }}>Saving…</span>}
        {!locked && (
          <button onClick={handleLock} disabled={locking}
            style={{ fontSize: 12, background: "#fff", color: BLUE, border: "none", borderRadius: 6, padding: "5px 12px", cursor: "pointer", fontWeight: 600 }}>
            🔒 Lock marks
          </button>
        )}
      </div>

      <div style={{ display: "flex", borderBottom: "1px solid var(--border)", background: "var(--surface-2)", paddingLeft: 8 }}>
        {tabs.map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ border: "none", background: "none", padding: "8px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", color: tab === t ? BLUE : "var(--text-muted)", borderBottom: tab === t ? `2px solid ${BLUE}` : "2px solid transparent", fontFamily: "inherit" }}>
            {t}
          </button>
        ))}
      </div>

      <div style={{ padding: 12 }}>
        {locked && tab !== "Result" && (
          <div style={{ fontSize: 12, color: "#854F0B", background: "#FAEEDA", borderRadius: 8, padding: "7px 12px", marginBottom: 10 }}>
            🔒 Marks are locked. Contact your admin to unlock for editing.
          </div>
        )}

        {isLab && tab === "Lab Internal" && (
          <LabSheet students={students} labData={data.lab} onChange={handleLabChange} locked={locked} />
        )}
        {!isLab && !isDrawing && tab === "MID-1" && (
          <TheoryMidSheet students={students} midData={data.mid1} onChange={(r,f,v) => handleMidChange("mid1",r,f,v)} locked={locked} />
        )}
        {!isLab && !isDrawing && tab === "MID-2" && (
          <TheoryMidSheet students={students} midData={data.mid2} onChange={(r,f,v) => handleMidChange("mid2",r,f,v)} locked={locked} />
        )}
        {!isLab && !isDrawing && tab === "Assignment" && (
          <AssignmentSheet students={students} assignData={data.assignment} onChange={handleAssignChange} locked={locked} />
        )}
        {isDrawing && tab === "MID-1" && (
          <DrawingMidSheet students={students} midData={data.mid1} onChange={(r,f,v) => handleMidChange("mid1",r,f,v)} locked={locked} />
        )}
        {isDrawing && tab === "MID-2" && (
          <DrawingMidSheet students={students} midData={data.mid2} onChange={(r,f,v) => handleMidChange("mid2",r,f,v)} locked={locked} />
        )}
        {isDrawing && tab === "Day-to-day" && (
          <DayDaySheet students={students} ddData={data.dayday} onChange={handleDayDayChange} locked={locked} />
        )}
        {tab === "Result" && (
          <ResultSheet students={students} data={data} isLab={isLab} isDrawing={isDrawing} />
        )}
      </div>
    </div>
  );
}

// ── Subject list (home screen) ────────────────────────────────────────────────
function SubjectList({ sections, user, onSelectSubject }) {
  const mySubjects = [];
  sections.forEach(sec => {
    (sec.subjects || []).forEach(sub => {
      if (sub.facultyPhone === user.phone) {
        mySubjects.push({ section: sec, subject: sub });
      }
    });
  });

  if (mySubjects.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>📝</div>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>No subjects assigned</div>
        <div style={{ fontSize: 13 }}>Ask your admin to assign subjects to you.</div>
      </div>
    );
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>My subjects — internal marks</div>
      {mySubjects.map(({ section, subject }) => (
        <div key={section.id + subject.id}
          onClick={() => onSelectSubject(section, subject)}
          style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "var(--surface-2)", border: "0.5px solid var(--border)", borderRadius: 10, marginBottom: 8, cursor: "pointer" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{subject.name}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{section.name}</div>
          </div>
          <span style={{ fontSize: 11, background: isLabSubject(subject) ? "#EEEDFE" : isDrawingSubject(subject) ? "#FAEEDA" : "#E1F5EE", color: isLabSubject(subject) ? "#534AB7" : isDrawingSubject(subject) ? "#854F0B" : "#0F6E56", borderRadius: 20, padding: "3px 9px" }}>
            {isLabSubject(subject) ? "Lab" : isDrawingSubject(subject) ? "Drawing" : "Theory"}
          </span>
          <span style={{ color: BLUE, fontSize: 18 }}>›</span>
        </div>
      ))}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function InternalMarksPage({ user }) {
  const [sections, setSections] = useState([]);
  const [selected, setSelected] = useState(null); // { section, subject }

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "sections"), snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setSections(all.filter(sec => sec.subjects?.some(s => s.facultyPhone === user.phone)));
    });
    return unsub;
  }, [user.phone]);

  if (selected) {
    return (
      <>
        <NoSpinnerStyle />
        <SubjectView
          section={selected.section}
          subject={selected.subject}
          user={user}
          onBack={() => setSelected(null)}
        />
      </>
    );
  }

  return (
    <>
      <NoSpinnerStyle />
      <SubjectList sections={sections} user={user} onSelectSubject={(sec, sub) => setSelected({ section: sec, subject: sub })} />
    </>
  );
}

