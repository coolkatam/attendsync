import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import * as XLSX from "xlsx-js-style";
import { buildSpec, designVersions, verify } from "./generator";
import { defaultAnswers } from "./designModel";
import { buildDesignWorkbook, sectionsOf } from "./designExport";
import { facultySheet, subjectColours } from "../timetableUpload/reportBuilder";
import { computeWorkload } from "../timetableUpload/overlapCheck";
import { checkEdit } from "../timetableUpload/editChecks";

jest.mock("../firebase", () => ({ db: {} }));
jest.mock("firebase/firestore", () => ({ collection: () => ({}), doc: () => ({}), getDoc: async () => ({ exists: () => false }), getDocs: async () => ({ forEach: () => {}, docs: [] }), onSnapshot: () => () => {} }));
const VersionEditor = require("./VersionEditor").default;

const people = [1, 2, 3, 4, 5, 6, 7, 8].map(i => ({ phone: "p" + i, name: "Dr " + i }));
const mkSec = (id, off) => ({ id, name: "III-" + id, subjects: [
  { name: "T1", token: "T1", type: "Theory", faculty: ["p" + (1 + off)] }, { name: "T2", token: "T2", type: "Theory", faculty: ["p" + (2 + off)] },
  { name: "T3", token: "T3", type: "Theory", faculty: ["p" + (3 + off)] }, { name: "L1", token: "L" + id, type: "Lab", faculty: ["p" + (4 + off)] }] });
function setup(labsOverlap) {
  const a = defaultAnswers(); a.allowBlank = true; a.labsOverlap = labsOverlap;
  ["T1", "T2", "T3"].forEach(n => { a.loads[n] = { periods: 4, block: 1 }; }); a.loads.L1 = { periods: 3, block: 3 };
  const { spec } = buildSpec({ year: "III", a, sections: [mkSec("s1", 0), mkSec("s2", 4)], people, published: [] });
  return spec;
}
const labsClash = blocks => {
  const labs = blocks.filter(b => b.type === "lab");
  return labs.some((x, i) => labs.some((y, j) => j > i && x.sectionId !== y.sectionId && x.day === y.day && x.start < y.end && y.start < x.end));
};

test("labs of different sections never overlap when the coordinator says so", () => {
  const spec = setup(false);
  const res = designVersions(spec, people, { count: 3, seed: 3 });
  expect(res.versions.length).toBeGreaterThan(0);
  res.versions.forEach(v => { expect(verify(spec, v.blocks)).toEqual([]); expect(labsClash(v.blocks)).toBe(false); });
});

test("verify reports labs that overlap when they are not allowed, and allows them otherwise", () => {
  const free = setup(true), strict = setup(false);
  const res = designVersions(free, people, { count: 6, seed: 11 });
  const clashing = res.versions.find(v => labsClash(v.blocks));
  if (clashing) {
    expect(verify(strict, clashing.blocks).some(t => /same time/.test(t))).toBe(true);
    expect(verify(free, clashing.blocks)).toEqual([]);
  }
});

test("an edit that puts two sections' labs together is refused when labs may not overlap", () => {
  const spec = setup(false);
  const v = designVersions(spec, people, { count: 1, seed: 3 }).versions[0];
  const l1 = v.blocks.find(b => b.type === "lab" && b.sectionId === "s1");
  const l2 = v.blocks.find(b => b.type === "lab" && b.sectionId === "s2");
  const moved = v.blocks.map(b => (b.id === l2.id ? { ...b, day: l1.day, start: l1.start, end: l1.end, id: "moved" } : b));
  expect(checkEdit(moved, ["moved"], [], { noLabOverlap: true }).problems.some(p => /may not overlap/.test(p.text))).toBe(true);
  expect(checkEdit(moved, ["moved"], [], {}).problems.some(p => /may not overlap/.test(p.text))).toBe(false);
});

