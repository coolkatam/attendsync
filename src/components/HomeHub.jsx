// src/components/HomeHub.jsx
// The landing screen for every role (Faculty, Admin/Coordinator, HoD, Master
// Admin): the same navy header as before, then nothing but a grid of big,
// clearly labeled tiles grouped by who they're for. Clicking a tile navigates
// away to that feature's own screen — this page itself shows nothing else.

import React, { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { P } from "./UI";
import { IconStar, IconLogout } from "./Icons";

// Soft tint + solid accent pairs used for tile icon badges. Purely for
// visual variety on a navigation grid — not semantic/status color.
export const TILE_COLORS = {
  blue:   { tint: "#e7eef6", solid: "#2c5c94" },
  teal:   { tint: "#e9f0ef", solid: "#3f6b6f" },
  indigo: { tint: "#ecedf7", solid: "#4d4f9c" },
  amber:  { tint: "#f7ecdb", solid: "#a15c07" },
  violet: { tint: "#f1ebf5", solid: "#7a4f9c" },
  green:  { tint: "#e6f2ea", solid: "#1f7a4d" },
  rose:   { tint: "#f6e9ee", solid: "#a13f5c" },
  slate:  { tint: "#eef0f2", solid: "#5b6673" },
};

// A row-wrapping grid of big navigation tiles; also used by sub-pages such as Coordinator Duties.
export function TileGrid({ tiles, onSelect }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
      {tiles.map(tile => {
        const c = TILE_COLORS[tile.color] || TILE_COLORS.blue;
        const Icon = tile.icon;
        return (
          <button
            key={tile.id}
            onClick={() => onSelect(tile.id)}
            style={{
              background: "#fff", border: "1px solid " + P.border, borderRadius: 14,
              padding: "24px 22px", display: "flex", flexDirection: "column", gap: 12, textAlign: "left",
              cursor: "pointer", fontFamily: "inherit", minHeight: 148,
            }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 8px 22px rgba(22,50,79,0.1)"; e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.borderColor = "#c7d0da"; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.borderColor = P.border; }}
          >
            <div style={{ width: 46, height: 46, borderRadius: 11, background: c.tint, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Icon size={22} color={c.solid} />
            </div>
            <div style={{ fontSize: 15.5, fontWeight: 700, color: "#1a2230" }}>{tile.title}</div>
            <div style={{ fontSize: 12.5, color: P.gray, lineHeight: 1.5 }}>{tile.desc}</div>
          </button>
        );
      })}
    </div>
  );
}

export default function HomeHub({ user, onLogout, roleLabel, masterStar, greeting, groups, onSelect }) {
  const [photoURL, setPhotoURL] = useState("");
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    getDoc(doc(db, "facultyProfiles", user.phone))
      .then(snap => {
        if (!alive || !snap.exists()) return;
        const d = snap.data();
        const url = d.bio?.photoURL;
        if (!url) return;
        setImgFailed(false);
        setPhotoURL(url + (url.includes("?") ? "&" : "?") + "cb=" + encodeURIComponent(d.updatedAt || ""));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [user.phone]);

  const initials = (user.name || user.phone || "?")
    .split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

  return (
    <div style={{ background: P.bg, minHeight: "100vh" }}>
      {/* ── Header — same as every other screen ── */}
      <div style={{ background: P.navy, padding: "0 24px", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 9, flexShrink: 0, overflow: "hidden",
            background: (photoURL && !imgFailed) ? "transparent" : P.blue,
            display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 13,
          }}>
            {photoURL && !imgFailed ? (
              <img src={photoURL} alt="" onError={() => setImgFailed(true)} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            ) : initials}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: "#fff", fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "flex", alignItems: "center", gap: 6 }}>
              {user.name}
              {masterStar && <IconStar size={12} filled color="#e8b23d" />}
            </div>
            <div style={{ color: "rgba(255,255,255,0.68)", fontSize: 11.5 }}>{roleLabel}</div>
          </div>
        </div>
        <button onClick={onLogout}
          style={{ display: "flex", alignItems: "center", gap: 7, background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.85)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 7, padding: "7px 14px", cursor: "pointer", fontSize: 12.5, fontWeight: 600, fontFamily: "inherit", flexShrink: 0 }}>
          <IconLogout size={14} />
          Logout
        </button>
      </div>

      {/* ── Tile hub ── */}
      <div style={{ maxWidth: 1600, margin: "0 auto", padding: "36px 32px 60px" }}>
        {greeting && (
          <>
            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>{greeting}</div>
            <div style={{ fontSize: 13.5, color: P.gray, marginBottom: 30 }}>Pick where you want to go.</div>
          </>
        )}
        {groups.map((group, gi) => (
          <div key={group.label}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: P.gray, margin: gi === 0 ? "0 0 12px" : "30px 0 12px" }}>
              {group.label}
            </div>
            <TileGrid tiles={group.tiles} onSelect={onSelect} />
          </div>
        ))}
      </div>
    </div>
  );
}
