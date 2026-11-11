import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { buildSpec, designVersions } from "./generator";
import { buildDesignWorkbook } from "./designExport";
import { defaultAnswers } from "./designModel";

const mockUsers = ["p1", "p2", "p3", "p4", "p5", "p6"].map((id, i) => ({ id, data: () => ({ name: "Dr Person " + (i + 1), status: "approved" }) }));
const mkSec = (id, name) => ({
  id, data: () => ({
    name, adminPhone: "9", periodsPerDay: 7,
    subjects: [
      { id: "a", name: "Thermodynamics", short: "TD", type: "Theory", faculty: ["p1"], facultyPhone: "p1" },
      { id: "b", name: "Fluid Mechanics", short: "FM", type: "Theory", faculty: ["p2"], facultyPhone: "p2" },
      { id: "c", name: "Machine Design", short: "MD", type: "Theory", faculty: ["p3"], facultyPhone: "p3" },
      { id: "d", name: "Heat Transfer", short: "HT", type: "Theory", faculty: ["p4"], facultyPhone: "p4" },
      { id: "e", name: "Thermal Lab", short: "TL", type: "Lab", faculty: ["p5", "p6"], facultyPhone: "p5" },
    ],
  }),
});
const mockSections = [mkSec("s1", "III YR I SEM SL-1"), mkSec("s2", "III YR I SEM AL-1")];

jest.mock("../firebase", () => ({ db: {} }));
jest.mock("firebase/firestore", () => {
  const snap = name => {
    const docs = name === "sections" ? mockSections : name === "users" ? mockUsers : [];
    return { docs, forEach: fn => docs.forEach(fn) };
  };
  return {
    collection: (_db, name) => ({ __name: name }),
    onSnapshot: (ref, cb) => { cb(snap(ref.__name)); return () => {}; },
    getDocs: async ref => snap(ref.__name),
  };
});

const DesignScreen = require("./DesignScreen").default;
const TimetableEntry = require("../timetableUpload/TimetableEntry").default;

test("the entry screen offers Upload and Design", () => {
  render(<TimetableEntry user={{ phone: "9", role: "hod", name: "T" }} />);
  expect(screen.getByText("Upload a timetable")).toBeTruthy();
  expect(screen.getByText("Design a timetable")).toBeTruthy();
});

test("a coordinator can answer the questions and get versions", async () => {
  localStorage.clear();
  localStorage.setItem("ttdesign-v1:9:III", JSON.stringify({ allowBlank: true }));
  render(<DesignScreen user={{ phone: "9", role: "hod", name: "T" }} onBack={() => {}} />);
  const next = () => fireEvent.click(screen.getByText("Next →"));
  await screen.findByText("Which section?");
  fireEvent.click(screen.getAllByRole("checkbox")[0]);      // nothing is ticked until you choose
  await screen.findByText(/What the portal has for Year III/);
  next();                                                    // -> timings
  expect(screen.getByText("Here are the timings")).toBeTruthy();
  expect(screen.getByText("Period 7")).toBeTruthy();
  fireEvent.click(screen.getByLabelText ? screen.getByRole("checkbox", { name: /these timings are correct/i }) : null);
  next();                                                    // -> subjects
  expect(screen.getByText("How many periods a week for each subject?")).toBeTruthy();
  expect(screen.getByText(/Other periods in the timetable/)).toBeTruthy();
  expect(screen.getByText("Library")).toBeTruthy();
  expect(screen.getAllByText(/Total periods covered/).length).toBe(1);   // one total, in one place
  next(); next(); next(); next();                           // -> together, limits, availability, review
  await screen.findByText("Before I design");
  fireEvent.click(screen.getByText("Design the timetables"));
  await waitFor(() => expect(screen.getByText(/clash-free version/)).toBeTruthy(), { timeout: 15000 });
  expect(screen.getAllByText(/Download Excel \(TT-/).length).toBeGreaterThan(0);
  expect(screen.getAllByText("Minor changes").length).toBeGreaterThan(0);
  expect(screen.getByText("Version 1")).toBeTruthy();
}, 30000);

test("the workbook has TT and Ind sheets in order", () => {
  const people = [1, 2, 3, 4, 5, 6].map(i => ({ phone: "p" + i, name: "Dr " + i }));
  const secs = ["s1", "s2"].map(id => ({ id, name: "III-" + id, subjects: [
    { name: "T1", token: "T1", type: "Theory", faculty: ["p1"] }, { name: "T2", token: "T2", type: "Theory", faculty: ["p2"] },
    { name: "T3", token: "T3", type: "Theory", faculty: ["p3"] }, { name: "L1", token: "L1", type: "Lab", faculty: ["p4", "p5"] }] }));
  const a = defaultAnswers();
  ["T1", "T2", "T3"].forEach(n => { a.loads[n] = { periods: 4, block: 1 }; }); a.loads.L1 = { periods: 3, block: 3 };
  const { spec } = buildSpec({ year: "III", a, sections: secs, people, published: [] });
  const res = designVersions(spec, people, { count: 3, seed: 5 });
  const wb = buildDesignWorkbook(spec, res.versions);
  expect(wb.SheetNames).toEqual(["TT-1", "Ind-1", "TT-2", "Ind-2", "TT-3", "Ind-3"].slice(0, res.versions.length * 2));
  expect(res.versions.length).toBe(3);
});

test("every tab can be opened directly, and a problem points to the tab that fixes it", async () => {
  localStorage.clear();
  render(<DesignScreen user={{ phone: "9", role: "hod", name: "T" }} onBack={() => {}} />);
  await screen.findByText("Which section?");
  fireEvent.click(screen.getAllByRole("checkbox")[0]);      // nothing is ticked until you choose
  await screen.findByText(/What the portal has for Year III/);
  fireEvent.click(screen.getByText("7. Review"));
  await screen.findByText("Before I design");
  // timings were never ticked, so the review says so and offers a way there
  expect(screen.getByText(/haven't been checked yet/)).toBeTruthy();
  fireEvent.click(screen.getByText("Go to Days and periods"));
  expect(screen.getByText("Here are the timings")).toBeTruthy();
});
