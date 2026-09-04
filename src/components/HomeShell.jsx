// src/components/HomeShell.jsx
// Shared dashboard shell used by Faculty, Admin/Coordinator, HoD and
// Master Admin home pages: one flat, consistent header (role is shown as
// text, not a different color per role) with the user's photo + name
// top-left, Logout top-right, and an underline-style tab row below.

import React, { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import { P } from "./UI";
import { IconStar, IconLogout } from "./Icons";

export default function HomeShell({ user, onLogout, roleLabel, tabs, active, onSelect, masterStar }) {
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
      {/* ── Header bar — one consistent navy, every role ── */}
      <div style={{ background: P.navy, padding: "0 24px", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 30 }}>
        <div
          onClick={() => onSelect("profile")}
          title="Go to My Profile"
          style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, cursor: "pointer" }}
        >
          <div style={{
            width: 36, height: 36, borderRadius: 9, flexShrink: 0,
            background: (photoURL && !imgFailed) ? "transparent" : P.blue,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontWeight: 700, fontSize: 13, overflow: "hidden",
          }}>
            {photoURL && !imgFailed ? (
              <img
                src={photoURL}
                alt=""
                onError={() => setImgFailed(true)}
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
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

      {/* ── Underline tabs — single accent, neutral otherwise ── */}
      <div style={{ background: "#fff", borderBottom: "1px solid " + P.border, padding: "0 20px" }}>
        <div style={{ display: "flex", gap: 26, flexWrap: "wrap", maxWidth: 1100, margin: "0 auto" }}>
          {tabs.map(tab => {
            const isActive = active === tab.id;
            const Icon = typeof tab.icon === "function" ? tab.icon : null;
            return (
              <button key={tab.id} onClick={() => onSelect(tab.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 7,
                  background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit",
                  fontSize: 13.5, fontWeight: isActive ? 600 : 500,
                  color: isActive ? P.blue : P.gray,
                  padding: "12px 2px 10px", borderBottom: "2.5px solid " + (isActive ? P.blue : "transparent"),
                }}
              >
                {Icon ? <Icon size={16} /> : <span style={{ fontSize: 15 }}>{tab.icon}</span>}
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
