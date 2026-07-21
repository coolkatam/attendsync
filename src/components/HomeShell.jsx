// src/components/HomeShell.jsx
// Shared dashboard shell used by Faculty, Admin/Coordinator, HoD and
// Master Admin home pages: professional colored header with the user's
// photo + name top-left, Logout top-right, and a centered row of big
// colorful pill tabs below.

import React, { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";

// Per-role header themes (cool, professional palettes)
export const SHELL_THEMES = {
  faculty: { header: "#04342C", accent: "#0F6E56", nameText: "#E1F5EE", subText: "#9FE1CB", border: "#0F6E56" },
  admin:   { header: "#042C53", accent: "#185FA5", nameText: "#E6F1FB", subText: "#85B7EB", border: "#185FA5" },
  hod:     { header: "#2E1065", accent: "#6D28D9", nameText: "#EDE9FE", subText: "#C4B5FD", border: "#6D28D9" },
  master:  { header: "#1C1C1A", accent: "#B45309", nameText: "#F5F5F4", subText: "#D6D3D1", border: "#57534E" },
};

// Pill color sets — light bg + dark text when inactive, solid + white when active
export const PILL_COLORS = {
  teal:   { bg: "#ccfbf1", fg: "#134e4a", solid: "#0f766e" },
  blue:   { bg: "#dbeafe", fg: "#1e3a8a", solid: "#1d4ed8" },
  purple: { bg: "#ede9fe", fg: "#4c1d95", solid: "#6d28d9" },
  amber:  { bg: "#fef3c7", fg: "#78350f", solid: "#b45309" },
  pink:   { bg: "#fce7f3", fg: "#831843", solid: "#be185d" },
  coral:  { bg: "#ffedd5", fg: "#7c2d12", solid: "#c2410c" },
  green:  { bg: "#dcfce7", fg: "#14532d", solid: "#15803d" },
  slate:  { bg: "#e2e8f0", fg: "#1e293b", solid: "#475569" },
};

export default function HomeShell({ user, onLogout, theme = "faculty", roleLabel, tabs, active, onSelect, masterStar }) {
  const t = SHELL_THEMES[theme] || SHELL_THEMES.faculty;
  const [photoURL, setPhotoURL] = useState("");

  // Pull the profile photo (if the person has uploaded one)
  useEffect(() => {
    let alive = true;
    getDoc(doc(db, "facultyProfiles", user.phone))
      .then(snap => {
        if (alive && snap.exists() && snap.data().bio?.photoURL) setPhotoURL(snap.data().bio.photoURL);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [user.phone]);

  const initials = (user.name || user.phone || "?")
    .split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

  return (
    <div>
      {/* ── Header bar ── */}
      <div style={{ background: t.header, padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 30 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <div style={{
            width: 46, height: 46, borderRadius: "50%", flexShrink: 0,
            background: photoURL ? "transparent" : t.accent,
            backgroundImage: photoURL ? "url(" + photoURL + ")" : "none",
            backgroundSize: "cover", backgroundPosition: "center",
            border: "2px solid " + t.border,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: t.nameText, fontWeight: 700, fontSize: 16,
          }}>
            {!photoURL && initials}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: t.nameText, fontWeight: 700, fontSize: 15.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {user.name} {masterStar && <span title="Master Admin">⭐</span>}
            </div>
            <div style={{ color: t.subText, fontSize: 12, fontWeight: 600 }}>{roleLabel}</div>
          </div>
        </div>
        <button onClick={onLogout}
          style={{ background: "transparent", color: t.subText, border: "1.5px solid " + t.border, borderRadius: 9, padding: "7px 16px", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit", flexShrink: 0 }}>
          Logout
        </button>
      </div>

      {/* ── Centered colorful pill tabs ── */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "16px 14px" }}>
        <div style={{ display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap", maxWidth: 980, margin: "0 auto" }}>
          {tabs.map(tab => {
            const c = PILL_COLORS[tab.color] || PILL_COLORS.slate;
            const isActive = active === tab.id;
            return (
              <button key={tab.id} onClick={() => onSelect(tab.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  background: isActive ? c.solid : c.bg,
                  color: isActive ? "#fff" : c.fg,
                  border: "none", borderRadius: 26, cursor: "pointer", fontFamily: "inherit",
                  fontSize: 14.5, fontWeight: 700, padding: "12px 20px",
                  boxShadow: isActive ? "0 4px 14px rgba(0,0,0,0.22)" : "none",
                  transition: "transform .12s, box-shadow .12s",
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; }}
                onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; }}
              >
                <span style={{ fontSize: 16 }}>{tab.icon}</span> {tab.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
