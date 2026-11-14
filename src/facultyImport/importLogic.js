// src/facultyImport/importLogic.js
// Reading the uploaded faculty list (name, college email, and optionally Employee ID and designation) and working
// out, for every row, whether the person gets a new account, is already in the portal, or has a problem.
// Nobody is ever attached to an existing account: every new row becomes a new account.

import * as XLSX from "xlsx";
import { normEmail, isCollegeEmail } from "../utils";

const clean = v => String(v == null ? "" : v).normalize("NFKC").replace(/[​-‍﻿]/g, "").trim();
const key = v => clean(v).toLowerCase().replace(/[^a-z0-9]/g, "");

const HEADS = {
  name: ["name", "fullname", "facultyname", "nameofthefaculty", "nameoffaculty", "facultyfullname", "employeename"],
  email: ["email", "emailid", "mail", "mailid", "collegeemail", "collegemail", "collegemailid", "collegeemailid", "emailaddress"],
  employeeId: ["employeeid", "empid", "id", "collegeid", "facultyid", "employeecode", "empcode"],
  designation: ["designation", "post", "position"],
};

// The first sheet with a heading row that has a name and an email column. Falls back to "first column is the name,
// second is the email" when there is no heading row.
export function readFacultySheet(wb) {
  for (const sn of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: "" });
    if (!rows.length) continue;
    let head = -1, col = {};
    for (let r = 0; r < Math.min(rows.length, 8); r++) {
      const c = {};
      rows[r].forEach((cell, i) => { const k = key(cell); Object.keys(HEADS).forEach(f => { if (c[f] === undefined && HEADS[f].includes(k)) c[f] = i; }); });
      if (c.name !== undefined && c.email !== undefined) { head = r; col = c; break; }
    }
    if (head < 0) {
      const looksLikeEmail = rows.some(r => /@/.test(clean(r[1])) || /@/.test(clean(r[0])));
      if (!looksLikeEmail) continue;
      const emailFirst = rows.filter(r => /@/.test(clean(r[0]))).length > rows.filter(r => /@/.test(clean(r[1]))).length;
      col = emailFirst ? { email: 0, name: 1 } : { name: 0, email: 1 };
      head = -1;
    }
    const out = [];
    rows.slice(head + 1).forEach((r, i) => {
      const name = clean(r[col.name]), email = normEmail(r[col.email]);
      if (!name && !email) return;
      out.push({ rowNo: head + 2 + i, name, email, employeeId: col.employeeId !== undefined ? clean(r[col.employeeId]) : "", designation: col.designation !== undefined ? clean(r[col.designation]) : "" });
    });
    if (out.length) return out;
  }
  return [];
}

// users: [{ id, name, email, ... }]
// state: bad (a problem, with `problem`), exists (that email is already in the portal), new (a new account)
export function planImport(rows, users) {
  const byEmail = new Map(users.filter(u => u.email).map(u => [normEmail(u.email), u]));
  const seen = new Map();
  return rows.map(r => {
    const base = { ...r, email: normEmail(r.email) };
    if (!r.name) return { ...base, state: "bad", problem: "No name." };
    if (!isCollegeEmail(r.email)) return { ...base, state: "bad", problem: r.email ? "Not a college email (@raghuenggcollege.in)." : "No email." };
    if (seen.has(base.email)) return { ...base, state: "bad", problem: "Same email as row " + seen.get(base.email) + "." };
    seen.set(base.email, r.rowNo);
    if (byEmail.has(base.email)) return { ...base, state: "exists", existing: byEmail.get(base.email).name || r.email };
    return { ...base, state: "new" };
  });
}
