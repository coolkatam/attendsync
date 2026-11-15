// src/facultyImport/importLogic.js
// Reading the faculty list the HoD uploads: just two columns, Employee ID and college email. Everything else a person
// fills in themselves the first time they sign in.

import * as XLSX from "xlsx";
import { normEmail, isCollegeEmail, normEmpId } from "../utils";

const clean = v => String(v == null ? "" : v).normalize("NFKC").replace(/[​-‍﻿]/g, "").trim();
const key = v => clean(v).toLowerCase().replace(/[^a-z0-9]/g, "");

const HEADS = {
  employeeId: ["employeeid", "empid", "id", "facultyid", "employeecode", "empcode", "employeeno", "empno", "collegeid"],
  email: ["email", "emailid", "mail", "mailid", "collegeemail", "collegemail", "collegemailid", "collegeemailid", "emailaddress"],
};

// The first sheet with a heading row that has an Employee ID and an email column. With no heading row, the column
// holding the emails is found and the other one is taken as the Employee ID.
export function readFacultySheet(wb) {
  for (const sn of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: "" });
    if (!rows.length) continue;
    let head = -1, col = {};
    for (let r = 0; r < Math.min(rows.length, 8); r++) {
      const c = {};
      rows[r].forEach((cell, i) => { const k = key(cell); Object.keys(HEADS).forEach(f => { if (c[f] === undefined && HEADS[f].includes(k)) c[f] = i; }); });
      if (c.employeeId !== undefined && c.email !== undefined) { head = r; col = c; break; }
    }
    if (head < 0) {
      const at = i => rows.filter(r => /@/.test(clean(r[i]))).length;
      if (!at(0) && !at(1)) continue;
      col = at(0) > at(1) ? { email: 0, employeeId: 1 } : { employeeId: 0, email: 1 };
    }
    const out = [];
    rows.slice(head + 1).forEach((r, i) => {
      const employeeId = clean(r[col.employeeId]), email = normEmail(r[col.email]);
      if (!employeeId && !email) return;
      out.push({ rowNo: head + 2 + i, employeeId, email });
    });
    if (out.length) return out;
  }
  return [];
}

// users: [{ id, email, ... }]
// state: bad (a problem, with `problem`), exists (already in the portal), new (will be added)
export function planImport(rows, users) {
  const ids = new Set(users.map(u => u.id));
  const mails = new Map(users.filter(u => u.email).map(u => [normEmail(u.email), u]));
  const seenId = new Map(), seenMail = new Map();
  return rows.map(r => {
    const id = normEmpId(r.employeeId), email = normEmail(r.email);
    const base = { ...r, employeeId: id, email };
    if (!id) return { ...base, state: "bad", problem: "No Employee ID." };
    if (!isCollegeEmail(email)) return { ...base, state: "bad", problem: email ? "Not a college email (@raghuenggcollege.in)." : "No email." };
    if (seenId.has(id)) return { ...base, state: "bad", problem: "Same Employee ID as row " + seenId.get(id) + "." };
    if (seenMail.has(email)) return { ...base, state: "bad", problem: "Same email as row " + seenMail.get(email) + "." };
    seenId.set(id, r.rowNo); seenMail.set(email, r.rowNo);
    if (ids.has(id)) return { ...base, state: "exists", note: "Employee ID " + id + " is already in the portal" };
    if (mails.has(email)) return { ...base, state: "exists", note: "This email is already used by " + (mails.get(email).employeeId || mails.get(email).id) };
    return { ...base, state: "new" };
  });
}
