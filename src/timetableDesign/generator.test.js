import { buildSpec, designVersions, verify } from "./generator";
import { defaultAnswers, newExtra } from "./designModel";

function scenario(extra) {
  const people = [
    ["p1", "Dr A One"], ["p2", "Dr B Two"], ["p3", "Dr C Three"], ["p4", "Dr D Four"], ["p5", "Dr E Five"],
    ["p6", "Dr F Six"], ["p7", "Dr G Seven"], ["p8", "Dr H Eight"],
  ].map(([phone, name]) => ({ phone, name }));
  const mk = (id, name) => ({
    id, name,
    subjects: [
      { name: "S&GPS", token: "S&GPS", type: "Theory", faculty: ["p1"] },
      { name: "DMM", token: "DMM", type: "Theory", faculty: ["p2"] },
      { name: "AIML", token: "AIML", type: "Theory", faculty: ["p3"] },
      { name: "MTM", token: "MTM", type: "Theory", faculty: ["p4"] },
      { name: "IIR", token: "IIR", type: "Theory", faculty: ["p5"] },
      { name: "Thermal Lab", token: "TL", type: "Lab", faculty: ["p6", "p8"] },
      { name: "Metrology Lab", token: "ML", type: "Lab", faculty: ["p7"] },
    ],
  });
  const sections = [mk("s1", "III YR I SEM SL-1"), mk("s2", "III YR I SEM AL-1"), mk("s3", "III YR I SEM SL-2")];
  const a = defaultAnswers();
  ["S&GPS", "DMM", "AIML", "MTM", "IIR"].forEach(n => { a.loads[n] = { periods: 4, block: 1 }; });
  ["Thermal Lab", "Metrology Lab"].forEach(n => { a.loads[n] = { periods: 3, block: 3 }; });
  if (extra) extra(a, sections);
  return { people, sections, a };
}

function run(extra, opts = {}) {
  const { people, sections, a } = scenario(extra);
  const { spec, problems } = buildSpec({ year: "III", a, sections, people, published: [] });
  const errors = problems.filter(p => p.level === "error");
  if (errors.length || !spec) return { errors, problems };
  const res = designVersions(spec, people, { count: 3, seed: 12345, ...opts });
  return { spec, problems, res };
}

test("plain scenario gives three distinct clash-free versions", () => {
  const { errors, res, spec } = run();
  expect(errors || []).toEqual([]);
  expect(res.versions.length).toBe(3);
  res.versions.forEach(v => expect(verify(spec, v.blocks)).toEqual([]));
  const sigs = new Set(res.versions.map(v => v.sig));
  expect(sigs.size).toBe(3);
});

test("fixed CRT slots with one trainer, flexible sports, parallel labs", () => {
  const { errors, res, spec } = run((a, sections) => {
    const crt = newExtra("CRT");
    crt.periods = 2; crt.mode = "fixed"; crt.sameTrainer = true; crt.trainer = { kind: "ext", phone: "", name: "Mr Trainer" };
    crt.fixed = { s1: [{ day: 0, period: 4 }, { day: 2, period: 5 }], s2: [{ day: 0, period: 5 }, { day: 3, period: 4 }], s3: [{ day: 1, period: 4 }, { day: 4, period: 5 }] };
    const sp = newExtra("Sports"); sp.periods = 1;
    a.extras = [crt, sp];
    a.parallel = [["Thermal Lab", "Metrology Lab"]];
  });
  expect(errors || []).toEqual([]);
  expect(res.versions.length).toBeGreaterThan(0);
  res.versions.forEach(v => {
    expect(verify(spec, v.blocks)).toEqual([]);
    const crtBlocks = v.blocks.filter(b => b.token === "CRT");
    expect(crtBlocks.length).toBe(6);
  });
});

test("two sections given the same fixed trainer slot is reported", () => {
  const { errors } = run((a) => {
    const crt = newExtra("CRT");
    crt.periods = 1; crt.mode = "fixed"; crt.sameTrainer = true; crt.trainer = { kind: "ext", phone: "", name: "Mr Trainer" };
    crt.fixed = { s1: [{ day: 0, period: 4 }], s2: [{ day: 0, period: 4 }], s3: [{ day: 1, period: 4 }] };
    a.extras = [crt];
  });
  expect(errors.some(e => /one trainer/i.test(e.text))).toBe(true);
});

test("an overloaded faculty member is reported before searching", () => {
  const { errors } = run((a) => { a.loads["S&GPS"] = { periods: 9, block: 1 }; });
  expect(errors.some(e => /Dr A One/.test(e.text))).toBe(true);
});

test("unavailability is respected", () => {
  const { res, spec } = run((a) => {
    const cells = {};
    for (let p = 0; p < 7; p++) cells["0-" + p] = true;  // Monday off for p1
    a.availability = [{ phone: "p1", mode: "blocked", cells }];
  });
  expect(res.versions.length).toBeGreaterThan(0);
  res.versions.forEach(v => {
    expect(verify(spec, v.blocks)).toEqual([]);
    expect(v.blocks.filter(b => b.day === 0 && b.faculty.some(f => f.key === "p1")).length).toBe(0);
  });
});

