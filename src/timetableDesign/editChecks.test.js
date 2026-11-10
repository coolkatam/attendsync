import { buildSpec, designVersions } from "./generator";
import { defaultAnswers } from "./designModel";
import { sectionsOf } from "./designExport";
import { moveBlock, swapBlocks, changeFaculty, removeBlock, addBlock, checkEdit, loadWarnings, startOptions } from "../timetableUpload/editChecks";

function setup() {
  const people = [1, 2, 3, 4].map(i => ({ phone: "p" + i, name: "Dr " + i }));
  const mk = (id, name) => ({ id, name, subjects: ["T1", "T2", "T3"].map((n, i) => ({ name: n, token: n, type: "Theory", faculty: ["p" + (i + 1)] })) });
  const sections = [mk("s1", "III-A"), mk("s2", "III-B")];
  const a = defaultAnswers(); a.allowBlank = true;
  ["T1", "T2", "T3"].forEach(n => { a.loads[n] = { periods: 4, block: 1 }; });
  const { spec } = buildSpec({ year: "III", a, sections, people, published: [] });
  const res = designVersions(spec, people, { count: 1, seed: 11 });
  return { secs: sectionsOf(spec), blocks: res.versions[0].blocks.map(b => ({ ...b })) };
}

test("moving to a free place is allowed; onto the faculty's other class is refused", () => {
  const { secs, blocks } = setup();
  const s1 = secs.find(s => s.id === "s1");
  const b = blocks.find(x => x.sectionId === "s1" && x.token === "T1");
  const free = [];
  for (let d = 0; d < 6; d++) startOptions(b, s1.slots).forEach(o => { if (!blocks.some(x => x.sectionId === "s1" && x.day === d && x.start < o.end && o.start < x.end)) free.push([d, o.start]); });
  const ok = moveBlock(blocks, b.id, free[0][0], free[0][1], s1.slots);
  expect(ok.error).toBeUndefined();
  expect(typeof ok.text).toBe("string");

  const other = blocks.find(x => x.sectionId === "s2" && x.token === "T1");
  const clash = moveBlock(blocks, b.id, other.day, other.start, s1.slots);
  if (!clash.error) {
    const chk = checkEdit(clash.blocks, clash.editedIds, []);
    expect(chk.ok).toBe(false);
    expect(chk.problems.length).toBeGreaterThan(0);
  }
});

test("a section can't get two classes at once; swap, remove and add work", () => {
  const { secs, blocks } = setup();
  const s1 = secs.find(s => s.id === "s1");
  const a = blocks.find(x => x.sectionId === "s1" && x.token === "T1");
  const b = blocks.find(x => x.sectionId === "s1" && x.token === "T2");
  const mv = moveBlock(blocks, a.id, b.day, b.start, s1.slots);
  const chk = checkEdit(mv.blocks, mv.editedIds, []);
  expect(chk.ok).toBe(false);
  expect(chk.problems.some(p => /two classes at once/.test(p.text))).toBe(true);

  const sw = swapBlocks(blocks, a.id, b.id);
  expect(sw.error).toBeUndefined();
  expect(checkEdit(sw.blocks, sw.editedIds, []).problems.filter(p => /two classes at once/.test(p.text))).toEqual([]);

  const rm = removeBlock(blocks, a.id);
  expect(rm.blocks.length).toBe(blocks.length - 1);
  const add = addBlock(rm.blocks, s1, a.day, a.start, { token: "SPORTS", type: "other", faculty: [], periods: 1 });
  expect(add.error).toBeUndefined();
  expect(add.blocks.length).toBe(blocks.length);
  expect(addBlock(rm.blocks, s1, a.day, 1, { token: "X", periods: 1 }).error).toBeTruthy();
});

test("a faculty change that double-books someone is refused", () => {
  const { blocks } = setup();
  const a = blocks.find(x => x.sectionId === "s1" && x.token === "T1");
  const dr2 = { key: "p2", name: "Dr 2", phone: "p2", external: false };
  const ch = changeFaculty(blocks, a.id, [dr2]);
  const chk = checkEdit(ch.blocks, ch.editedIds, []);
  const busy = blocks.some(x => x.token === "T2" && x.day === a.day && x.start < a.end && a.start < x.end);
  expect(chk.ok).toBe(!busy);
  expect(Array.isArray(loadWarnings(ch.blocks, ch.editedIds))).toBe(true);
});
