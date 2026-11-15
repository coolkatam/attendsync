// src/login/DetailsPage.jsx
// Shown once, right after a person's first sign-in. Employee ID and college email are already known and cannot be
// edited; the person fills in the rest. After saving, the portal opens as usual.

import React, { useState } from "react";
import { doc, updateDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { P, Btn } from "../components/UI";

const inp = { width: "100%", boxSizing: "border-box", border: "1.5px solid " + P.border, borderRadius: 9, padding: "11px 12px", fontSize: 15, fontFamily: "inherit", background: "#fff", marginBottom: 14 };
const lock = { ...inp, background: "#eef1f5", color: "#4b5563" };
const lbl = { display: "block", fontSize: 12, fontWeight: 700, color: P.gray, marginBottom: 4 };

export default function DetailsPage({ user, onDone, onLogout }) {
  const [f, setF] = useState({ name: user.name && user.name !== user.employeeId ? user.name : "", designation: user.designation || "", qualification: user.qualification || "", gender: user.gender || "", dob: user.dob || "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = k => e => setF({ ...f, [k]: e.target.value });

  async function save() {
    const missing = [["name", "Name"], ["designation", "Designation"], ["qualification", "Qualification"], ["gender", "Gender"], ["dob", "Date of Birth"]].find(([k]) => !String(f[k]).trim());
    if (missing) { setErr(missing[1] + " is required."); return; }
    setBusy(true); setErr("");
    const data = { name: f.name.trim(), designation: f.designation.trim(), qualification: f.qualification.trim(), gender: f.gender, dob: f.dob, detailsDone: true };
    try {
      await updateDoc(doc(db, "users", user.phone), data);
      // the same facts appear on the faculty profile
      setDoc(doc(db, "facultyProfiles", user.phone), { bio: { designation: data.designation, email: user.email || "", employeeId: user.employeeId || "" }, updatedAt: new Date().toISOString() }, { merge: true }).catch(() => {});
      onDone({ ...user, ...data });
    } catch (e) { setErr("Could not save (" + (e.message || e) + "). Please try again."); }
    setBusy(false);
  }

  return (
    <div style={{ minHeight: "100vh", background: P.bg, display: "flex", justifyContent: "center", padding: "32px 16px 60px" }}>
      <div style={{ width: "100%", maxWidth: 520 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: P.navy, marginBottom: 4 }}>Welcome to Mech EMS</div>
        <div style={{ fontSize: 14, color: P.gray, lineHeight: 1.6, marginBottom: 20 }}>Your password is set. Please fill in your details once. You can open the portal after this.</div>
        <div style={{ background: "#fff", border: "1px solid " + P.border, borderRadius: 14, padding: "22px 22px 12px" }}>
          <label style={lbl}>Employee ID</label>
          <input style={lock} value={user.employeeId || user.phone} readOnly aria-readonly="true" />
          <label style={lbl}>College email</label>
          <input style={lock} value={user.email || ""} readOnly aria-readonly="true" />
          <label htmlFor="d-name" style={lbl}>Full name *</label>
          <input id="d-name" style={inp} value={f.name} onChange={set("name")} placeholder="As on your records" />
          <label htmlFor="d-des" style={lbl}>Designation *</label>
          <input id="d-des" style={inp} value={f.designation} onChange={set("designation")} placeholder="e.g. Assistant Professor" />
          <label htmlFor="d-qual" style={lbl}>Qualification *</label>
          <input id="d-qual" style={inp} value={f.qualification} onChange={set("qualification")} placeholder="e.g. M.Tech (Thermal Engineering), Ph.D" />
          <label htmlFor="d-gen" style={lbl}>Gender *</label>
          <select id="d-gen" style={inp} value={f.gender} onChange={set("gender")}>
            <option value="">Choose…</option><option>Male</option><option>Female</option><option>Other</option>
          </select>
          <label htmlFor="d-dob" style={lbl}>Date of Birth *</label>
          <input id="d-dob" type="date" style={inp} value={f.dob} onChange={set("dob")} max={new Date().toISOString().slice(0, 10)} />
          {err && <div style={{ color: P.red, fontSize: 13.5, marginBottom: 12 }}>{err}</div>}
          <Btn full onClick={save} disabled={busy}>{busy ? "Saving…" : "Save and open the portal"}</Btn>
          <div style={{ textAlign: "center", margin: "12px 0 6px" }}><span style={{ fontSize: 12.5, color: P.gray, cursor: "pointer" }} onClick={onLogout}>Sign out</span></div>
        </div>
      </div>
    </div>
  );
}
