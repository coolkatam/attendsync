// src/facultyImport/FacultyImport.jsx
// The HoD or Master Admin adds faculty to the portal: one at a time, or a whole list from Excel. Only two things are
// asked, the Employee ID and the college email. Everything else the person fills in themselves at their first sign-in.
// No email is sent from here: the person asks for their own password link on the login page.

import React, { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import { collection, getDocs } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../firebase";
import { P, Btn, Card, TopBar } from "../components/UI";
import { readFacultySheet, planImport } from "./importLogic";
import { COLLEGE_DOMAIN, normEmpId, normEmail, isCollegeEmail } from "../utils";

const inp = { border: "1.5px solid " + P.border, borderRadius: 8, padding: "9px 11px", fontSize: 14, fontFamily: "inherit", background: "#fff", boxSizing: "border-box" };
const lbl = { display: "block", fontSize: 11.5, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: P.gray, marginBottom: 5 };
const th = { textAlign: "left", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: P.gray, padding: "6px 10px 6px 0", borderBottom: "1.5px solid " + P.border };
const td = { padding: "8px 10px 8px 0", borderBottom: "1px solid " + P.border, verticalAlign: "middle", fontSize: 13.5 };

export function downloadFacultyTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([["Employee ID", "College Email"], ["RE0009", "name@" + COLLEGE_DOMAIN]]);
  ws["!cols"] = [{ wch: 16 }, { wch: 36 }];
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
  const [one, setOne] = useState({ employeeId: "", email: "" });
  const [oneMsg, setOneMsg] = useState(null);

  useEffect(() => {
    getDocs(collection(db, "users")).then(s => setUsers(s.docs.map(d => ({ id: d.id, ...d.data() })))).catch(e => setMsg("Could not read the users (" + e.message + ")."));
  }, []);

  async function callAdd(rows) {
    const res = await httpsCallable(functions, "addFaculty")({ rows });
    return res.data.results;
  }

  async function addOne() {
    const id = normEmpId(one.employeeId), email = normEmail(one.email);
    if (!id) { setOneMsg({ ok: false, text: "Enter the Employee ID." }); return; }
    if (!isCollegeEmail(email)) { setOneMsg({ ok: false, text: "Enter the college email, like name@" + COLLEGE_DOMAIN + "." }); return; }
    setBusy(true); setOneMsg(null);
    try {
      const r = (await callAdd([{ employeeId: id, email }]))[0];
      if (r.ok) { setOneMsg({ ok: true, text: id + " is added. They can now sign in as a New user with this Employee ID and email." }); setOne({ employeeId: "", email: "" }); setUsers(u => (u || []).concat({ id, employeeId: id, email })); }
      else setOneMsg({ ok: false, text: r.error });
    } catch (e) { setOneMsg({ ok: false, text: e.message || "Could not add." }); }
    setBusy(false);
  }

  function onFile(file) {
    if (!file || !users) return;
    setResults(null); setMsg("Reading the file…");
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const rows = readFacultySheet(XLSX.read(e.target.result, { type: "array" }));
        if (!rows.length) { setPlan(null); setMsg("I could not find Employee IDs and emails in that file. Use the template: Employee ID and College Email columns."); return; }
        setPlan(planImport(rows, users)); setMsg("");
      } catch (err) { setPlan(null); setMsg("Could not read that file. Please use the template."); }
    };
    reader.readAsArrayBuffer(file);
  }

  const toAdd = (plan || []).filter(r => r.state === "new");
  async function addAll() {
    setBusy(true); setMsg("");
    try { setResults(await callAdd(toAdd.map(r => ({ employeeId: r.employeeId, email: r.email })))); }
    catch (e) { setMsg("Could not add them (" + (e.message || e) + "). Nothing was changed."); }
    setBusy(false);
  }

  const counts = (plan || []).reduce((a, r) => { a[r.state] = (a[r.state] || 0) + 1; return a; }, {});
  const okCount = results ? results.filter(r => r.ok).length : 0;

  return (
    <div style={{ background: P.bg, minHeight: "100vh" }}>
      <TopBar title="Add faculty" subtitle={user.name} onBack={onBack} />
      <div style={{ padding: "20px clamp(14px, 3vw, 32px) 80px", maxWidth: 1000, margin: "0 auto", display: "grid", gap: 14 }}>
        <Card style={{ margin: 0, padding: "16px 18px" }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Add one faculty member</div>
          <div style={{ fontSize: 13.5, color: P.gray, lineHeight: 1.6, marginBottom: 12 }}>Only two things are needed. The person fills in their own name, designation and other details when they first sign in.</div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div><span style={lbl}>Employee ID</span><input value={one.employeeId} onChange={e => setOne({ ...one, employeeId: e.target.value })} placeholder="e.g. RE0009" style={{ ...inp, width: 170 }} /></div>
            <div><span style={lbl}>College email</span><input value={one.email} onChange={e => setOne({ ...one, email: e.target.value })} placeholder={"name@" + COLLEGE_DOMAIN} style={{ ...inp, width: 300 }} /></div>
            <Btn disabled={busy} onClick={addOne}>Add</Btn>
          </div>
          {oneMsg && <div style={{ fontSize: 13.5, marginTop: 10, color: oneMsg.ok ? P.green : P.red }}>{oneMsg.text}</div>}
        </Card>

        <Card style={{ margin: 0, padding: "16px 18px" }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Or upload a list from Excel</div>
          <div style={{ fontSize: 13.5, color: P.gray, lineHeight: 1.6, marginBottom: 12 }}>Two columns: <b>Employee ID</b> and <b>College Email</b> (@{COLLEGE_DOMAIN}). Each row is added as a new person.</div>
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
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Check, then add</div>
            <div style={{ fontSize: 13.5, color: P.gray, marginBottom: 10 }}>
              {plan.length} rows: {counts.new || 0} will be added, {counts.exists || 0} already in the portal (skipped){counts.bad ? ", " + counts.bad + " with a problem (skipped)" : ""}. Nothing is added until you press the button.
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 560 }}>
                <thead><tr>{["Row", "Employee ID", "College email", "What happens"].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                <tbody>
                  {plan.map((r, i) => (
                    <tr key={i} style={{ background: r.state === "bad" ? P.redL : "transparent" }}>
                      <td style={td}>{r.rowNo}</td>
                      <td style={{ ...td, fontWeight: 600 }}>{r.employeeId || "—"}</td>
                      <td style={td}>{r.email || "—"}</td>
                      <td style={td}>
                        {r.state === "bad" && <span style={{ color: P.red }}>{r.problem}</span>}
                        {r.state === "exists" && <span style={{ color: P.gray }}>{r.note}</span>}
                        {r.state === "new" && <span style={{ color: P.green, fontWeight: 600 }}>Will be added</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: 14 }}><Btn disabled={busy || !toAdd.length} onClick={addAll}>{busy ? "Adding…" : "Add " + toAdd.length + " " + (toAdd.length === 1 ? "person" : "people")}</Btn></div>
          </Card>
        )}

        {results && (
          <Card style={{ margin: 0, padding: "16px 18px", borderColor: P.green }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{okCount} added{results.length - okCount ? ", " + (results.length - okCount) + " not added" : ""}</div>
            <div style={{ fontSize: 13.5, color: P.gray, lineHeight: 1.6, marginBottom: 8 }}>Tell the faculty to open the portal, choose <b>New user</b>, and enter their Employee ID and college email. A link to create their password is emailed to them then.</div>
            {results.filter(r => !r.ok).map((r, i) => <div key={i} style={{ fontSize: 13, color: P.red, padding: "2px 0" }}>• {r.employeeId} ({r.email}): {r.error}</div>)}
          </Card>
        )}
      </div>
    </div>
  );
}