test("the individual timetable shows the breaks, the name in the middle and the load in the corner", () => {
  const spec = setup(true);
  const v = designVersions(spec, people, { count: 1, seed: 3 }).versions[0];
  const ws = facultySheet(v.blocks, computeWorkload(v.blocks), sectionsOf(spec), subjectColours(v.blocks), spec.D);
  const text = Object.keys(ws).filter(k => k[0] !== "!").map(k => String(ws[k].v));
  expect(text.some(t => /^Faculty/i.test(t))).toBe(false);            // no "Faculty:" phrase
  expect(text.some(t => /^DR \d$/.test(t))).toBe(true);               // just the name
  expect(text.some(t => /^Total load: \d+ periods$/.test(t))).toBe(true);
  expect(text).toContain("L U N C H");
  expect(text).toContain("B R E A K");
  const tall = (ws["!merges"] || []).filter(m => m.s.c === m.e.c && m.e.r - m.s.r === spec.D - 1);
  expect(tall.length).toBeGreaterThanOrEqual(2);                       // break and lunch run down every day
  // every cell sits in only one merged range (an overlap would make Excel complain)
  const covered = new Set();
  (ws["!merges"] || []).forEach(m => { for (let r = m.s.r; r <= m.e.r; r++) for (let c = m.s.c; c <= m.e.c; c++) { const k = r + ":" + c; expect(covered.has(k)).toBe(false); covered.add(k); } });
  const wb = buildDesignWorkbook(spec, [v]);
  expect(wb.SheetNames).toEqual(["TT-1", "Ind-1"]);
  expect(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }).length).toBeGreaterThan(1000);
});

test("minor changes: the editor opens a class with move, swap and faculty, but no remove", () => {
  window.confirm = jest.fn(() => true);
  const spec = setup(true);
  const v = designVersions(spec, people, { count: 1, seed: 3 }).versions[0];
  render(<VersionEditor spec={spec} n={1} blocks={v.blocks} others={[]} people={people} colourOf={subjectColours(v.blocks)} onSave={jest.fn()} onCancel={() => {}} />);
  expect(screen.getByText("Minor changes to Version 1")).toBeTruthy();
  expect(screen.getByText(/^Save changes/).closest("button").style.opacity).toBe("0.5");     // nothing changed yet
  fireEvent.click(screen.getAllByText("T1")[0]);
  expect(screen.getByText("Move to")).toBeTruthy();
  expect(screen.getByText("Change faculty")).toBeTruthy();
  expect(screen.queryByText("Remove this class")).toBeNull();
});

test("minor changes: swapping two classes of a section is checked and can be saved", () => {
  const spec = setup(true);
  const v = designVersions(spec, people, { count: 1, seed: 3 }).versions[0];
  const onSave = jest.fn();
  render(<VersionEditor spec={spec} n={1} blocks={v.blocks} others={[]} people={people} colourOf={subjectColours(v.blocks)} onSave={onSave} onCancel={() => {}} />);
  // try every swap of the first theory class until one is accepted (some would clash for a faculty member)
  fireEvent.click(screen.getAllByText("T1")[0]);
  const select = screen.getAllByRole("combobox").find(s => Array.from(s.options).some(o => o.text === "Choose…"));
  let done = false;
  for (const o of Array.from(select.options).filter(x => x.value)) {
    fireEvent.change(select, { target: { value: o.value } });
    fireEvent.click(screen.getByText("Swap"));
    if (screen.queryByText(/^Swapped /)) { done = true; break; }
    fireEvent.click(screen.getAllByText("T1")[0]);
    break;
  }
  const saved = screen.queryByText(/^Save changes \(1\)/);
  if (done) { expect(saved).toBeTruthy(); fireEvent.click(saved); expect(onSave).toHaveBeenCalled(); expect(onSave.mock.calls[0][0].length).toBe(v.blocks.length); }
  else expect(screen.getByText(/Not changed/)).toBeTruthy();
});
