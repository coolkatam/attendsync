// src/timetable/PrintShell.jsx
// Full-screen preview that prints as one landscape page. "Save as PDF" is the
// browser's own print dialog, same approach as the resume.

import React from "react";

export default function PrintShell({ title, onClose, children }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "#525659", zIndex: 300, overflowY: "auto" }}>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #tt-print-root, #tt-print-root * { visibility: visible; }
          #tt-print-root { position: absolute; top: 0; left: 0; width: 100%; box-shadow: none !important; margin: 0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .tt-no-print { display: none !important; }
          @page { size: A4 landscape; margin: 10mm; }
        }
      `}</style>
      <div className="tt-no-print" style={{ position: "sticky", top: 0, zIndex: 10, background: "#1f2937", padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{title}</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => window.print()}
            style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}>
            Print / Save as PDF
          </button>
          <button onClick={onClose}
            style={{ background: "rgba(255,255,255,0.15)", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}>
            Close
          </button>
        </div>
      </div>
      <div id="tt-print-root" style={{ background: "#fff", maxWidth: 1180, margin: "20px auto 60px", padding: "24px 28px", color: "#1a2230", boxShadow: "0 4px 24px rgba(0,0,0,0.35)", boxSizing: "border-box" }}>
        {children}
      </div>
    </div>
  );
}
