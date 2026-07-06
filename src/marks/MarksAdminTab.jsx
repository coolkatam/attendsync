// src/marks/MarksAdminTab.jsx
// Drop into src/marks/MarksAdminTab.jsx
// Shown in AdminApp's "Internal Marks" tab for a section.
// Shows subject-wise status and lets admin download the full workbook.

import { useState, useEffect } from "react";
import { collection, doc, onSnapshot, updateDoc } from "firebase/firestore";
import * as XLSX from "xlsx";
import { db } from "../firebase";
import {
  calcPartA, calcQ, calcPartBConv, calcMidTotal, calcFinalInternal,
  calcAssignment, calcLabTotal, calcDrawingMidConv, calcDrawingTotal,
  isLabSubject, isDrawingSubject,
  THEORY_MAX_TOTAL, LAB_MAX_TOTAL, DRAWING_MAX_TOTAL,
} from "./marksCalc";

const STATUS_STYLE = {
  "Locked":      { bg: "#E1F5EE", color: "#0F6E56", icon: "✅" },
  "Draft":       { bg: "#FAEEDA", color: "#854F0B", icon: "🟡" },
  "Not Started": { bg: "var(--surface-0)", color: "var(--text-muted)", icon: "⬜" },
};

function StatusPill({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE["Not Started"];
  return (
    <span style={{ fontSize: 11, background: s.bg, color: s.color, padding: "3px 9px", borderRadius: 20 }}>
      {status}
    </span>
  );
}

// ── Excel workbook generation ─────────────────────────────────────────────────
function buildTheorySheet(sub, students, data) {
  const mid1 = data?.mid1 || {};
  const mid2 = data?.mid2 || {};
  const assign = data?.assignment || {};

  // Detect if assignment 2 exists for any student
  const hasA2 = students.some(st => assign[st.roll]?.a2 !== undefined && assign[st.roll]?.a2 !== "");

  const headers = [
    "Roll No", "Name",
    "1A","1B","1C","1D","1E","Part A",
    "2A","2B","Q2","3A","3B","Q3","4A","4B","Q4","5A","5B","Q5","6A","6B","Q6","7A","7B","Q7","Part B cvt","MID-1 (25)",
    "1A","1B","1C","1D","1E","Part A",
    "2A","2B","Q2","3A","3B","Q3","4A","4B","Q4","5A","5B","Q5","6A","6B","Q6","7A","7B","Q7","Part B cvt","MID-2 (25)",
    "Final Internal (25)", "A1", ...(hasA2 ? ["A2"] : []), "Grand Total (30)",
  ];

  const rows = students.map(st => {
    const m1 = mid1[st.roll] || {};
    const m2 = mid2[st.roll] || {};
    const a = assign[st.roll] || {};
    const pA1 = calcPartA(m1), pA2 = calcPartA(m2);
    const pBc1 = calcPartBConv(m1), pBc2 = calcPartBConv(m2);
    const t1 = pA1 + pBc1, t2 = pA2 + pBc2;
    const fi = calcFinalInternal(t1, t2);
    const av = calcAssignment(a.a1, a.a2, hasA2);
    const q = (marks, n) => calcQ(marks[`b${n}a`], marks[`b${n}b`]);
    const row = [
      st.roll, st.name || "",
      m1.a1||"",m1.a2||"",m1.a3||"",m1.a4||"",m1.a5||"", pA1||"",
      m1.b2a||"",m1.b2b||"",q(m1,2)||"",
      m1.b3a||"",m1.b3b||"",q(m1,3)||"",
      m1.b4a||"",m1.b4b||"",q(m1,4)||"",
      m1.b5a||"",m1.b5b||"",q(m1,5)||"",
      m1.b6a||"",m1.b6b||"",q(m1,6)||"",
      m1.b7a||"",m1.b7b||"",q(m1,7)||"",
      pBc1||"", t1||"",
      m2.a1||"",m2.a2||"",m2.a3||"",m2.a4||"",m2.a5||"", pA2||"",
      m2.b2a||"",m2.b2b||"",q(m2,2)||"",
      m2.b3a||"",m2.b3b||"",q(m2,3)||"",
      m2.b4a||"",m2.b4b||"",q(m2,4)||"",
      m2.b5a||"",m2.b5b||"",q(m2,5)||"",
      m2.b6a||"",m2.b6b||"",q(m2,6)||"",
      m2.b7a||"",m2.b7b||"",q(m2,7)||"",
      pBc2||"", t2||"",
      fi||"", a.a1||"",
      ...(hasA2 ? [a.a2||""] : []),
      (fi + av)||"",
    ];
    return row;
  });

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws["!cols"] = headers.map(h => ({ wch: Math.max(h.length, 5) }));
  return ws;
}

function buildDrawingSheet(sub, students, data) {
  const mid1 = data?.mid1 || {};
  const mid2 = data?.mid2 || {};
  const dayday = data?.dayday || {};

  const headers = [
    "Roll No", "Name",
    "1A","1B","Q1","2A","2B","Q2","3A","3B","Q3","4A","4B","Q4","5A","5B","Q5","6A","6B","Q6","MID-1 cvt (15)",
    "1A","1B","Q1","2A","2B","Q2","3A","3B","Q3","4A","4B","Q4","5A","5B","Q5","6A","6B","Q6","MID-2 cvt (15)",
    "Final Internal (15)", "Day-to-day (15)", "Grand Total (30)",
  ];

  const rows = students.map(st => {
    const m1 = mid1[st.roll] || {};
    const m2 = mid2[st.roll] || {};
    const dd = Number(dayday[st.roll]) || 0;
    const c1 = calcDrawingMidConv(m1), c2 = calcDrawingMidConv(m2);
    const fi = calcFinalInternal(c1, c2);
    const q = (marks, n) => calcQ(marks[`b${n}a`], marks[`b${n}b`]);
    return [
      st.roll, st.name||"",
      m1.b1a||"",m1.b1b||"",q(m1,1)||"",
      m1.b2a||"",m1.b2b||"",q(m1,2)||"",
      m1.b3a||"",m1.b3b||"",q(m1,3)||"",
      m1.b4a||"",m1.b4b||"",q(m1,4)||"",
      m1.b5a||"",m1.b5b||"",q(m1,5)||"",
      m1.b6a||"",m1.b6b||"",q(m1,6)||"", c1||"",
      m2.b1a||"",m2.b1b||"",q(m2,1)||"",
      m2.b2a||"",m2.b2b||"",q(m2,2)||"",
      m2.b3a||"",m2.b3b||"",q(m2,3)||"",
      m2.b4a||"",m2.b4b||"",q(m2,4)||"",
      m2.b5a||"",m2.b5b||"",q(m2,5)||"",
      m2.b6a||"",m2.b6b||"",q(m2,6)||"", c2||"",
      fi||"", dd||"", (fi+dd)||"",
    ];
  });

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws["!cols"] = headers.map(h => ({ wch: Math.max(h.length, 5) }));
  return ws;
}

function buildLabSheet(sub, students, data) {
  const lab = data?.lab || {};
  const headers = ["Roll No","Name","Practical","Script","Viva","Record","Total (40)"];
  const rows = students.map(st => {
    const m = lab[st.roll] || {};
    const t = calcLabTotal(m);
    return [st.roll, st.name||"", m.practical||"", m.script||"", m.viva||"", m.record||"", t||""];
  });
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws["!cols"] = headers.map(h => ({ wch: Math.max(h.length, 10) }));
  return ws;
}

function buildConsolidatedSheet(subjects, students, allData) {
  const subHeaders = subjects.map(sub => {
    const max = isLabSubject(sub) ? 40 : 30;
    return `${sub.name} (${max})`;
  });
  const headers = ["Roll No", "Name", ...subHeaders];

  const rows = students.map(st => {
    const totals = subjects.map(sub => {
      const data = allData[sub.id];
      if (!data) return "";
      if (isLabSubject(sub)) {
        const t = calcLabTotal(data.lab?.[st.roll] || {});
        return t || "";
      }
      if (isDrawingSubject(sub)) {
        const m1 = data.mid1?.[st.roll] || {}, m2 = data.mid2?.[st.roll] || {};
        const dd = Number(data.dayday?.[st.roll]) || 0;
        const fi = calcFinalInternal(calcDrawingMidConv(m1), calcDrawingMidConv(m2));
        return (fi + dd) || "";
      }
      // Theory
      const m1 = data.mid1?.[st.roll] || {}, m2 = data.mid2?.[st.roll] || {};
      const a = data.assignment?.[st.roll] || {};
      const hasA2 = students.some(s => data.assignment?.[s.roll]?.a2 !== undefined && data.assignment?.[s.roll]?.a2 !== "");
      const fi = calcFinalInternal(calcMidTotal(m1), calcMidTotal(m2));
      const av = calcAssignment(a.a1, a.a2, hasA2);
      return (fi + av) || "";
    });
    return [st.roll, st.name||"", ...totals];
  });

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws["!cols"] = headers.map(h => ({ wch: Math.max(h.length + 2, 12) }));
  return ws;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function MarksAdminTab({ section }) {
  const [marksData, setMarksData] = useState({});
  const [downloading, setDownloading] = useState(false);

  const subjects = section.subjects || [];
  const students = section.students || [];

  useEffect(() => {
    if (!subjects.length) return;
    const unsubs = subjects.map(sub => {
      const ref = doc(db, "internalMarks", section.id, "subjects", sub.id);
      return onSnapshot(ref, snap => {
        setMarksData(prev => ({ ...prev, [sub.id]: snap.exists() ? snap.data() : {} }));
      });
    });
    return () => unsubs.forEach(u => u());
  }, [section.id, subjects.length]);

  function getStatus(subId) {
    const d = marksData[subId];
    if (!d) return "Not Started";
    return d.status || "Not Started";
  }

  async function handleUnlock(sub) {
    if (!window.confirm(`Unlock "${sub.name}"? Faculty will be able to edit marks again.`)) return;
    await updateDoc(doc(db, "internalMarks", section.id, "subjects", sub.id), { status: "Draft" });
  }

  function handleDownload() {
    setDownloading(true);
    try {
      const wb = XLSX.utils.book_new();
      subjects.forEach(sub => {
        const data = marksData[sub.id] || {};
        const safeName = sub.name.replace(/[\\\/\?\*\[\]:]/g,"").slice(0,31);
        let ws;
        if (isLabSubject(sub)) ws = buildLabSheet(sub, students, data);
        else if (isDrawingSubject(sub)) ws = buildDrawingSheet(sub, students, data);
        else ws = buildTheorySheet(sub, students, data);
        XLSX.utils.book_append_sheet(wb, ws, safeName);
      });
      // Consolidated sheet
      const ws = buildConsolidatedSheet(subjects, students, marksData);
      XLSX.utils.book_append_sheet(wb, ws, "Consolidated");
      const safeSec = section.name.replace(/[^a-zA-Z0-9 _-]/g,"");
      XLSX.writeFile(wb, safeSec + "_InternalMarks.xlsx");
    } finally {
      setDownloading(false);
    }
  }

  const locked = subjects.filter(s => getStatus(s.id) === "Locked").length;
  const draft  = subjects.filter(s => getStatus(s.id) === "Draft").length;
  const pct = subjects.length ? Math.round((locked / subjects.length) * 100) : 0;

  return (
    <div style={{ padding: "0 4px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>Internal marks — {section.name}</div>
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{subjects.length} subjects · {students.length} students</div>
        </div>
        <button onClick={handleDownload} disabled={downloading}
          style={{ fontSize: 13, background: "#1a56a0", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontWeight: 600, opacity: downloading ? 0.7 : 1 }}>
          {downloading ? "Building…" : "⬇ Download workbook"}
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
        {subjects.map(sub => {
          const status = getStatus(sub.id);
          const st = STATUS_STYLE[status] || STATUS_STYLE["Not Started"];
          return (
            <div key={sub.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", background: "var(--surface-1)", borderRadius: 8 }}>
              <span style={{ fontSize: 14 }}>{st.icon}</span>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 13, color: "var(--text-primary)" }}>{sub.name}</span>
                <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 8 }}>
                  {isLabSubject(sub) ? "Lab" : isDrawingSubject(sub) ? "Drawing" : "Theory"}
                </span>
              </div>
              <StatusPill status={status} />
              {status === "Locked" && (
                <button onClick={() => handleUnlock(sub)}
                  style={{ fontSize: 11, color: "var(--text-muted)", background: "none", border: "0.5px solid var(--border)", borderRadius: 6, padding: "3px 8px", cursor: "pointer" }}>
                  Unlock
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ background: "var(--surface-1)", borderRadius: 8, padding: "12px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 8 }}>
          <span style={{ color: "var(--text-secondary)" }}>Overall progress</span>
          <span style={{ fontWeight: 500 }}>{locked} locked · {draft} in draft · {subjects.length - locked - draft} not started</span>
        </div>
        <div style={{ background: "var(--surface-0)", borderRadius: 20, height: 8, overflow: "hidden" }}>
          <div style={{ background: "#0F6E56", width: pct + "%", height: "100%", borderRadius: 20, transition: "width .3s" }} />
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>{pct}% locked</div>
      </div>
    </div>
  );
}
