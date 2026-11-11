import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { buildSpec, designVersions, verify } from "./generator";
import { defaultAnswers } from "./designModel";
import { mergeSections } from "../timetableUpload/publishMaster";

const mockUsers = ["p1", "p2", "p3"].map((id, i) => ({ id, data: () => ({ name: "Dr Person " + (i + 1), status: "approved" }) }));
const mkSec = (id, name) => ({
  id, data: () => ({
    name, adminPhone: "9", periodsPerDay: 7,
    subjects: [
      { id: "a", name: "Thermodynamics", short: "TD", type: "Theory", faculty: ["p1"], facultyPhone: "p1" },
      { id: "b", name: "Fluid Mechanics", short: "FM", type: "Theory", faculty: ["p2"], facultyPhone: "p2" },
    ],
  }),
});
const mockSections = [mkSec("s1", "III YR I SEM SL-1"), mkSec("s2", "III YR I SEM AL-1")];
jest.mock("../firebase", () => ({ db: {} }));
jest.mock("firebase/firestore", () => {
  const snap = name => { const docs = name === "sections" ? mockSections : name === "users" ? mockUsers : []; return { docs, forEach: fn => docs.forEach(fn) }; };
  return { collection: (_db, name) => ({ __name: name }), onSnapshot: (ref, cb) => { cb(snap(ref.__name)); return () => {}; }, getDocs: async ref => snap(ref.__name) };
});
const DesignScreen = require("./DesignScreen").default;

const people = [1, 2, 3, 4].map(i => ({ phone: "p" + i, name: "Dr " + i }));
const mk = (id, name) => ({ id, name, subjects: ["T1", "T2", "T3"].map((n, i) => ({ name: n, token: n, type: "Theory", faculty: ["p" + (i + 1)] })) });

test("a section with blank periods is refused, and the message says how many", () => {
  const a = defaultAnswers();
  ["T1", "T2", "T3"].forEach(n => { a.loads[n] = { periods: 4, block: 1 }; });
  const { problems } = buildSpec({ year: "III", a, sections: [mk("s1", "III-A")], people, published: [] });
  const e = problems.find(p => /blank period/.test(p.text));
  expect(e).toBeTruthy();
  expect(e.step).toBe("subj");
  expect(e.text).toMatch(/12 of 39 are filled/);   // six days: five of 7 periods and a 4-period Saturday
});

test("a completely filled week is accepted", () => {
  const a = defaultAnswers();
  a.days = 5; a.periodsPerDay = 7;                  // 35 periods
  ["T1", "T2", "T3"].forEach(n => { a.loads[n] = { periods: 4, block: 1 }; });
  a.extras = [{ ...require("./designModel").newExtra("Library"), periods: 23 }];
  const { problems } = buildSpec({ year: "III", a, sections: [mk("s1", "III-A")], people, published: [] });
  expect(problems.filter(p => /blank period|too many|needs/.test(p.text))).toEqual([]);
});

test("designing one section keeps clear of the same faculty's classes in a section already published", () => {
  const a = defaultAnswers(); a.allowBlank = true;
  ["T1", "T2", "T3"].forEach(n => { a.loads[n] = { periods: 4, block: 1 }; });
  // III-B is already published: the same teacher p1 teaches T1 in it on Monday period 1 and 2
  const periods = buildSpec({ year: "III", a, sections: [mk("s1", "III-A")], people, published: [] }).spec.timings.periods;
  const published = [0, 1].map(i => ({ id: "s2:0:" + periods[i].start + ":T1", sectionId: "s2", sectionName: "III-B", day: 0, start: periods[i].start, end: periods[i].end, token: "T1", subject: "T1", type: "theory", combo: "", periods: 1, faculty: [{ key: "p1", name: "Dr 1", phone: "p1", external: false, role: "main" }], source: "published", publishedYear: "III" }));
  const { spec } = buildSpec({ year: "III", a, sections: [mk("s1", "III-A")], people, published });
  const res = designVersions(spec, people, { count: 2, seed: 4 });
  expect(res.versions.length).toBeGreaterThan(0);
  res.versions.forEach(v => {
    expect(verify(spec, v.blocks)).toEqual([]);
    const mon = v.blocks.filter(b => b.day === 0 && b.token === "T1");
    mon.forEach(b => expect(b.start >= periods[2].start).toBe(true));     // not in the two periods p1 already has
  });
});

test("the daily limit counts classes the faculty already has in published sections", () => {
  const a = defaultAnswers(); a.allowBlank = true; a.days = 5; a.maxTotalPerDay = 4; a.maxTheoryPerDay = 4;
  ["T1", "T2", "T3"].forEach(n => { a.loads[n] = { periods: 5, block: 1 }; });
  const periods = buildSpec({ year: "III", a, sections: [mk("s1", "III-A")], people, published: [] }).spec.timings.periods;
  // p1 already has 4 periods on every day in published sections: no room for T1
  const published = [];
  for (let d = 0; d < 5; d++) for (let i = 0; i < 4; i++) published.push({ id: "s2:" + d + ":" + periods[i].start + ":T9", sectionId: "s2", sectionName: "III-B", day: d, start: periods[i].start, end: periods[i].end, token: "T9", subject: "T9", type: "theory", combo: "", periods: 1, faculty: [{ key: "p1", name: "Dr 1", phone: "p1", external: false, role: "main" }], source: "published", publishedYear: "III" });
  const { problems } = buildSpec({ year: "III", a, sections: [mk("s1", "III-A")], people, published });
  expect(problems.some(p => p.step === "lim" && /Dr 1/.test(p.text) && /already have in published/.test(p.text))).toBe(true);
});

