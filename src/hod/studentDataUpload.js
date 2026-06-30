// studentDataUpload.js
// Drop into src/hod/studentDataUpload.js
//
// Firestore shape this writes to:
//   students/{rollNumber}
//     name, parentName, parentOccupation, category, studentMobile, parentMobile, hostelType
//     feeBalance, feeAsOnDate
//     semesters: { "1": { sgpa, backlogs: [] }, "2": {...}, ... }   (only semesters with data entered)
//
// Both upload functions UPSERT with setDoc(..., { merge: true }), and only include a field in the
// write if the source cell was non-blank — so a blank cell never overwrites existing data with 0/"".

import * as XLSX from "xlsx";
import { doc, writeBatch } from "firebase/firestore";
import { db } from "../firebase";

const CHUNK = 450; // stay under Firestore's 500-write batch limit

const SEM_COLUMNS = [
  ["I-I", 1], ["I-II", 2], ["II-I", 3], ["II-II", 4],
  ["III-I", 5], ["III-II", 6], ["IV-I", 7], ["IV-II", 8],
];

function readSheet(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        resolve(XLSX.utils.sheet_to_json(ws, { defval: "" }));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

async function commitInChunks(writer) {
  for (let i = 0; i < writer.length; i += CHUNK) {
    const batch = writeBatch(db);
    writer.slice(i, i + CHUNK).forEach(({ ref, data }) => batch.set(ref, data, { merge: true }));
    await batch.commit();
  }
}

function isBlank(v) {
  return v === "" || v === null || v === undefined;
}

/** Sheet: StudentRecords (the wide one-row-per-student template) */
export async function uploadStudentRecords(file) {
  const rows = await readSheet(file);
  const writes = rows
    .filter((r) => r.RollNumber)
    .map((r) => {
      const data = {};
      if (!isBlank(r.Name)) data.name = r.Name;
      if (!isBlank(r.ParentName)) data.parentName = r.ParentName;
      if (!isBlank(r.ParentOccupation)) data.parentOccupation = r.ParentOccupation;
      if (!isBlank(r.Category)) data.category = r.Category;
      if (!isBlank(r.StudentMobile)) data.studentMobile = String(r.StudentMobile);
      if (!isBlank(r.ParentMobile)) data.parentMobile = String(r.ParentMobile);
      if (!isBlank(r.HostelType)) data.hostelType = r.HostelType;
      if (!isBlank(r.FeeBalance)) data.feeBalance = Number(r.FeeBalance);

      const semesters = {};
      SEM_COLUMNS.forEach(([label, num]) => {
        const sgpaCell = r[label + "_SGPA"];
        if (isBlank(sgpaCell)) return; // skip semesters not yet entered
        const backlogs = String(r[label + "_Backlogs"] ?? "")
          .split(",")
          .map((b) => b.trim())
          .filter(Boolean);
        semesters[num] = { sgpa: Number(sgpaCell), backlogs };
      });
      if (Object.keys(semesters).length) data.semesters = semesters;

      return { ref: doc(db, "students", String(r.RollNumber).trim()), data };
    });
  await commitInChunks(writes);
  return { count: writes.length };
}

/** Sheet: FeeBalance (RollNumber, Name, FeeBalance, AsOnDate) — for ad-hoc updates from accounts office */
export async function uploadFeeBalance(file) {
  const rows = await readSheet(file);
  const writes = rows
    .filter((r) => r.RollNumber && !isBlank(r.FeeBalance))
    .map((r) => ({
      ref: doc(db, "students", String(r.RollNumber).trim()),
      data: {
        feeBalance: Number(r.FeeBalance),
        feeAsOnDate: r.AsOnDate || "",
      },
    }));
  await commitInChunks(writes);
  return { count: writes.length };
}
