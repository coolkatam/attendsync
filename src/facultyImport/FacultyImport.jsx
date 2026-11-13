// src/facultyImport/FacultyImport.jsx
// The HoD or a Class Coordinator uploads the faculty list (name and college email). The screen shows what will happen
// to each row (a new account, or the email attached to an existing account so nothing already entered is lost),
// creates the accounts, and then emails every person a link to set their own password.

import React, { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import { collection, getDocs } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { sendPasswordResetEmail } from "firebase/auth";
import { db, auth, functions } from "../firebase";
import { P, Btn, Card, TopBar } from "../components/UI";
import { readFacultySheet, planImport } from "./importLogic";
import { COLLEGE_DOMAIN } from "../utils";

const sel = { border: "1.5px solid " + P.border, borderRadius: 8, padding: "6px 8px", fontSize: 13, fontFamily: "inherit", background: "#fff", maxWidth: 260 };
const th = { textAlign: "left", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: P.gray, padding: "6px 10px 6px 0", borderBottom: "1.5px solid " + P.border };
const td = { padding: "8px 10px 8px 0", borderBottom: "1px solid " + P.border, verticalAlign: "middle", fontSize: 13.5 };

export function downloadFacultyTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([["Name", "College Email", "Employee ID", "Designation"], ["K Arun Kumar", "arun@" + COLLEGE_DOMAIN, "RE0009", "Associate Professor"]]);
  ws["!cols"] = [{ wch: 28 }, { wch: 36 }, { wch: 14 }, { wch: 24 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Faculty");
  XLSX.writeFile(wb, "faculty_list_template.xlsx");
}

export default function FacultyImport({ user, onBack }) {
  const [users, setUsers] = useState(null);
  const [plan, setPlan] = useState(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState(null);
  const [sendAlready, setSendAlready] = useState(false);
  const [sent, setSent] = useState(null);       // { done, total, failed: [{email, error}] }

  useEffect(() => {
    getDocs(collection(db, "users")).then(s => setUsers(s.docs.map(d => ({ id: d.id, ...d.data() })))).catch(e => setMsg("Could not read the users (" + e.message + ")."));
  }, []);

  function onFile(file) {
    if (!file || !users) return;
    setResults(null); setSent(null); setMsg("Reading the file…");
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb = XLSX.read(e.target.result, { type: "array" });
        const rows = readFacultySheet(wb);
        if (!rows.length) { setPlan(null); setMsg("I could not find names and emails in that file. Use the template: Name and College Email columns."); return; }
        setPlan(planImport(rows, users)); setMsg("");
      } catch (err) { setPlan(null); setMsg("Could not read that file. Please use the template."); }
    };
    reader.readAsArrayBuffer(file);
  }

  const setMatch = (i, matchId) => setPlan(p => p.map((r, k) => (k === i ? { ...r, matchId, state: matchId ? "match" : "new" } : r)));
  const doable = (plan || []).filter(r => r.state === "new" || r.state === "match" || r.state === "exists");

  async function create() {
    setBusy(true); setMsg("");
    try {
      const fn = httpsCallable(functions, "importFaculty");
      const res = await fn({ rows: doable.map(r => ({ name: r.name, email: r.email, employeeId: r.employeeId, designation: r.designation, matchId: r.state === "match" ? r.matchId : "" })) });
      setResults(res.data.results);
    } catch (e) { setMsg("Could not create the accounts (" + e.message + "). Nothing was sent."); }
    setBusy(false);
  }

  async function sendLinks() {
    const targets = results.filter(r => r.ok && r.canSend && (sendAlready || r.note !== "already in the portal"));
    setBusy(true); setSent({ done: 0, total: targets.length, failed: [] });
    const failed = [];
    for (let i = 0; i < targets.length; i++) {
      try { await sendPasswordResetEmail(auth, targets[i].email); }
      catch (e) { failed.push({ email: targets[i].email, error: e.code === "auth/too-many-requests" ? "Too many mails just now. Try again later." : (e.code || e.message) }); }
      setSent({ done: i + 1, total: targets.length, failed: failed.slice() });
      await new Promise(r => setTimeout(r, 400));
    }
    setBusy(false);
  }

  const counts = (plan || []).reduce((a, r) => { a[r.state] = (a[r.state] || 0) + 1; return a; }, {});
  const okCount = results ? results.filter(r => r.ok).length : 0;
  const sendable = results ? results.filter(r => r.ok && r.canSend && (sendAlready || r.note !== "already in the portal")).length : 0;

  return (
    <div style={{ background: P.bg, minHeight: "100vh" }}>
      <TopBar title="Upload faculty list" subtitle={user.name} onBack={onBack} />
      <div style={{ padding: "20px clamp(14px, 3vw, 32px) 80px", maxWidth: 1100, margin: "0 auto", display: "grid", gap: 14 }}>
        <Card style={{ margin: 0, padding: "16px 18px" }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>1. Choose the Excel file</div>
          <div style={{ fontSize: 13.5, color: P.gray, lineHeight: 1.6, marginBottom: 12 }}>Name and college email (<b>@{COLLEGE_DOMAIN}</b>) for each faculty member. Employee ID and designation are optional. Someone who already has an account here is recognised by name, so what is already entered for them stays with them.</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <Btn small variant="outline" onClick={downloadFacultyTemplate}>Download template</Btn>
            <label>
              <span style={{ background: P.blue, color: "#fff", borderRadius: 8, padding: "8px 16px", fontSize: 13.5, fontWeight: 600, cursor: users ? "pointer" : "default", display: "inline-block", opacity: users ? 1 : 0.5 }}>Choose Excel file</span>
              <input type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} disabled={!users} onChange={e => { onFile(e.target.files[0]); e.target.value = ""; }} />
            </label>
          </div>
          {msg && <div style={{ fontSize: 13.5, color: P.red, marginTop: 10 }}>{msg}</div>}
        </Card>

        {plan && !results && (
          <Card style={{ margin: 0, padding: "16px 18px" }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>2. Check what will happen</div>
            <div style={{ fontSize: 13.5, color: P.gray, marginBottom: 10 }}>
              {plan.length} rows: {counts.new || 0} new, {counts.match || 0} attached to an existing account, {counts.exists || 0} already in the portal{counts.bad ? ", " + counts.bad + " with a problem (skipped)" : ""}. Nothing is created or emailed until you press the button below.
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 760 }}>
                <thead><tr>{["Row", "Name", "College email", "What happens"].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                <tbody>
                  {plan.map((r, i) => (
                    <tr key={i} style={{ background: r.state === "bad" ? P.redL : "transparent" }}>
                      <td style={td}>{r.rowNo}</td>
                      <td style={{ ...td, fontWeight: 600 }}>{r.name || "—"}</td>
                      <td style={td}>{r.email || "—"}</td>
                      <td style={td}>
                        {r.state === "bad" && <span style={{ color: P.red }}>{r.problem}</span>}
                        {r.state === "exists" && <span style={{ color: P.gray }}>Already in the portal ({r.existing})</span>}
                        {(r.state === "new" || r.state === "match") && (
                          <select value={r.state === "match" ? r.matchId : ""} onChange={e => setMatch(i, e.target.value)} style={sel}>
                            <option value="">New account</option>
                            {(r.candidates || []).map(c => <option key={c.id} value={c.id}>Attach to existing: {c.name}{c.role !== "faculty" ? " (" + c.role + ")" : ""}</option>)}
                          </select>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: 14 }}><Btn disabled={busy || !doable.length} onClick={create}>{busy ? "Creating…" : "Create " + doable.length + " account" + (doable.length === 1 ? "" : "s")}</Btn></div>
          </Card>
        )}

        {results && (
          <Card style={{ margin: 0, padding: "16px 18px", borderColor: P.green }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>3. Send the password links</div>
            <div style={{ fontSize: 13.5, color: P.gray, lineHeight: 1.6, marginBottom: 10 }}>
              {okCount} account{okCount === 1 ? "" : "s"} ready{results.length - okCount ? ", " + (results.length - okCount) + " failed (listed below)" : ""}. Each person gets an email with a link to set their own password, and then signs in with their college email.
            </div>
            {results.some(r => r.ok && r.note === "already in the portal") && (
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13.5, marginBottom: 10 }}>
                <input type="checkbox" checked={sendAlready} onChange={e => setSendAlready(e.target.checked)} style={{ accentColor: P.blue }} /> Also send to people who were already in the portal
              </label>
            )}
            {results.filter(r => !r.ok).map((r, i) => <div key={i} style={{ fontSize: 13, color: P.red, padding: "2px 0" }}>• {r.email}: {r.error}</div>)}
            {!sent && <div style={{ marginTop: 8 }}><Btn disabled={busy || !sendable} onClick={sendLinks}>Send {sendable} password link{sendable === 1 ? "" : "s"}</Btn></div>}
            {sent && (
              <div style={{ fontSize: 14, marginTop: 8 }}>
                <b>{sent.done} of {sent.total} sent.</b> {sent.done === sent.total && !busy ? "Tell them to check Spam or Junk too if it does not arrive." : "Sending…"}
                {sent.failed.map((f, i) => <div key={i} style={{ fontSize: 13, color: P.red }}>• {f.email}: {f.error}</div>)}
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
