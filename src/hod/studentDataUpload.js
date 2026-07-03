// src/hod/studentDataUpload.js
//
// Firestore shape written to:
//   students/{rollNumber}
//     name, parentName, parentOccupation, category, studentMobile, parentMobile, hostelType
//     feeBalance
//     semesters: {
//       "1": { sgpa: number, backlogs: [] },
//       ...up to the highest semester that has ANY data (SGPA or backlogs)
//     }
//
// Rules:
//   - Blank SGPA + backlogs present  → sgpa: 0, backlogs: [...]   (failed with listed subjects)
//   - SGPA = 0 explicitly            → sgpa: 0, backlogs: [...]   (failed, faculty confirmed)
//   - Blank SGPA + blank backlogs    → semester skipped entirely   (not yet reached)
//   - N = highest semester index that has SGPA (including 0) OR any backlog text
//   - Re-uploading is merge-safe: blank cells never overwrite existing Firestore data

import * as XLSX from "xlsx";
import { doc, writeBatch } from "firebase/firestore";
import { db } from "../firebase";

const CHUNK = 450;

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
    writer.slice(i, i + CHUNK).forEach(({ ref, data }) =>
      batch.set(ref, data, { merge: true })
    );
    await batch.commit();
  }
}

function isBlank(v) {
  return v === "" || v === null || v === undefined;
}

export async function uploadStudentRecords(file, mentorPhone) {
  const rows = await readSheet(file);
  const writes = rows
    .filter((r) => r.RollNumber)
    .map((r) => {
      const data = {};

      // Basic fields — only write if non-blank
      if (!isBlank(r.Name)) data.name = r.Name;
      if (!isBlank(r.ParentName)) data.parentName = r.ParentName;
      if (!isBlank(r.ParentOccupation)) data.parentOccupation = r.ParentOccupation;
      if (!isBlank(r.Category)) data.category = r.Category;
      if (!isBlank(r.StudentMobile)) data.studentMobile = String(r.StudentMobile);
      if (!isBlank(r.ParentMobile)) data.parentMobile = String(r.ParentMobile);
      if (!isBlank(r.HostelType)) data.hostelType = r.HostelType;
      if (!isBlank(r.FeeBalance)) data.feeBalance = Number(r.FeeBalance);

      // Semester processing
      const semesters = {};
      let highestSem = 0; // track N = highest semester with any data

      SEM_COLUMNS.forEach(([label, num]) => {
        const sgpaRaw = r[label + "_SGPA"];
        const backlogRaw = r[label + "_Backlogs"] ?? "";

        const sgpaBlank = isBlank(sgpaRaw);
        const backlogBlank = isBlank(backlogRaw) || String(backlogRaw).trim() === "";

        // Skip semester entirely if BOTH SGPA and backlogs are blank
        if (sgpaBlank && backlogBlank) return;

        // Parse backlogs — keep full text including brackets as-is
        const backlogs = String(backlogRaw)
          .split(",")
          .map((b) => b.trim())
          .filter(Boolean);

        // SGPA: blank means 0 (failed), explicit 0 also means failed
        const sgpa = sgpaBlank ? 0 : Number(sgpaRaw);

        semesters[num] = { sgpa, backlogs };
        if (num > highestSem) highestSem = num;
      });

      // Store N so HoDStudentLookup knows the range to display
      if (highestSem > 0) {
        data.semesters = semesters;
        data.completedSemesters = highestSem;
      }

      // Tag with mentor phone so mentor's page can list their students
      if (mentorPhone) data.mentorPhone = mentorPhone;

      return {
        ref: doc(db, "students", String(r.RollNumber).trim()),
        data,
      };
    });

  await commitInChunks(writes);
  return { count: writes.length };
}