test("tight load: six sections, shared faculty, full week", () => {
  const people = Array.from({ length: 14 }, (_, i) => ({ phone: "q" + i, name: "Fac " + i }));
  const secs = Array.from({ length: 6 }, (_, k) => ({
    id: "t" + k, name: "IV YR SEC-" + k,
    subjects: [
      { name: "T1", token: "T1", type: "Theory", faculty: ["q" + (k % 4)] },
      { name: "T2", token: "T2", type: "Theory", faculty: ["q" + (4 + (k % 4))] },
      { name: "T3", token: "T3", type: "Theory", faculty: ["q" + (8 + (k % 3))] },
      { name: "T4", token: "T4", type: "Theory", faculty: ["q" + (11 + (k % 3))] },
      { name: "Lab1", token: "L1", type: "Lab", faculty: ["q" + (k % 4), "q" + (4 + (k % 4))] },
      { name: "Draw", token: "DR", type: "Drawing", faculty: ["q" + (8 + (k % 3))] },
    ],
  }));
  const a = defaultAnswers();
  a.days = 6; a.satHalf = false;           // 42 periods a week
  ["T1", "T2", "T3", "T4"].forEach(n => { a.loads[n] = { periods: 6, block: 1, avoidFirst: n === "T1", avoidLast: n === "T2" }; });
  a.loads.Lab1 = { periods: 3, block: 3 }; a.loads.Draw = { periods: 3, block: 3 };
  const crt = newExtra("CRT"); crt.periods = 4; crt.sameTrainer = false;
  const sp = newExtra("Sports"); sp.periods = 2;
  a.extras = [crt, sp];                      // 24 + 3 + 3 + 4 + 2 = 36 of 42
  a.maxTotalPerDay = 5; a.maxTheoryPerDay = 4;
  const { spec, problems } = buildSpec({ year: "IV", a, sections: secs, people, published: [] });
  expect(problems.filter(p => p.level === "error")).toEqual([]);
  const res = designVersions(spec, people, { count: 3, seed: 99, timeMs: 15000 });
  console.log("attempts", res.attempts, "completes", res.completes, "versions", res.versions.length, "relaxed", res.versions.map(v => v.relaxed.length), res.problems);
  expect(res.versions.length).toBeGreaterThan(0);
  res.versions.forEach(v => expect(verify(spec, v.blocks)).toEqual([]));
});

test("an impossible request is explained, not silently dropped", () => {
  const { errors, res, problems } = run((a) => {
    a.maxTotalPerDay = 4; a.maxTheoryPerDay = 1;   // 4 theory periods/week per subject across 6 days is fine...
    a.loads["S&GPS"] = { periods: 6, block: 1 };   // ...but 6 with max 1/day and a day off
    const cells = {};
    for (let p = 0; p < 7; p++) { cells["0-" + p] = true; cells["1-" + p] = true; }
    a.availability = [{ phone: "p1", mode: "blocked", cells }];
  });
  expect((errors || []).length + (res ? res.problems.length : 0)).toBeGreaterThan(0);
  void problems;
});

test("the overload message says what to change and which tab", () => {
  const { errors } = run((a) => { a.maxTheoryPerDay = 2; a.loads["S&GPS"] = { periods: 7, block: 1 }; });
  const e = errors.find(x => /Dr A One/.test(x.text));
  expect(e.step).toBe("lim");
  expect(e.text).toMatch(/raise "Most theory periods in a day" in Faculty limits to at least 4/);
});

test("a portal subject such as CRT can be fixed to days and periods", () => {
  const { errors, res, spec } = run((a) => {
    a.loads["DMM"] = { periods: 2, block: 1, mode: "fixed", fixed: { s1: [{ day: 0, period: 4 }, { day: 2, period: 5 }], s2: [{ day: 1, period: 4 }, { day: 3, period: 5 }], s3: [{ day: 4, period: 4 }, { day: 5, period: 3 }] } };
  });
  expect(errors || []).toEqual([]);
  expect(res.versions.length).toBeGreaterThan(0);
  res.versions.forEach(v => {
    expect(verify(spec, v.blocks)).toEqual([]);
    const at = v.blocks.filter(b => b.token === "DMM" && b.sectionId === "s1").map(b => b.day + ":" + b.start).sort();
    expect(at.length).toBe(2);
  });
});

test("fixed slots that are not filled in are reported against the Subjects tab", () => {
  const { errors } = run((a) => { a.loads["DMM"] = { periods: 3, block: 1, mode: "fixed", fixed: {} }; });
  expect(errors.some(e => e.step === "subj" && /fixed slots/.test(e.text))).toBe(true);
});
