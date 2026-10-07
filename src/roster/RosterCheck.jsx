// src/roster/RosterCheck.jsx
// Under the Employee ID roster on the Users screen. Once the roster is uploaded it shows, for every approved
// faculty member, whether the Employee ID they entered in their profile is on the roster and whether the name agrees,
// who on the roster has not registered yet, and a box to check any single ID.

import React, { useState, useEffect, useMemo } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { P } from "../components/UI";
import { scoreNames } from "../timetableUpload/smartParser";

const norm = v => String(v == null ? "" : v).normalize("NFKC").replace(/[​-‍﻿]/g, "").trim();
const idKey = v => norm(v).toUpperCase().replace(/\s+/g, "");

const STATUS = {
  ok:      { label: "On roster, name matches", color: P.green, bg: P.greenL },
  name:    { label: "On roster, name differs", color: P.amber, bg: P.amberL },
  missing: { label: "ID not on roster", color: P.red, bg: P.redL },
  none:    { label: "No Employee ID entered", color: P.gray, bg: P.bg },
};

export default function RosterCheck({ allUsers, version }) {
  const [roster, setRoster] = useState(null);
  const [profileIds, setProfileIds] = useState(null);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setRoster(null);
    Promise.all([getDocs(collection(db, "employeeRoster")), getDocs(collection(db, "facultyProfiles"))])
      .then(([rs, ps]) => {
        if (!alive) return;
        const r = new Map();
        rs.forEach(d => r.set(idKey(d.id), { id: d.id, ...d.data() }));
        const p = {};
        ps.forEach(d => { p[d.id] = norm((d.data().bio || {}).employeeId); });
        setRoster(r); setProfileIds(p);
      })
      .catch(e => { if (alive) setError("Could not read the roster (" + e.message + ")."); });
    return () => { alive = false; };
  }, [version]);

  const { rows, unregistered, counts } = useMemo(() => {
    if (!roster || !profileIds) return { rows: [], unregistered: [], counts: {} };
    const used = new Set();
    const rows = allUsers.filter(u => u.status === "approved").map(u => {
      const id = profileIds[u.id] || norm(u.employeeId);
      if (!id) return { u, id: "", status: "none", rosterName: "" };
      const hit = roster.get(idKey(id));
      if (!hit) return { u, id, status: "missing", rosterName: "" };
      used.add(idKey(id));
      const ok = scoreNames(u.name || "", hit.name || "") >= 70;
      return { u, id, status: ok ? "ok" : "name", rosterName: hit.name || "" };
    }).sort((a, b) => (a.u.name || "").localeCompare(b.u.name || ""));
    const unregistered = Array.from(roster.values()).filter(x => !used.has(idKey(x.id))).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    const counts = { all: rows.length };
    Object.keys(STATUS).forEach(k => { counts[k] = rows.filter(r => r.status === k).length; });
    counts.unregistered = unregistered.length;
    return { rows, unregistered, counts };
  }, [roster, profileIds, allUsers]);

  if (error) return <div style={{ fontSize: 13, color: P.red, marginTop: 12 }}>{error}</div>;
  if (!roster) return <div style={{ fontSize: 13, color: P.gray, marginTop: 12 }}>Checking the roster…</div>;
  if (roster.size === 0) return <div style={{ fontSize: 13, color: P.gray, marginTop: 12 }}>The roster is empty. Upload the Excel above, then the check appears here.</div>;

  const q = idKey(query);
  const lookup = q ? roster.get(q) : null;
  const shown = filter === "unregistered" ? [] : rows.filter(r => filter === "all" || r.status === filter);
  const chip = (key, label) => (
    <button key={key} type="button" onClick={() => setFilter(key)} aria-pressed={filter === key}
      style={{ border: "1.5px solid " + (filter === key ? P.blue : P.border), background: filter === key ? P.blue : "#fff", color: filter === key ? "#fff" : "#1a2230", borderRadius: 20, padding: "5px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
      {label} ({counts[key] || 0})
    </button>
  );

  return (
    <div style={{ marginTop: 14, borderTop: "1px solid " + P.border, paddingTop: 14 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>Check against registered faculty</div>
      <div style={{ fontSize: 12.5, color: P.gray, marginBottom: 10 }}>
        Each approved faculty member's Employee ID (from their profile) is looked up on the roster of {roster.size} IDs, and their name is compared with the roster's name.
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        {chip("all", "Everyone")}{chip("ok", "Matched")}{chip("name", "Name differs")}{chip("missing", "Not on roster")}{chip("none", "No ID entered")}{chip("unregistered", "On roster, not registered")}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 12 }}>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Check one Employee ID, e.g. RE0009" aria-label="Check one Employee ID"
          style={{ border: "1.5px solid " + P.border, borderRadius: 9, padding: "8px 12px", fontFamily: "inherit", fontSize: 13.5, width: 280, maxWidth: "100%" }} />
        {q && (lookup
          ? <span style={{ fontSize: 13, color: P.green, fontWeight: 600 }}>Present: {lookup.name}{lookup.designation ? ", " + lookup.designation : ""}{lookup.department ? " (" + lookup.department + ")" : ""}</span>
          : <span style={{ fontSize: 13, color: P.red, fontWeight: 600 }}>Not on the roster</span>)}
      </div>

      {filter === "unregistered" ? (
        <div style={{ maxHeight: 360, overflow: "auto", border: "1px solid " + P.border, borderRadius: 10 }}>
          {unregistered.length === 0 && <div style={{ padding: 14, fontSize: 13, color: P.gray }}>Everyone on the roster has registered.</div>}
          {unregistered.map(x => (
            <div key={x.id} style={{ display: "flex", gap: 12, padding: "8px 12px", borderTop: "1px solid " + P.border, fontSize: 13 }}>
              <b style={{ minWidth: 100, fontFamily: "'IBM Plex Mono', monospace" }}>{x.id}</b>
              <span style={{ flex: 1 }}>{x.name}</span>
              <span style={{ color: P.gray }}>{x.designation}</span>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ maxHeight: 420, overflow: "auto", border: "1px solid " + P.border, borderRadius: 10 }}>
          {shown.length === 0 && <div style={{ padding: 14, fontSize: 13, color: P.gray }}>Nobody in this group.</div>}
          {shown.map(r => {
            const st = STATUS[r.status];
            return (
              <div key={r.u.id} style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", alignItems: "center", padding: "8px 12px", borderTop: "1px solid " + P.border, fontSize: 13 }}>
                <b style={{ flex: "1 1 200px" }}>{r.u.name || r.u.id}</b>
                <span style={{ minWidth: 100, fontFamily: "'IBM Plex Mono', monospace", color: r.id ? "#1a2230" : P.gray }}>{r.id || "—"}</span>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: st.color, background: st.bg, padding: "3px 10px", borderRadius: 20 }}>{st.label}</span>
                {r.status === "name" && <span style={{ color: P.gray, flexBasis: "100%", fontSize: 12 }}>Roster name: {r.rosterName}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
