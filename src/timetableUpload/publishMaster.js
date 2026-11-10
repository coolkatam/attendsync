// src/timetableUpload/publishMaster.js
// Saves a year's timetable as the master timetable (masterTimetables/{year}). Used when an uploaded sheet is published,
// when a designed version is published, and when a published timetable is edited on screen.

import { doc, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "../firebase";

export function masterData({ year, blocks, sections, user, fileName = "", keepFrom = null, edited = false }) {
  const keep = b => ({
    id: b.id, sectionId: b.sectionId, sectionName: b.sectionName, day: b.day, start: b.start, end: b.end,
    token: b.token, subject: b.subject, type: b.type, combo: b.combo || "", periods: b.periods,
    faculty: b.faculty.map(f => ({ key: f.key, name: f.name, phone: f.phone || null, external: !!f.external, role: f.role })),
  });
  const base = {
    year,
    blocks: blocks.map(keep),
    sections: sections.map(sec => ({ id: sec.id, name: sec.name, slots: sec.slots.map(x => ({ start: x.start, end: x.end, brk: !!x.brk, ...(x.label ? { label: x.label } : {}) })) })),
    publishedBy: user.phone, publishedByName: user.name || user.phone, publishedAt: new Date().toISOString(),
    fileName,
  };
  if (edited && keepFrom) {
    base.publishedBy = keepFrom.publishedBy || user.phone;
    base.publishedByName = keepFrom.publishedByName || user.name || user.phone;
    base.publishedAt = keepFrom.publishedAt || base.publishedAt;
    base.fileName = keepFrom.fileName || "";
    base.lastEditedBy = user.phone; base.lastEditedByName = user.name || user.phone; base.lastEditedAt = new Date().toISOString();
  }
  return JSON.parse(JSON.stringify(base));
}

export async function publishMaster(args) {
  const data = masterData(args);
  if (JSON.stringify(data).length > 900000) throw new Error("this timetable is too large to store in one piece");
  await setDoc(doc(db, "masterTimetables", args.year), data);
  return data;
}

// Publishing some sections of a year keeps the year's other sections as they are: the sections given replace their
// own classes and timings, everything else in the existing year is carried over.
export function mergeSections(existing, blocks, sections) {
  if (!existing) return { blocks, sections };
  const ids = new Set(sections.map(x => x.id));
  return {
    blocks: (existing.blocks || []).filter(b => !ids.has(b.sectionId)).concat(blocks),
    sections: (existing.sections || []).filter(x => !ids.has(x.id)).concat(sections),
  };
}

// Takes some sections out of a published year. If none are left, the year's timetable is withdrawn altogether.
export async function removeSections({ year, existing, sectionIds, user }) {
  const ids = new Set(sectionIds);
  const blocks = (existing.blocks || []).filter(b => !ids.has(b.sectionId));
  const sections = (existing.sections || []).filter(x => !ids.has(x.id));
  if (sections.length === 0) { await deleteDoc(doc(db, "masterTimetables", year)); return null; }
  return publishMaster({ year, blocks, sections, user, edited: true, keepFrom: existing });
}