test("publishing some sections keeps the year's other sections", () => {
  const existing = { blocks: [{ id: "x1", sectionId: "s1" }, { id: "x2", sectionId: "s2" }], sections: [{ id: "s1", name: "A", slots: [] }, { id: "s2", name: "B", slots: [] }] };
  const out = mergeSections(existing, [{ id: "n1", sectionId: "s1" }, { id: "n2", sectionId: "s1" }], [{ id: "s1", name: "A", slots: [1] }]);
  expect(out.blocks.map(b => b.id).sort()).toEqual(["n1", "n2", "x2"]);
  expect(out.sections.map(s => s.id).sort()).toEqual(["s1", "s2"]);
  expect(out.sections.find(s => s.id === "s1").slots).toEqual([1]);
  expect(mergeSections(null, [1], [2])).toEqual({ blocks: [1], sections: [2] });
});

test("the Year tab lets you pick the section or sections to design", async () => {
  localStorage.clear();
  render(<DesignScreen user={{ phone: "9", role: "hod", name: "T" }} onBack={() => {}} />);
  await screen.findByText("Which section?");
  const boxes = screen.getAllByRole("checkbox");
  expect(boxes.length).toBe(2);
  expect(boxes[0].checked).toBe(false);       // nothing is ticked by default
  expect(boxes[1].checked).toBe(false);
  expect(screen.getByText(/No section is chosen yet/)).toBeTruthy();
  expect(screen.getByText("Next →").closest("button").style.opacity).toBe("0.5");   // can't go on yet
  fireEvent.click(boxes[1]);
  expect(screen.getAllByRole("checkbox")[1].checked).toBe(true);
  fireEvent.click(boxes[0]);                  // two together
  expect(screen.getAllByRole("checkbox")[0].checked).toBe(true);
  fireEvent.click(screen.getByText("Clear"));
  expect(screen.getAllByRole("checkbox")[1].checked).toBe(false);
  // other tabs wait until a section is chosen
  fireEvent.click(screen.getByText("3. Subjects and periods"));
  expect(screen.getByText("Choose the section first")).toBeTruthy();
});

test("a section never has two lab sessions on one day, in any version", () => {
  const a = defaultAnswers(); a.allowBlank = true;
  const sec = { id: "s1", name: "III-A", subjects: [
    { name: "T1", token: "T1", type: "Theory", faculty: ["p1"] }, { name: "T2", token: "T2", type: "Theory", faculty: ["p2"] },
    { name: "Lab A", token: "LA", type: "Lab", faculty: ["p3"] }, { name: "Lab B", token: "LB", type: "Lab", faculty: ["p4"] }, { name: "Lab C", token: "LC", type: "Lab", faculty: ["p1"] },
  ] };
  ["T1", "T2"].forEach(n => { a.loads[n] = { periods: 4, block: 1 }; });
  ["Lab A", "Lab B", "Lab C"].forEach(n => { a.loads[n] = { periods: 3, block: 3 }; });
  const { spec, problems } = buildSpec({ year: "III", a, sections: [sec], people, published: [] });
  expect(problems.filter(p => p.level === "error")).toEqual([]);
  const res = designVersions(spec, people, { count: 3, seed: 21 });
  expect(res.versions.length).toBeGreaterThan(0);
  res.versions.forEach(v => {
    const perDay = {};
    v.blocks.filter(b => b.type === "lab").forEach(b => { perDay[b.day] = (perDay[b.day] || 0) + 1; });
    Object.values(perDay).forEach(n => expect(n).toBe(1));
  });
});

test("Start again clears the answers and returns to the first tab", async () => {
  localStorage.clear();
  window.confirm = jest.fn(() => true);
  window.scrollTo = jest.fn();
  render(<DesignScreen user={{ phone: "9", role: "hod", name: "T" }} onBack={() => {}} />);
  await screen.findByText("Which section?");
  fireEvent.click(screen.getAllByRole("checkbox")[0]);
  fireEvent.click(screen.getByText("2. Days and periods"));
  expect(screen.getByText("Here are the timings")).toBeTruthy();
  fireEvent.click(screen.getByText("Start again"));
  expect(window.confirm).toHaveBeenCalled();
  await screen.findByText("Which section?");
  expect(localStorage.getItem("ttdesign-v1:9:III")).not.toMatch(/timingsConfirmed":true/);
});

test("a section saved under the wrong year is flagged", () => {
  const { yearWarningsFor } = require("./DesignScreen");
  const subj = ["A", "B", "C", "D"].map(n => ({ name: "Sub " + n }));
  const raw = [
    { id: "x", name: "III YR I SEM SL-2", year: "IV", subjects: subj },
    { id: "y", name: "III YR I SEM SL-1", subjects: subj },
    { id: "z", name: "IV YR I SEM AL-1", subjects: [{ name: "Other 1" }, { name: "Other 2" }, { name: "Other 3" }] },
  ];
  const w = yearWarningsFor([{ id: "x", name: raw[0].name }], raw, "IV");
  expect(w.length).toBe(1);
  expect(w[0].text).toMatch(/name says Year III/);
  // a correct section raises nothing
  expect(yearWarningsFor([{ id: "z", name: raw[2].name }], raw, "IV")).toEqual([]);
  // no year in the name, but its subjects are another year's
  const raw2 = [{ id: "x", name: "SL-2", year: "IV", subjects: subj }, { id: "y", name: "III SL-1", subjects: subj }];
  expect(yearWarningsFor([{ id: "x", name: "SL-2", subjects: subj }], raw2, "IV")[0].text).toMatch(/100%/);
});
