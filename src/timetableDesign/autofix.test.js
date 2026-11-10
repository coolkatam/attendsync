import { buildSpec, designVersions } from "./generator";
import { defaultAnswers } from "./designModel";
import { autoFix } from "../timetableUpload/overlapCheck";
import { sectionsOf } from "./designExport";

test("autoFix clears a clash it is given without creating another", () => {
  const people = [1, 2, 3, 4].map(i => ({ phone: "p" + i, name: "Dr " + i }));
  const mk = (id, name) => ({ id, name, subjects: ["T1", "T2", "T3"].map((n, i) => ({ name: n, token: n, type: "Theory", faculty: ["p" + (i + 1)] })) });
  const sections = [mk("s1", "III-A"), mk("s2", "III-B"), mk("s3", "III-C")];
  const a = defaultAnswers();
  ["T1", "T2", "T3"].forEach(n => { a.loads[n] = { periods: 4, block: 1 }; });
  const { spec } = buildSpec({ year: "III", a, sections, people, published: [] });
  const res = designVersions(spec, people, { count: 1, seed: 3 });
  const blocks = res.versions[0].blocks.map(b => ({ ...b, source: "upload" }));

  // force Dr 1 into two sections at the same time
  const t1 = blocks.filter(b => b.token === "T1");
  const target = t1.find(b => b.sectionId === "s1");
  const victim = t1.find(b => b.sectionId === "s2" && !(b.day === target.day && b.start === target.start));
  victim.day = target.day; victim.start = target.start; victim.end = target.end;
  victim.id = victim.sectionId + ":" + victim.day + ":" + victim.start + ":" + victim.token;

  const slots = {};
  sectionsOf(spec).forEach(s => { slots[s.id] = s.slots; });
  const out = autoFix(blocks, slots, []);
  expect(out.changes.length).toBeGreaterThan(0);
  expect(out.remaining).toEqual([]);
});
