import * as XLSXS from "xlsx-js-style";
import * as XLSX from "xlsx";
import { buildSpec, designVersions } from "./generator";
import { buildDesignWorkbook } from "./designExport";
import { defaultAnswers, newExtra } from "./designModel";
import { parseSmart } from "../timetableUpload/smartParser";
import { groupBlocks, detectOverlaps } from "../timetableUpload/overlapCheck";

const people = [
  ["p1", "Dr Arun Kumar"], ["p2", "V S Subramanyam"], ["p3", "Kola Poornodaya Venkata Krishna Varma"], ["p4", "Dr Amit Kumar Mehar"],
  ["p5", "Dr Karun Kumar"], ["p6", "Pawan Kumar Singotia"], ["p7", "G Sunil Gavaskar"],
].map(([phone, name]) => ({ phone, name }));
const mk = (id, name) => ({
  id, name,
  subjects: [
    { name: "S&GPS", token: "S&GPS", short: "S&GPS", type: "Theory", faculty: ["p1"] },
    { name: "DMM", token: "DMM", short: "DMM", type: "Theory", faculty: ["p2"] },
    { name: "AIML", token: "AIML", short: "AIML", type: "Theory", faculty: ["p3"] },
    { name: "Thermal Lab", token: "TL", short: "TL", type: "Lab", faculty: ["p4", "p5"] },
    { name: "Metrology Lab", token: "ML", short: "ML", type: "Lab", faculty: ["p6"] },
  ],
});

test("a designed workbook is read back into the same classes with the same faculty", () => {
  const sections = [mk("s1", "III YR I SEM SL-1"), mk("s2", "III YR I SEM AL-1")];
  const a = defaultAnswers(); a.allowBlank = true;
  ["S&GPS", "DMM", "AIML"].forEach(n => { a.loads[n] = { periods: 4, block: 1 }; });
  ["Thermal Lab", "Metrology Lab"].forEach(n => { a.loads[n] = { periods: 3, block: 3 }; });
  a.parallel = [["Thermal Lab", "Metrology Lab"]];
  const crt = newExtra("CRT"); crt.periods = 2; crt.sameTrainer = true; crt.trainer = { kind: "ext", phone: "", name: "Ramesh Babu" };
  a.extras = [crt];
  const { spec } = buildSpec({ year: "III", a, sections, people, published: [] });
  const res = designVersions(spec, people, { count: 3, seed: 7 });
  expect(res.versions.length).toBeGreaterThan(1);

  const wbOut = buildDesignWorkbook(spec, res.versions);
  const buf = XLSXS.write(wbOut, { type: "array", bookType: "xlsx" });
  const wbIn = XLSX.read(buf, { type: "array" });

  res.versions.forEach((v, i) => {
    const ctx = {
      year: "III", people, sheets: ["TT-" + (i + 1)],
      sections: sections.map(s => ({ id: s.id, name: s.name, subjects: s.subjects.map(x => ({ name: x.name, short: x.short, type: x.type, faculty: x.faculty })) })),
    };
    const parse = parseSmart(wbIn, ctx, {});
    expect(parse.problems.filter(p => p.level === "error")).toEqual([]);
    expect(parse.pending).toEqual([]);
    const blocks = groupBlocks(parse.entries, "upload");
    // same classes at the same times for the same people (compare without notes)
    const sig = bs => bs.filter(b => b.type !== "note").map(b => [b.sectionId, b.day, b.start, b.end, b.token, b.faculty.map(f => f.key).sort().join("+")].join("|")).sort();
    const expected = v.blocks.map(b => ({ ...b, faculty: b.faculty }));
    expect(sig(blocks)).toEqual(sig(expected));
    expect(detectOverlaps(blocks, [])).toEqual([]);
  });
});
