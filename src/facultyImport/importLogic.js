// src/facultyImport/importLogic.js
// Reading the uploaded faculty list (name, college email, and optionally Employee ID and designation) and working
// out, for every row, whether the person is new, already has an account to attach the email to, or has a problem.

import * as XLSX from "xlsx";
import { normEmail, isCollegeEmail, MASTER_ADMIN_PHONE } from "../utils";
import { scoreNames } from "../timetableUpload/smartParser";

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

const TITLES = new Set(["dr", "prof", "professor", "mr", "mrs", "ms", "er", "smt", "sri", "shri"]);
// the name as words in order, without titles, dots or capitals
const nameKey = n => clean(n).toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter(w => w && !TITLES.has(w)).join(" ");

// users: [{ id, name, email, role, status, ... }]
// state: bad (a problem, with `problem`), exists (that email is already in the portal), match (attach to an existing
// account: `matchId`, changeable), new (a new account)
export function planImport(rows, users) {
  const byEmail = new Map(users.filter(u => u.email).map(u => [normEmail(u.email), u]));
  const free = users.filter(u => !u.email && u.id !== MASTER_ADMIN_PHONE && u.status !== "rejected");
  const seen = new Map();
  const taken = new Set();
  return rows.map(r => {
    const base = { ...r, email: normEmail(r.email) };
    if (!r.name) return { ...base, state: "bad", problem: "No name." };
    if (!isCollegeEmail(r.email)) return { ...base, state: "bad", problem: r.email ? "Not a college email (@raghuenggcollege.in)." : "No email." };
    if (seen.has(base.email)) return { ...base, state: "bad", problem: "Same email as row " + seen.get(base.email) + "." };
    seen.set(base.email, r.rowNo);
    if (byEmail.has(base.email)) return { ...base, state: "exists", existing: byEmail.get(base.email).name || r.email };
    const scored = free.map(u => ({
      id: u.id, name: u.name || u.id, role: u.role || "faculty", score: scoreNames(r.name, u.name || ""),
      detail: [u.designation, /^\d{10}$/.test(u.id) ? "mobile ending " + u.id.slice(-4) : ""].filter(Boolean).join(", "),
      same: nameKey(r.name) === nameKey(u.name || ""),
    })).filter(c => c.score >= 55).sort((a, b) => b.score - a.score).slice(0, 5);
    // Attach by itself ONLY when the name is exactly the same (apart from Dr/Prof and dots) and it is the only one.
    // A similar name is just a suggestion the HoD must choose: two different people can look alike (K Arun / Karun).
    const same = scored.filter(c => c.same);
    const sure = same.length === 1 && same[0].role === "faculty" && !taken.has(same[0].id);
    if (sure) taken.add(same[0].id);
    return { ...base, state: sure ? "match" : "new", matchId: sure ? same[0].id : "", candidates: scored };
  });
}
