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
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(clamp(260px, 18vw, 400px), 1fr))", gap: "clamp(14px, 1.2vw, 24px)" }}>
      {tiles.map(tile => {
        const c = TILE_COLORS[tile.color] || TILE_COLORS.blue;
        const Icon = tile.icon;
        return (
          <button
            key={tile.id}
            onClick={() => onSelect(tile.id)}
            style={{
              background: "#fff", border: "1px solid " + P.border, borderRadius: 14,
              padding: "clamp(22px, 1.8vw, 36px) clamp(20px, 1.7vw, 34px)", display: "flex", flexDirection: "column", gap: "clamp(12px, 1vw, 20px)", textAlign: "left",
              cursor: "pointer", fontFamily: "inherit", minHeight: "clamp(148px, 11.5vw, 230px)",
            }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 8px 22px rgba(22,50,79,0.1)"; e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.borderColor = "#c7d0da"; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.borderColor = P.border; }}
          >
            <div style={{ width: "clamp(46px, 3.4vw, 68px)", height: "clamp(46px, 3.4vw, 68px)", borderRadius: 14, background: c.tint, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Icon size={28} color={c.solid} />
            </div>
            <div style={{ fontSize: "clamp(15.5px, 1.15vw, 23px)", fontWeight: 700, color: "#1a2230" }}>{tile.title}</div>
            <div style={{ fontSize: "clamp(12.5px, 0.88vw, 17px)", color: P.gray, lineHeight: 1.55 }}>{tile.desc}</div>
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
      <div style={{ margin: "0 auto", padding: "clamp(28px, 2.4vw, 48px) clamp(20px, 3vw, 64px) 60px" }}>
        {greeting && (
          <>
            <div style={{ fontSize: "clamp(22px, 1.7vw, 32px)", fontWeight: 700, marginBottom: 4 }}>{greeting}</div>
            <div style={{ fontSize: "clamp(13.5px, 0.95vw, 18px)", color: P.gray, marginBottom: 30 }}>Pick where you want to go.</div>
          </>
        )}
        {groups.map((group, gi) => (
          <div key={group.label}>
            <div style={{ fontSize: "clamp(12px, 0.85vw, 15px)", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: P.gray, margin: gi === 0 ? "0 0 14px" : "clamp(30px, 2.4vw, 48px) 0 14px" }}>
              {group.label}
            </div>
            <TileGrid tiles={group.tiles} onSelect={onSelect} />
          </div>
        ))}
      </div>
    </div>
  );
}
