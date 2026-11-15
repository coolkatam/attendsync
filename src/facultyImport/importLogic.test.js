import * as XLSX from "xlsx";
import { readFacultySheet, planImport } from "./importLogic";
import { isCollegeEmail, normEmail, normEmpId, contactOf } from "../utils";

const book = rows => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Faculty"); return wb; };

test("college email check accepts only the college domain", () => {
  expect(isCollegeEmail("a.b@raghuenggcollege.in")).toBe(true);
  expect(isCollegeEmail(" A.B@RaghuEnggCollege.in ")).toBe(true);
  expect(isCollegeEmail("a@gmail.com")).toBe(false);
  expect(isCollegeEmail("a@raghuenggcollege.in.evil.com")).toBe(false);
  expect(normEmail(" X@Y.in ")).toBe("x@y.in");
});

test("an Employee ID is the same however it is typed", () => {
  expect(normEmpId(" re 0009 ")).toBe("RE0009");
  expect(normEmpId("RE/00 09")).toBe("RE0009");
  expect(normEmpId("")).toBe("");
});

test("the sheet is read by its headings, in any column order", () => {
  const rows = readFacultySheet(book([["S.No", "College Mail ID", "Emp ID"], [1, "Arun@raghuenggcollege.in", "re001"], [2, "", ""], [3, "ram@raghuenggcollege.in", "RE002"]]));
  expect(rows.length).toBe(2);
  expect(rows[0]).toMatchObject({ employeeId: "re001", email: "arun@raghuenggcollege.in" });
  expect(rows[1].employeeId).toBe("RE002");
});

test("a sheet with no headings is read as Employee ID then email, or the other way round", () => {
  expect(readFacultySheet(book([["RE001", "a@raghuenggcollege.in"], ["RE002", "b@raghuenggcollege.in"]])).map(r => r.employeeId)).toEqual(["RE001", "RE002"]);
  expect(readFacultySheet(book([["a@raghuenggcollege.in", "RE001"], ["b@raghuenggcollege.in", "RE002"]])).map(r => r.employeeId)).toEqual(["RE001", "RE002"]);
  expect(readFacultySheet(book([["nothing", "useful"]]))).toEqual([]);
});

test("each row is new, already in the portal, or a problem", () => {
  const users = [
    { id: "RE0001", employeeId: "RE0001", email: "old@raghuenggcollege.in" },
    { id: "9111111111", name: "Dr K Arun Kumar" },
  ];
  const p = planImport([
    { rowNo: 2, employeeId: "re0002", email: "new@raghuenggcollege.in" },
    { rowNo: 3, employeeId: "RE0001", email: "x@raghuenggcollege.in" },          // the ID is taken
    { rowNo: 4, employeeId: "RE0003", email: "OLD@raghuenggcollege.in" },        // the email is taken
    { rowNo: 5, employeeId: "RE0004", email: "someone@gmail.com" },
    { rowNo: 6, employeeId: "", email: "n@raghuenggcollege.in" },
    { rowNo: 7, employeeId: "RE0002", email: "dup@raghuenggcollege.in" },        // same ID as row 2
    { rowNo: 8, employeeId: "RE0005", email: "new@raghuenggcollege.in" },        // same email as row 2
  ], users);
  expect(p[0]).toMatchObject({ state: "new", employeeId: "RE0002" });
  expect(p[1].state).toBe("exists");
  expect(p[2].state).toBe("exists");
  expect(p[3].state).toBe("bad");
  expect(p[4].state).toBe("bad");
  expect(p[5].state).toBe("bad");
  expect(p[6].state).toBe("bad");
});

test("contactOf shows the email, else the mobile number", () => {
  expect(contactOf({ id: "RE1", email: "a@b.in" })).toBe("a@b.in");
  expect(contactOf({ id: "9876543210", phone: "9876543210" })).toBe("9876543210");
});
