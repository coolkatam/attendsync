import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mockSetDoc = jest.fn(async () => {});
const mockDeleteDoc = jest.fn(async () => {});
const mockYear = { id: "III", data: () => ({
  publishedBy: "9", publishedByName: "T", publishedAt: new Date().toISOString(),
  sections: [{ id: "s1", name: "III-A", slots: [] }, { id: "s2", name: "III-B", slots: [] }],
  blocks: [
    { id: "a", sectionId: "s1", sectionName: "III-A", day: 0, start: 540, end: 590, token: "T1", subject: "T1", type: "theory", periods: 1, faculty: [] },
    { id: "b", sectionId: "s2", sectionName: "III-B", day: 0, start: 540, end: 590, token: "T1", subject: "T1", type: "theory", periods: 1, faculty: [] },
  ],
}) };
jest.mock("../firebase", () => ({ db: {} }));
jest.mock("firebase/firestore", () => ({
  collection: (_db, name) => ({ __name: name }),
  doc: (_db, name, id) => ({ __name: name, __id: id }),
  onSnapshot: (ref, cb) => { cb({ docs: ref.__name === "masterTimetables" ? [mockYear] : [], forEach: () => {} }); return () => {}; },
  getDocs: async () => ({ forEach: () => {} }),
  getDoc: async () => ({ exists: () => false }),
  setDoc: (...a) => mockSetDoc(...a),
  deleteDoc: (...a) => mockDeleteDoc(...a),
}));

const TimetableEntry = require("../timetableUpload/TimetableEntry").default;

test("one section's timetable can be removed and the rest stays", async () => {
  render(<TimetableEntry user={{ phone: "9", name: "T", role: "hod" }} />);
  await screen.findByText("Published timetables");
  fireEvent.click(screen.getByLabelText("Remove III-A's timetable"));
  expect(screen.getByText("Remove III-A?")).toBeTruthy();
  fireEvent.click(screen.getByText("Yes, remove"));
  await waitFor(() => expect(mockSetDoc).toHaveBeenCalled());
  const saved = mockSetDoc.mock.calls[0][1];
  expect(saved.sections.map(s => s.id)).toEqual(["s2"]);
  expect(saved.blocks.map(b => b.id)).toEqual(["b"]);
  expect(mockDeleteDoc).not.toHaveBeenCalled();
});

test("the whole year can be removed", async () => {
  mockSetDoc.mockClear();
  render(<TimetableEntry user={{ phone: "9", name: "T", role: "hod" }} />);
  await screen.findByText("Published timetables");
  fireEvent.click(screen.getByText("Remove the whole year"));
  fireEvent.click(screen.getByText("Yes, remove"));
  await waitFor(() => expect(mockDeleteDoc).toHaveBeenCalled());
  expect(mockSetDoc).not.toHaveBeenCalled();
});
