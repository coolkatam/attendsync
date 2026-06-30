// src/FacultyApp.js — period-aware attendance marking + reports

import React, { useState, useEffect } from "react";
import { collection, doc, onSnapshot, setDoc, getDoc, getDocs } from "firebase/firestore";
import { db } from "./firebase";
import { P, Btn, Card, Badge, TopBar, ARow, Spinner, PeriodPicker } from "./components/UI";
import { today, calcPct, makeKey, groupByDateBatched, rowColor, fmtDate, studentsInBatch, batchSlotKey } from "./utils";

export default function FacultyApp({ user, onLogout }) {
  const [sections, setSections] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [screen,   setScreen]   = useState("home"); // home | mark | report
  const [ctx,      setCtx]      = useState(null);
  const [presetPeriod, setPresetPeriod] = useState(null);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "sections"), snap => {
      const mine = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(sec => sec.subjects?.some(s => s.facultyPhone === user.phone));
      setSections(mine);
      setLoading(false);
    });
    return unsub;
  }, [user.phone]);

  if (loading) return <Spinner />;

  if (screen === "mark" && ctx) {
    return (
      <MarkAttendance
        user={user} ctx={ctx} presetPeriod={presetPeriod}
        onBack={() => { setScreen("home"); setPresetPeriod(null); }}
      />
    );
  }

  if (screen === "report" && ctx) {
    return <SubjectReport user={user} ctx={ctx} onBack={() => setScreen("home")} />;
  }

  return (
    <div style={{ background: P.bg, minHeight: "100vh" }}>
      <TopBar
        title="Faculty Portal"
        subtitle={"Welcome, " + user.name}
        right={
          <button onClick={onLogout} style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 13 }}>
            Logout
          </button>
        }
      />
      <div style={{ padding: "16px 16px 80px" }}>
        {sections.length === 0 && (
          <div style={{ textAlign: "center", padding: "3rem", color: P.gray }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>No sections assigned yet</div>
            <div style={{ fontSize: 13 }}>Ask your admin to assign you to a section.</div>
          </div>
        )}
        {sections.map(sec => {
          const mySubs = sec.subjects.filter(s => s.facultyPhone === user.phone);
          return (
            <div key={sec.id} style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: P.blue, marginBottom: 8 }}>{sec.name}</div>
              {mySubs.map(sub => (
                <SubjectCard
                  key={sub.id}
                  sec={sec} sub={sub} user={user}
                  onMark={(period) => { setCtx({ section: sec, subject: sub }); setPresetPeriod(period || null); setScreen("mark"); }}
                  onReport={() => { setCtx({ section: sec, subject: sub }); setScreen("report"); }}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Subject card ───────────────────────────────────────────
function SubjectCard({ sec, sub, user, onMark, onReport }) {
  const [doneMap, setDoneMap] = useState({});
  const [loading,  setLoading]  = useState(true);
  const ts = today();

  useEffect(() => {
    async function load() {
      const periodsPerDay = sec.periodsPerDay || 7;
      const map = {};
      const checks = [];
      for (let p = 1; p <= periodsPerDay; p++) {
        checks.push(
          getDoc(doc(db, "attendance", sec.id, "subjects", sub.id, "dates", makeKey(ts, p)))
            .then(snap => { if (snap.exists()) map[p] = snap.data(); })
        );
      }
      await Promise.all(checks);
      setDoneMap(map);
      setLoading(false);
    }
    load();
  }, [sec.id, sub.id, sec.periodsPerDay, ts]);

  // "Marked today" = any slot (any batch, or the unbatched slot) has data for that period.
  const doneCount = Object.values(doneMap).filter(rec => rec && Object.keys(rec).length > 0).length;

  return (
    <Card>
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{sub.name}</div>
      <div style={{ marginBottom: 10 }}>
        {loading ? (
          <span style={{ fontSize: 12, color: P.gray }}>Checking…</span>
        ) : doneCount > 0 ? (
          <Badge color="green">{doneCount} period(s) marked today</Badge>
        ) : (
          <Badge color="amber">Not marked today</Badge>
        )}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <Btn small variant="primary" onClick={() => onMark()}>
          📅 Mark attendance
        </Btn>
        <Btn small variant="accent" onClick={onReport}>
          📊 My report
        </Btn>
      </div>
    </Card>
  );
}

// ── Subject report for faculty (day-wise table, row-colored, batch-aware) ──
function SubjectReport({ ctx, onBack }) {
  const { section, subject } = ctx;
  const [att,     setAtt]     = useState({});
  const [loading, setLoading] = useState(true);
  const roster = section.students || [];

  useEffect(() => {
    async function load() {
      const snap = await getDocs(
        collection(db, "attendance", section.id, "subjects", subject.id, "dates")
      );
      const data = {};
      snap.forEach(d => { data[d.id] = d.data(); });
      setAtt(data);
      setLoading(false);
    }
    load();
  }, [section.id, subject.id]);

  if (loading) return <Spinner />;

  const { dates, byDate } = groupByDateBatched(att, roster, subject);
  const totalPeriods = dates.reduce((a, d) => a + byDate[d].periodsHeld, 0);

  // Per-student stats: day-wise present counts + total + %
  const stats = roster.map(st => {
    const daily = dates.map(d => byDate[d].byRoll[st.roll] || 0);
    const present = daily.reduce((a, b) => a + b, 0);
    const pct = calcPct(present, totalPeriods);
    return { ...st, daily, present, pct };
  });

  const rowBg = {
    red:    { bg: "#fee2e2", fg: P.red },
    yellow: { bg: "#fef3c7", fg: P.amber },
    none:   { bg: null,      fg: "#111" },
  };

  const thStyle = {
    background: P.blue, color: "#fff", fontWeight: 600,
    fontSize: 12, padding: "8px 10px", textAlign: "center",
    border: "1px solid #1244a0", whiteSpace: "nowrap",
  };
  const tdStyle = {
    fontSize: 12, padding: "7px 10px", textAlign: "center",
    border: "1px solid " + P.border,
  };

  return (
    <div style={{ background: P.bg, minHeight: "100vh" }}>
      <TopBar
        title={subject.name}
        subtitle={section.name + " · My attendance report"}
        onBack={onBack}
      />
      <div style={{ padding: 16 }}>

        {/* Summary stats */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
          <div style={{ background: P.blueL, borderRadius: 12, padding: "14px 12px", textAlign: "center" }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: P.blue }}>{dates.length}</div>
            <div style={{ fontSize: 11, color: P.gray }}>Days held</div>
          </div>
          <div style={{ background: P.tealL, borderRadius: 12, padding: "14px 12px", textAlign: "center" }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: P.teal }}>{totalPeriods}</div>
            <div style={{ fontSize: 11, color: P.gray }}>Total periods</div>
          </div>
          <div style={{ background: P.redL, borderRadius: 12, padding: "14px 12px", textAlign: "center" }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: P.red }}>{stats.filter(s => s.pct < 65).length}</div>
            <div style={{ fontSize: 11, color: P.gray }}>&lt;65% students</div>
          </div>
        </div>

        {/* Day-wise attendance table */}
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Day-wise attendance</div>
        <div style={{ fontSize: 11, color: P.gray, marginBottom: 8 }}>
          Each column is a date. Value = number of periods that student attended that day.
          <span style={{ display: "inline-block", width: 10, height: 10, background: "#fef3c7", marginLeft: 10, marginRight: 4, verticalAlign: "middle" }} />65–74.99%
          <span style={{ display: "inline-block", width: 10, height: 10, background: "#fee2e2", marginLeft: 10, marginRight: 4, verticalAlign: "middle" }} />&lt;65%
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", minWidth: "100%" }}>
            <thead>
              <tr>
                <th style={thStyle}>Roll No</th>
                <th style={thStyle}>Name</th>
                {dates.map(d => (
                  <th key={d} style={thStyle}>
                    {fmtDate(d)}
                    <div style={{ fontSize: 10, fontWeight: 400, opacity: 0.85, marginTop: 2 }}>
                      ({byDate[d].periodsHeld} period{byDate[d].periodsHeld > 1 ? "s" : ""})
                    </div>
                  </th>
                ))}
                <th style={thStyle}>Total</th>
                <th style={thStyle}>%</th>
              </tr>
            </thead>
            <tbody>
              {stats.map(st => {
                const c = rowBg[rowColor(st.pct)];
                const rowStyle = { background: c.bg || "#fff" };
                return (
                  <tr key={st.roll} style={rowStyle}>
                    <td style={{ ...tdStyle, fontWeight: 600, color: c.fg }}>{st.roll}</td>
                    <td style={{ ...tdStyle, textAlign: "left", color: c.fg }}>{st.name}</td>
                    {st.daily.map((v, i) => (
                      <td key={i} style={{ ...tdStyle, color: c.fg }}>{v}</td>
                    ))}
                    <td style={{ ...tdStyle, fontWeight: 600, color: c.fg }}>{st.present}</td>
                    <td style={{ ...tdStyle, fontWeight: 700, color: c.fg }}>{st.pct.toFixed(2)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {stats.length === 0 && (
            <div style={{ color: P.gray, textAlign: "center", padding: "2rem" }}>No attendance data yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Mark attendance (period-aware, with date picker, batch-aware) ────────
function MarkAttendance({ user, ctx, presetPeriod, onBack }) {
  const { section, subject } = ctx;
  const periodsPerDay = section.periodsPerDay || 7;
  const denied = subject.facultyPhone !== user.phone;
  const hasBatches = subject.batches && subject.batches.length > 0;

  const [selBatchId, setSelBatchId] = useState(""); // "" = not chosen yet (only relevant if hasBatches)
  const batch = hasBatches ? (subject.batches.find(b => b.id === selBatchId) || null) : null;
  const roster = batch ? studentsInBatch(section.students, batch) : (section.students || []);
  const slotKey = batchSlotKey(batch ? batch.id : null);
  const batchReady = !hasBatches || !!selBatchId;

  const [date, setDate]       = useState(today());
  const [selPeriods, setSelPeriods] = useState(presetPeriod ? [presetPeriod] : []);
  const [record,  setRecord]  = useState(null); // flat {roll: "P"/"A"} for THIS batch's roster only
  const [saved,   setSaved]   = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [loading, setLoading] = useState(false);
  const [docMap, setDocMap]   = useState({}); // period -> full attendance document (all slots)

  // Load full attendance documents for the chosen date (all batch slots included)
  useEffect(() => {
    if (denied || !batchReady) return;
    async function loadDocMap() {
      const map = {};
      const checks = [];
      for (let p = 1; p <= periodsPerDay; p++) {
        checks.push(
          getDoc(doc(db, "attendance", section.id, "subjects", subject.id, "dates", makeKey(date, p)))
            .then(snap => { if (snap.exists()) map[p] = snap.data(); })
        );
      }
      await Promise.all(checks);
      setDocMap(map);
    }
    loadDocMap();
  }, [denied, batchReady, date, section.id, subject.id, periodsPerDay]);

  // doneMap for the period picker: a period counts as "done" for THIS batch only
  const doneMap = {};
  Object.keys(docMap).forEach(p => {
    const d = docMap[p];
    if (d && (d[slotKey] || (!batch && Object.keys(d).some(k => !k.startsWith("_"))))) {
      doneMap[p] = d;
    }
  });

  // When selected periods change, load existing data (first selected period that has data),
  // else default everyone to Present.
  useEffect(() => {
    if (denied) return;
    if (selPeriods.length === 0) { setRecord(null); return; }
    setLoading(true);
    const firstWithData = selPeriods.find(p => doneMap[p]);
    if (firstWithData) {
      const fullDoc = docMap[firstWithData] || {};
      const existingSlot = fullDoc[slotKey];
      if (existingSlot) {
        setRecord({ ...existingSlot });
      } else {
        // Old flat-shape doc (pre-batching) — use it directly as the roll map.
        const r = {};
        roster.forEach(st => { r[st.roll] = fullDoc[st.roll] ?? "P"; });
        setRecord(r);
      }
      setSaved(true);
    } else {
      const r = {};
      roster.forEach(st => { r[st.roll] = "P"; });
      setRecord(r);
      setSaved(false);
    }
    setLoading(false);
  }, [denied, selPeriods, docMap]);

  function togglePeriod(p) {
    setSelPeriods(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  }

  async function submit() {
    if (selPeriods.length === 0 || !record) return;
    setSaving(true);
    await Promise.all(
      selPeriods.map(p => {
        const ref = doc(db, "attendance", section.id, "subjects", subject.id, "dates", makeKey(date, p));
        // Merge: only this batch's slot is touched, so other batches' data on the
        // same date/period is never overwritten.
        return setDoc(ref, { [slotKey]: record }, { merge: true });
      })
    );
    setDocMap(prev => {
      const nd = { ...prev };
      selPeriods.forEach(p => { nd[p] = { ...(nd[p] || {}), [slotKey]: record }; });
      return nd;
    });
    setSaving(false);
    setSaved(true);
  }

  if (denied) {
    return (
      <div style={{ background: P.bg, minHeight: "100vh" }}>
        <TopBar title="Access denied" onBack={onBack} />
        <div style={{ padding: 24, textAlign: "center", color: P.red, fontWeight: 600 }}>
          ⚠ You are not assigned to this subject.
        </div>
      </div>
    );
  }

  const vals   = record ? Object.values(record) : [];
  const pCount = vals.filter(v => v === "P").length;
  const aCount = vals.filter(v => v === "A").length;
  const allP = vals.length > 0 && aCount === 0;
  const allA = vals.length > 0 && pCount === 0;

  return (
    <div style={{ background: P.bg, minHeight: "100vh" }}>
      <TopBar title="Mark attendance" subtitle={section.name + " · " + subject.name + (batch ? " · " + batch.label : "")} onBack={onBack} />

      {hasBatches && (
        <div style={{ padding: "14px 16px 0" }}>
          <div style={{ fontSize: 12, color: P.gray, fontWeight: 500, marginBottom: 6 }}>
            Which batch are you taking right now?
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {subject.batches.map(b => (
              <button key={b.id} onClick={() => { setSelBatchId(b.id); setSelPeriods([]); }}
                style={{
                  padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
                  border: selBatchId === b.id ? "2px solid " + P.blue : "1.5px solid " + P.border,
                  background: selBatchId === b.id ? P.blue : "#fff",
                  color: selBatchId === b.id ? "#fff" : "#374151",
                }}>
                {b.label} <span style={{ fontWeight: 400, opacity: 0.8 }}>(serial {b.rollStart}–{b.rollEnd})</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {!batchReady && (
        <div style={{ padding: "1.5rem 16px", textAlign: "center", color: P.gray, fontSize: 13 }}>
          Select your batch above to continue.
        </div>
      )}

      {batchReady && (
        <div style={{ padding: "14px 16px 0" }}>
          <PeriodPicker
            date={date}
            onDateChange={(d) => { setDate(d); setSelPeriods([]); }}
            periodsPerDay={periodsPerDay}
            selected={selPeriods}
            onToggle={togglePeriod}
            doneMap={doneMap}
          />
        </div>
      )}

      {batchReady && selPeriods.length === 0 && (
        <div style={{ padding: "1.5rem 16px", textAlign: "center", color: P.gray, fontSize: 13 }}>
          Select one or more periods above to begin marking.
        </div>
      )}

      {loading && <Spinner />}

      {!loading && selPeriods.length > 0 && record && (
        <>
          <div style={{ background: "#fff", padding: "10px 16px", borderBottom: "1px solid " + P.border, display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ fontSize: 13, color: P.gray }}>
              {fmtDate(date)} · Period{selPeriods.length > 1 ? "s" : ""} {selPeriods.slice().sort((a,b)=>a-b).join(", ")}
            </div>
            <div style={{ flex: 1 }} />
            <div style={{ background: P.greenL, color: P.green, fontSize: 13, fontWeight: 600, padding: "4px 12px", borderRadius: 8 }}>{pCount} P</div>
            <div style={{ background: P.redL,   color: P.red,   fontSize: 13, fontWeight: 600, padding: "4px 12px", borderRadius: 8 }}>{aCount} A</div>
          </div>
          <div style={{ background: "#fff", padding: "10px 16px", borderBottom: "1px solid " + P.border, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 12, color: P.gray, fontWeight: 600 }}>Default all to:</div>
            <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: "1.5px solid " + P.border }}>
              <button
                onClick={() => { setRecord(r => { const nr = {}; Object.keys(r).forEach(k => nr[k] = "P"); return nr; }); setSaved(false); }}
                style={{ padding: "6px 16px", fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", background: allP ? P.green : "#fff", color: allP ? "#fff" : P.gray }}
              >All Present</button>
              <button
                onClick={() => { setRecord(r => { const nr = {}; Object.keys(r).forEach(k => nr[k] = "A"); return nr; }); setSaved(false); }}
                style={{ padding: "6px 16px", fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", background: allA ? P.red : "#fff", color: allA ? "#fff" : P.gray }}
              >All Absent</button>
            </div>
          </div>
          <div style={{ padding: "10px 16px 120px" }}>
            <div style={{ fontSize: 12, color: P.gray, marginBottom: 10 }}>
              Tap a student's button to flip their status. This marking will be saved to all selected periods.
            </div>
            {roster.map(st => (
              <ARow key={st.roll} st={st} status={record[st.roll] || "P"}
                onToggle={roll => {
                  setRecord(r => ({ ...r, [roll]: r[roll] === "P" ? "A" : "P" }));
                  setSaved(false);
                }}
              />
            ))}
          </div>
          <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid " + P.border, padding: "12px 16px", display: "flex", gap: 10 }}>
            {saved ? (
              <>
                <div style={{ flex: 1, background: navigator.onLine ? P.greenL : P.amberL, color: navigator.onLine ? P.green : P.amber, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: 14, padding: 12 }}>
                  {navigator.onLine ? "✓ Attendance saved!" : "📡 Saved offline — will sync when online"}
                </div>
                <Btn variant="outline" onClick={onBack}>Back</Btn>
              </>
            ) : (
              <Btn full onClick={submit} disabled={saving}>
                {saving ? "Saving…" : "Submit attendance"}
              </Btn>
            )}
          </div>
        </>
      )}
    </div>
  );
}
