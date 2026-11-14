import * as XLSX from "xlsx";
import { readFacultySheet, planImport } from "./importLogic";
import { isCollegeEmail, normEmail, contactOf } from "../utils";

const book = rows => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Faculty"); return wb; };

test("college email check accepts only the college domain", () => {
  expect(isCollegeEmail("a.b@raghuenggcollege.in")).toBe(true);
  expect(isCollegeEmail(" A.B@RaghuEnggCollege.in ")).toBe(true);
  expect(isCollegeEmail("a@gmail.com")).toBe(false);
  expect(isCollegeEmail("a@raghuenggcollege.in.evil.com")).toBe(false);
  expect(normEmail(" X@Y.in ")).toBe("x@y.in");
});

test("the sheet is read with its headings, in any column order", () => {
  const rows = readFacultySheet(book([["S.No", "Mail ID", "Name of the Faculty", "Emp ID"], [1, "Arun@raghuenggcollege.in", "K Arun Kumar", "RE001"], [2, "", ""], [3, "ram@raghuenggcollege.in", "B Ramesh", ""]]));
  expect(rows.length).toBe(2);
  expect(rows[0]).toMatchObject({ name: "K Arun Kumar", email: "arun@raghuenggcollege.in", employeeId: "RE001" });
  expect(rows[1].name).toBe("B Ramesh");
});

test("a sheet with no headings is read as name then email", () => {
  const rows = readFacultySheet(book([["K Arun Kumar", "arun@raghuenggcollege.in"], ["B Ramesh", "ram@raghuenggcollege.in"]]));
  expect(rows.map(r => r.email)).toEqual(["arun@raghuenggcollege.in", "ram@raghuenggcollege.in"]);
  expect(readFacultySheet(book([["nothing", "useful"]]))).toEqual([]);
});

test("each row is new, already there, or a problem", () => {
  const users = [
    { id: "9111111111", name: "Dr K Arun Kumar", role: "faculty", status: "approved" },
    { id: "9222222222", name: "Rama Rao", role: "faculty", status: "approved" },
    { id: "9333333333", name: "Rama Raju", role: "faculty", status: "approved" },
    { id: "9502808301", name: "Master", role: "admin", status: "approved" },
    { id: "x_at_y", name: "Old Person", email: "old@raghuenggcollege.in", role: "faculty", status: "approved" },
  ];
  const rows = [
    { rowNo: 2, name: "K Arun Kumar", email: "arun@raghuenggcollege.in" },
    { rowNo: 3, name: "Rama", email: "rama@raghuenggcollege.in" },          // two similar names: not sure
    { rowNo: 4, name: "Totally New", email: "new@raghuenggcollege.in" },
    { rowNo: 5, name: "Old Person", email: "OLD@raghuenggcollege.in" },
    { rowNo: 6, name: "Someone", email: "someone@gmail.com" },
    { rowNo: 7, name: "Dup", email: "arun@raghuenggcollege.in" },
    { rowNo: 8, name: "", email: "n@raghuenggcollege.in" },
    { rowNo: 9, name: "Master", email: "master@raghuenggcollege.in" },     // the master account is never offered
  ];
  const p = planImport(rows, users);
  // nobody is ever attached to an existing account, however alike the names are
  expect(p[0].state).toBe("new");
  expect(p[0].matchId).toBeUndefined();
  expect(p[1].state).toBe("new");
  expect(p[2].state).toBe("new");
  expect(p[3].state).toBe("exists");
  expect(p[4]).toMatchObject({ state: "bad" });
  expect(p[5]).toMatchObject({ state: "bad" });
  expect(p[6]).toMatchObject({ state: "bad" });
  expect(p.every(x => x.matchId === undefined)).toBe(true);
});

test("contactOf shows the email, else the mobile number", () => {
  expect(contactOf({ id: "a_at_b", email: "a@b.in" })).toBe("a@b.in");
  expect(contactOf({ id: "9876543210", phone: "9876543210" })).toBe("9876543210");
});
