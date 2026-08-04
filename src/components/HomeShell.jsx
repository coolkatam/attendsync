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
  faculty: { header: "linear-gradient(135deg,#3B8C82,#2F7268)", accent: "#0F6E56", nameText: "#ffffff", subText: "#D6F0EC", border: "#8FCFC5" },
  admin:   { header: "linear-gradient(135deg,#4A72B8,#3B5D9C)", accent: "#185FA5", nameText: "#ffffff", subText: "#DCE7F7", border: "#9DB9E3" },
  hod:     { header: "linear-gradient(135deg,#8266C4,#6C51AE)", accent: "#6D28D9", nameText: "#ffffff", subText: "#E6DFF7", border: "#C3B2E8" },
  master:  { header: "linear-gradient(135deg,#38BDF8,#0EA5E9)", accent: "#0284C7", nameText: "#ffffff", subText: "#E0F5FF", border: "#BAE6FD" },
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
  const [imgFailed, setImgFailed] = useState(false);

  // Pull the profile photo (if the person has uploaded one)
  useEffect(() => {
    let alive = true;
    getDoc(doc(db, "facultyProfiles", user.phone))
      .then(snap => {
        if (!alive || !snap.exists()) return;
        const d = snap.data();
        const url = d.bio?.photoURL;
        if (!url) return;
        // Cache-bust with the doc's last-updated time so an old cached image
        // (from before a photo re-upload) is never shown for a stale URL.
        setImgFailed(false);
        setPhotoURL(url + (url.includes("?") ? "&" : "?") + "cb=" + encodeURIComponent(d.updatedAt || ""));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [user.phone]);

  const initials = (user.name || user.phone || "?")
    .split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

  return (
    <div>
      {/* ── Header bar ── */}
      <div style={{ background: t.header, padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 30 }}>
        <div
          onClick={() => onSelect("profile")}
          title="Go to My Profile"
          style={{ display: "flex", alignItems: "center", gap: 16, minWidth: 0, cursor: "pointer" }}
        >
          <div style={{
            width: 92, height: 92, borderRadius: 18, flexShrink: 0,
            background: (photoURL && !imgFailed) ? "transparent" : t.accent,
            border: "3px solid " + t.border, boxShadow: "0 3px 10px rgba(0,0,0,0.18)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: t.nameText, fontWeight: 700, fontSize: 30, overflow: "hidden",
          }}>
            {photoURL && !imgFailed ? (
              <img
                src={photoURL}
                alt=""
                onError={() => { console.error("HomeShell: profile photo failed to load:", photoURL); setImgFailed(true); }}
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            ) : initials}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: t.nameText, fontWeight: 700, fontSize: 19, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {user.name} {masterStar && <span title="Master Admin">⭐</span>}
            </div>
            <div style={{ color: t.subText, fontSize: 13.5, fontWeight: 600 }}>{roleLabel}</div>
          </div>
        </div>
        <button onClick={onLogout}
          style={{ background: "rgba(255,255,255,0.15)", color: t.nameText, border: "1.5px solid " + t.border, borderRadius: 9, padding: "8px 18px", cursor: "pointer", fontSize: 13.5, fontWeight: 700, fontFamily: "inherit", flexShrink: 0 }}>
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
