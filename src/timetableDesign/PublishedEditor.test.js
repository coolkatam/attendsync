import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mockMaster = { current: null };
jest.mock("../firebase", () => ({ db: {} }));
jest.mock("firebase/firestore", () => ({
  collection: (_db, name) => ({ __name: name }),
  doc: (_db, name, id) => ({ __name: name, __id: id }),
  getDoc: async () => ({ exists: () => !!mockMaster.current, data: () => mockMaster.current }),
  getDocs: async () => ({ forEach: fn => [{ id: "p1", data: () => ({ name: "Dr One", status: "approved" }) }, { id: "p2", data: () => ({ name: "Dr Two", status: "approved" }) }].forEach(fn) }),
  onSnapshot: (ref, cb) => { cb({ docs: [] }); return () => {}; },
  setDoc: jest.fn(async () => {}),
}));

const PublishedEditor = require("../timetableUpload/PublishedEditor").default;

const slots = [{ start: 540, end: 590 }, { start: 590, end: 640 }, { start: 640, end: 650, brk: true }, { start: 650, end: 700 }, { start: 700, end: 750 }].map(s => ({ brk: false, ...s }));
const blk = (token, day, start, end, who) => ({ id: "s1:" + day + ":" + start + ":" + token, sectionId: "s1", sectionName: "III-A", day, start, end, token, subject: token, type: "theory", combo: "", periods: 1, faculty: who ? [{ key: who, name: who === "p1" ? "Dr One" : "Dr Two", phone: who, external: false, role: "main" }] : [] });

test("the editor shows the timetable, refuses a clashing move and accepts a safe one", async () => {
  mockMaster.current = {
    publishedByName: "T", publishedAt: new Date().toISOString(),
    sections: [{ id: "s1", name: "III-A", slots }, { id: "s2", name: "III-B", slots }],
    blocks: [
      blk("AAA", 0, 540, 590, "p1"),
      blk("BBB", 0, 590, 640, "p2"),
      { ...blk("AAA", 1, 540, 590, "p1"), sectionId: "s2", sectionName: "III-B", id: "s2:1:540:AAA" },
    ],
  };
  render(<PublishedEditor year="III" user={{ phone: "9", name: "T" }} onBack={() => {}} />);
  await screen.findByText("Edit the Year III timetable");
  const aaa = screen.getAllByText("AAA")[0];
  fireEvent.click(aaa);
  await screen.findByText(/Move to/);
  // move AAA on Monday onto Tuesday period 1: Dr One is already teaching AAA to III-B then -> refused
  const selects = screen.getAllByRole("combobox");
  fireEvent.change(selects[0], { target: { value: "1" } });
  fireEvent.click(screen.getByText("Move"));
  await screen.findByText(/Not changed/);
  expect(screen.getByText(/would be in two places/)).toBeTruthy();

  // a safe move: Tuesday period 4 (free for everyone)
  fireEvent.change(screen.getAllByRole("combobox")[1], { target: { value: "650" } });
  fireEvent.click(screen.getByText("Move"));
  await waitFor(() => expect(screen.getByText(/1 unsaved change/)).toBeTruthy());
  expect(screen.getByText("Save changes")).toBeTruthy();
});
