// src/components/UI.js — shared UI components

import React from "react";

export const P = {
  blue:"#1a56a0",  blueL:"#dbeafe",
  teal:"#0e7490",  tealL:"#cffafe",
  green:"#166534", greenL:"#dcfce7",
  red:"#b91c1c",   redL:"#fee2e2",
  amber:"#92400e", amberL:"#fef3c7",
  gray:"#6b7280",  border:"#e5e7eb",
  bg:"#f8fafc",    white:"#ffffff",
};

export function Btn({ children, onClick, variant = "primary", small, full, disabled, style = {} }) {
  const variants = {
    primary: { background: P.blue,  color: "#fff", border: "none" },
    accent:  { background: P.teal,  color: "#fff", border: "none" },
    success: { background: P.green, color: "#fff", border: "none" },
    danger:  { background: P.red,   color: "#fff", border: "none" },
    outline: { background: "transparent", color: P.blue, border: "1.5px solid " + P.blue },
    ghost:   { background: P.border, color: P.gray, border: "none" },
  };
  return (
    <button
      onClick={disabled ? undefined : onClick}
      style={{
        borderRadius: 8, cursor: disabled ? "not-allowed" : "pointer",
        fontFamily: "inherit", fontWeight: 500,
        fontSize: small ? 13 : 14,
        padding: small ? "7px 14px" : "10px 20px",
        width: full ? "100%" : undefined,
        opacity: disabled ? 0.5 : 1,
        display: "inline-block",
        ...( variants[variant] || variants.primary ),
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export function Card({ children, style = {}, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: P.white, border: "1px solid " + P.border,
        borderRadius: 12, padding: "14px 16px", marginBottom: 10,
        cursor: onClick ? "pointer" : "default",
        boxShadow: onClick ? "0 1px 4px rgba(0,0,0,0.06)" : "none",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Badge({ children, color = "blue" }) {
  const map = {
    blue:  { bg: P.blueL,  fg: P.blue  },
    green: { bg: P.greenL, fg: P.green },
    red:   { bg: P.redL,   fg: P.red   },
    amber: { bg: P.amberL, fg: P.amber },
    teal:  { bg: P.tealL,  fg: P.teal  },
  };
  const c = map[color] || map.blue;
  return (
    <span style={{
      background: c.bg, color: c.fg,
      fontSize: 11, fontWeight: 600,
      padding: "3px 9px", borderRadius: 20, display: "inline-block",
    }}>
      {children}
    </span>
  );
}

export function Fld({ label, value, onChange, placeholder, type = "text" }) {
  return (
    <div style={{ marginBottom: 12 }}>
      {label && <div style={{ fontSize: 12, color: P.gray, marginBottom: 4, fontWeight: 500 }}>{label}</div>}
      <input
        type={type} value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%", boxSizing: "border-box",
          border: "1px solid " + P.border, borderRadius: 8,
          padding: "9px 12px", fontSize: 14,
          fontFamily: "inherit", background: "#fff", color: "#111", outline: "none",
        }}
      />
    </div>
  );
}

export function Sel({ label, value, onChange, options }) {
  return (
    <div style={{ marginBottom: 12 }}>
      {label && <div style={{ fontSize: 12, color: P.gray, marginBottom: 4, fontWeight: 500 }}>{label}</div>}
      <select
        value={value} onChange={e => onChange(e.target.value)}
        style={{
          width: "100%", boxSizing: "border-box",
          border: "1px solid " + P.border, borderRadius: 8,
          padding: "9px 12px", fontSize: 14,
          fontFamily: "inherit", background: "#fff", color: "#111",
        }}
      >
        <option value="">— select —</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

export function TopBar({ title, subtitle, onBack, right }) {
  return (
    <div style={{
      background: P.blue, padding: "14px 16px 12px",
      position: "sticky", top: 0, zIndex: 20,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {onBack && (
            <button onClick={onBack} style={{
              background: "rgba(255,255,255,0.2)", border: "none",
              cursor: "pointer", borderRadius: 6,
              width: 30, height: 30, color: "#fff",
              fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center",
            }}>←</button>
          )}
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#fff" }}>{title}</div>
            {subtitle && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)" }}>{subtitle}</div>}
          </div>
        </div>
        {right}
      </div>
    </div>
  );
}

export function GPill({ g }) {
  if (!g) return null;
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 10,
      background: g === "F" ? "#fce7f3" : P.blueL,
      color: g === "F" ? "#9d174d" : "#1e40af",
    }}>{g}</span>
  );
}

export function ARow({ st, status, onToggle }) {
  const ab = status === "A";
  return (
    <div style={{
      display: "flex", alignItems: "center",
      padding: "10px 12px", borderRadius: 10, marginBottom: 6,
      background: ab ? P.redL : "#f0fdf4",
      border: "1px solid " + (ab ? "#fca5a5" : "#bbf7d0"),
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
        background: ab ? P.redL : P.blueL,
        color: ab ? P.red : P.blue,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 11, fontWeight: 700, marginRight: 10,
      }}>
        {st.gender || "•"}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: ab ? P.red : "#111" }}>{st.roll}</span>
          <GPill g={st.gender} />
        </div>
        <div style={{ fontSize: 13, marginTop: 1, color: ab ? P.red : "#374151", fontWeight: ab ? 600 : 400 }}>
          {st.name || "—"}
        </div>
      </div>
      {onToggle ? (
        <button
          onClick={() => onToggle(st.roll)}
          style={{
            width: 42, height: 42, borderRadius: 10, border: "none", flexShrink: 0,
            background: ab ? P.red : "#16a34a",
            color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer",
          }}
        >
          {ab ? "A" : "P"}
        </button>
      ) : (
        <Badge color={ab ? "red" : "green"}>{ab ? "A" : "P"}</Badge>
      )}
    </div>
  );
}

// ── Date + Period picker ────────────────────────────────────
// Lets faculty/admin pick a date and one or more periods (multi-select)
// for a marking session. periodsPerDay comes from section.periodsPerDay.
export function PeriodPicker({ date, onDateChange, periodsPerDay, selected, onToggle, doneMap }) {
  const periods = Array.from({ length: periodsPerDay || 7 }, (_, i) => i + 1);
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, color: P.gray, marginBottom: 4, fontWeight: 500 }}>Date</div>
      <input
        type="date" value={date}
        onChange={e => onDateChange(e.target.value)}
        style={{
          width: "100%", boxSizing: "border-box",
          border: "1px solid " + P.border, borderRadius: 8,
          padding: "9px 12px", fontSize: 14,
          fontFamily: "inherit", background: "#fff", color: "#111", outline: "none",
          marginBottom: 12,
        }}
      />
      <div style={{ fontSize: 12, color: P.gray, marginBottom: 6, fontWeight: 500 }}>
        Period(s) — tap all that apply to this session (e.g. 1,2,3 for a lab)
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {periods.map(p => {
          const isSel  = selected.includes(p);
          const isDone = doneMap && doneMap[p];
          return (
            <button
              key={p}
              onClick={() => onToggle(p)}
              style={{
                width: 40, height: 40, borderRadius: 8, cursor: "pointer",
                fontFamily: "inherit", fontWeight: 700, fontSize: 13,
                border: isSel ? "2px solid " + P.blue : "1.5px solid " + P.border,
                background: isSel ? P.blue : (isDone ? P.greenL : "#fff"),
                color: isSel ? "#fff" : (isDone ? P.green : "#374151"),
                position: "relative",
              }}
              title={isDone ? "Already marked" : "Not marked"}
            >
              {p}
              {isDone && !isSel && (
                <span style={{ position: "absolute", top: -4, right: -4, fontSize: 9 }}>✓</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Per-period status chips (read-only) for dashboard cards ──
export function PeriodChips({ periodsPerDay, doneMap, onPick }) {
  const periods = Array.from({ length: periodsPerDay || 7 }, (_, i) => i + 1);
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
      {periods.map(p => {
        const isDone = doneMap && doneMap[p];
        return (
          <button
            key={p}
            onClick={() => onPick && onPick(p)}
            style={{
              minWidth: 26, height: 26, borderRadius: 6, cursor: onPick ? "pointer" : "default",
              fontFamily: "inherit", fontWeight: 700, fontSize: 11, border: "none",
              background: isDone ? P.greenL : P.bg,
              color: isDone ? P.green : P.gray,
            }}
          >
            {p}
          </button>
        );
      })}
    </div>
  );
}

export function Spinner() {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "3rem" }}>
      <div style={{
        width: 36, height: 36, border: "3px solid " + P.blueL,
        borderTop: "3px solid " + P.blue,
        borderRadius: "50%", animation: "spin 0.8s linear infinite",
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}