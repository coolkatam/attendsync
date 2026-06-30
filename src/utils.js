// src/utils.js — helper functions and Excel export (PERIOD-AWARE)

export function today() {
  return new Date().toISOString().split("T")[0];
}

// Master admin — has access to ALL sections/users across the whole system.
export const MASTER_ADMIN_PHONE = "9502808301";

// Format a "YYYY-MM-DD" string as "DD/MM/YY" for display.
export function fmtDate(isoDate) {
  if (!isoDate) return "";
  const parts = isoDate.split("-");
  if (parts.length !== 3) return isoDate;
  const [y, m, d] = parts;
  return d + "/" + m + "/" + y.slice(2);
}

export function calcPct(present, total) {
  if (!total) return 0;
  return Math.round((present / total) * 10000) / 100; // 2 decimal places
}

// ── Period-key helpers ──────────────────────────────────────
// Attendance docs are now keyed as "{date}_{period}", e.g. "2026-06-18_1"
export function makeKey(date, period) {
  return date + "_" + period;
}

export function parseKey(key) {
  const idx = key.lastIndexOf("_");
  return { date: key.slice(0, idx), period: key.slice(idx + 1) };
}

// Sort keys by date, then numeric period
export function sortKeys(keys) {
  return [...keys].sort((a, b) => {
    const pa = parseKey(a), pb = parseKey(b);
    if (pa.date !== pb.date) return pa.date < pb.date ? -1 : 1;
    return Number(pa.period) - Number(pb.period);
  });
}

// Group a subject's attendance map ({ "date_period": {roll:"P"|"A"} })
// into a per-date structure: { date: { periodsHeld: n, byRoll: { roll: presentCount } } }
// Returns { dates: [sortedDateStrings], byDate: {...} }
export function groupByDate(dateMap, students) {
  const keys = sortKeys(Object.keys(dateMap || {}));
  const byDate = {}; // date -> { periodsHeld, byRoll: { roll: presentCount } }
  keys.forEach(k => {
    const { date } = parseKey(k);
    if (!byDate[date]) {
      byDate[date] = { periodsHeld: 0, byRoll: {} };
      (students || []).forEach(st => { byDate[date].byRoll[st.roll] = 0; });
    }
    byDate[date].periodsHeld += 1;
    const rec = dateMap[k] || {};
    (students || []).forEach(st => {
      const status = rec[st.roll] ?? "P";
      if (status !== "A") byDate[date].byRoll[st.roll] += 1;
    });
  });
  const dates = Object.keys(byDate).sort();
  return { dates, byDate };
}

// Batch-aware version of groupByDate. Each student's status is read from the
// correct batch slot in the record (falling back to old flat-shape records
// for backwards compatibility with subjects/data created before batching existed).
// `subject` must be passed so we know each student's batch (by serial position).
export function groupByDateBatched(dateMap, students, subject) {
  const keys = sortKeys(Object.keys(dateMap || {}));
  const byDate = {};
  keys.forEach(k => {
    const { date } = parseKey(k);
    if (!byDate[date]) {
      byDate[date] = { periodsHeld: 0, byRoll: {} };
      (students || []).forEach(st => { byDate[date].byRoll[st.roll] = 0; });
    }
    byDate[date].periodsHeld += 1;
    const rec = dateMap[k] || {};
    (students || []).forEach((st, idx) => {
      const status = readStatus(rec, subject, st, idx + 1);
      if (status !== "A") byDate[date].byRoll[st.roll] += 1;
    });
  });
  const dates = Object.keys(byDate).sort();
  return { dates, byDate };
}

// Row color class based on percentage: red <65, yellow 65-74.99, none >=75
export function rowColor(pct) {
  if (pct < 65) return "red";
  if (pct < 75) return "yellow";
  return "none";
}

// ── Batch helpers ────────────────────────────────────────────
// A subject may optionally define `batches: [{id, label, rollStart, rollEnd, facultyPhone}]`.
// rollStart/rollEnd are 1-based SERIAL POSITIONS within section.students (not roll number text).
// If a subject has no batches (or empty array), it behaves exactly as before — single faculty, whole class.

// Find which batch a student belongs to, given their serial position (1-based index+1) in the roster.
// Returns the batch object, or null if the subject isn't batched / student isn't in any batch.
export function findBatchForSerial(subject, serial) {
  if (!subject.batches || subject.batches.length === 0) return null;
  return subject.batches.find(b => serial >= b.rollStart && serial <= b.rollEnd) || null;
}

// Returns the list of students belonging to a given batch (by serial range), or all students if no batch given.
export function studentsInBatch(students, batch) {
  if (!batch) return students || [];
  return (students || []).filter((st, idx) => {
    const serial = idx + 1;
    return serial >= batch.rollStart && serial <= batch.rollEnd;
  });
}

// The key used inside an attendance document to store a batch's roll-map.
// Unbatched subjects always use "_all".
export const UNBATCHED_KEY = "_all";

export function batchSlotKey(batchId) {
  return batchId ? ("_batch_" + batchId) : UNBATCHED_KEY;
}

// Reads a student's P/A status out of an attendance record, regardless of whether
// the record is in the new batch-keyed shape ({_all: {...}} / {_batch_x: {...}})
// or the OLD flat shape ({roll: "P"/"A"}) from before batching existed.
// `subject` + `serial` are used to know which batch slot to look in for batched subjects.
export function readStatus(record, subject, student, serial) {
  if (!record) return "P";
  const batch = findBatchForSerial(subject, serial);
  const slotKey = batchSlotKey(batch ? batch.id : null);
  if (record[slotKey] && Object.prototype.hasOwnProperty.call(record[slotKey], student.roll)) {
    return record[slotKey][student.roll];
  }
  // Fallback: old flat-shape record (pre-batching), or batch slot doesn't have this student yet.
  if (Object.prototype.hasOwnProperty.call(record, student.roll)) {
    return record[student.roll];
  }
  return "P";
}

// Validate a list of batches against the section's student count.
// Returns { valid: bool, error: string|null }. Requires no overlaps and no gaps,
// fully covering serials 1..totalStudents.
export function validateBatches(batches, totalStudents) {
  if (!batches || batches.length === 0) return { valid: true, error: null };
  const sorted = [...batches].sort((a, b) => a.rollStart - b.rollStart);
  let expectedStart = 1;
  for (const b of sorted) {
    if (b.rollStart > b.rollEnd) {
      return { valid: false, error: b.label + ": start serial can't be greater than end serial." };
    }
    if (b.rollStart !== expectedStart) {
      return { valid: false, error: b.label + " should start at serial " + expectedStart + " (no gaps or overlaps allowed between batches)." };
    }
    expectedStart = b.rollEnd + 1;
  }
  if (expectedStart - 1 !== totalStudents) {
    return { valid: false, error: "Batches must cover all " + totalStudents + " students. Currently covering up to serial " + (expectedStart - 1) + "." };
  }
  return { valid: true, error: null };
}

export function parseCSV(text) {
  const lines = text.trim().split("\n").filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
  const ri = headers.findIndex(h => h.includes("roll"));
  const ni = headers.findIndex(h => h.includes("name"));
  const gi = headers.findIndex(h => h.includes("gender"));
  const mi = headers.findIndex(h => h.includes("mobile") || h.includes("phone"));
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(",").map(x => x.trim());
    const roll = ri >= 0 ? c[ri] : "";
    if (!roll || roll.toLowerCase().includes("roll")) continue;
    out.push({
      roll,
      name:   ni >= 0 ? (c[ni]   || "") : "",
      gender: gi >= 0 ? (c[gi]   || "").toUpperCase().slice(0, 1) : "",
      mobile: mi >= 0 ? (c[mi]   || "") : "",
    });
  }
  return out;
}

export function downloadTemplate() {
  const csv = "S.No,Roll Number,Student Name,Gender,Mobile Number\n1,,,,\n";
  const a = document.createElement("a");
  a.href = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
  a.download = "student_template.csv";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

// ── Excel Export ───────────────────────────────────────────
// sectionAtt = scoped to section: { subId: { "date_period": { roll: "P"|"A" } or {_all/_batch_x: {...}} } }
// Each column = one date. Cell value = number of periods present that day.
// Batched subjects get one table section per batch; the Consolidated sheet always
// merges correctly per-student regardless of batching.
export function exportXLS(section, sectionAtt) {
  const att = sectionAtt || {};

  function esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function hc(v) {
    return '<Cell ss:StyleID="H"><Data ss:Type="String">' + esc(v) + '</Data></Cell>';
  }
  function nc(v, sid) {
    const s = sid ? ' ss:StyleID="' + sid + '"' : "";
    return '<Cell' + s + '><Data ss:Type="Number">' + Number(v) + '</Data></Cell>';
  }
  function sc(v, sid) {
    const s = sid ? ' ss:StyleID="' + sid + '"' : "";
    return '<Cell' + s + '><Data ss:Type="String">' + esc(v) + '</Data></Cell>';
  }
  // row style based on % — red <65, amber(yellow) 65-74.99, none/green >=75
  function rstyle(p) { return p < 65 ? "RR" : p < 75 ? "RA" : ""; }
  function rstyleAttr(p) { const s = rstyle(p); return s ? ' ss:StyleID="' + s + '"' : ""; }

  let sheets = "";

  // ── Per-subject sheets (batch-wise sub-tables if the subject is batched) ──
  section.subjects.forEach(sub => {
    const dm = att[sub.id] || {};
    const batches = (sub.batches && sub.batches.length > 0) ? sub.batches : [null]; // null = whole class, no batching

    let rows = "";
    batches.forEach(batch => {
      const batchStudents = batch ? studentsInBatch(section.students, batch) : section.students;
      const { dates, byDate } = groupByDateBatched(dm, batchStudents, sub);

      if (batch) {
        rows += "<Row><Cell ss:StyleID=\"H\"><Data ss:Type=\"String\">" + esc(batch.label) + "</Data></Cell></Row>";
      }

      let hrow = hc("S.No") + hc("Roll No") + hc("Name") + hc("Gender");
      dates.forEach(d => { hrow += hc(fmtDate(d) + " (" + byDate[d].periodsHeld + "p)"); });
      hrow += hc("Total Attended") + hc("Total Classes") + hc("% Attendance");
      rows += "<Row>" + hrow + "</Row>";

      const totalPeriods = dates.reduce((a, d) => a + byDate[d].periodsHeld, 0);

      batchStudents.forEach((st, i) => {
        let present = 0;
        let cells = nc(i + 1) + sc(st.roll) + sc(st.name || "") + sc(st.gender || "");
        dates.forEach(d => {
          const v = byDate[d].byRoll[st.roll] || 0;
          present += v;
          cells += nc(v);
        });
        const p = calcPct(present, totalPeriods);
        cells += nc(present) + nc(totalPeriods) + nc(p);
        rows += '<Row' + rstyleAttr(p) + '>' + cells + "</Row>";
      });
    });

    const safeName = sub.name.replace(/[\\\/\?\*\[\]:]/g, "").slice(0, 31);
    sheets += '<Worksheet ss:Name="' + esc(safeName) + '"><Table>' + rows + '</Table></Worksheet>';
  });

  // ── Consolidated sheet (always one row per student, correctly batch-merged) ──
  const subGrouped = section.subjects.map(sub => {
    // For consolidated totals we need each student's own batch data merged into one lookup.
    const dm = att[sub.id] || {};
    return groupByDateBatched(dm, section.students, sub);
  });
  const subTotals  = subGrouped.map(g => g.dates.reduce((a, d) => a + g.byDate[d].periodsHeld, 0));
  const grandTotal = subTotals.reduce((a, b) => a + b, 0);

  let chrow = hc("S.No") + hc("Roll No") + hc("Name") + hc("Gender");
  section.subjects.forEach((sub, i) => {
    chrow += hc(sub.name + " (" + subTotals[i] + ")");
  });
  chrow += hc("Total Attended (" + grandTotal + ")") + hc("Overall %");
  let crows = "<Row>" + chrow + "</Row>";

  section.students.forEach((st, i) => {
    let cells = nc(i + 1) + sc(st.roll) + sc(st.name || "") + sc(st.gender || "");
    let grandPresent = 0;

    section.subjects.forEach((sub, si) => {
      const g = subGrouped[si];
      let p = 0;
      g.dates.forEach(d => { p += g.byDate[d].byRoll[st.roll] || 0; });
      grandPresent += p;
      cells += nc(p);
    });

    const op = calcPct(grandPresent, grandTotal);
    cells += nc(grandPresent) + nc(op);
    crows += '<Row' + rstyleAttr(op) + '>' + cells + "</Row>";
  });

  sheets += '<Worksheet ss:Name="Consolidated"><Table>' + crows + '</Table></Worksheet>';

  // ── Build & download ────────────────────────────────────
  const xml = [
    '<?xml version="1.0"?>',
    '<?mso-application progid="Excel.Sheet"?>',
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"',
    ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">',
    '<Styles>',
    '<Style ss:ID="H"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#1a56a0" ss:Pattern="Solid"/></Style>',
    '<Style ss:ID="RR"><Interior ss:Color="#fee2e2" ss:Pattern="Solid"/></Style>',
    '<Style ss:ID="RA"><Interior ss:Color="#fef3c7" ss:Pattern="Solid"/></Style>',
    '</Styles>',
    sheets,
    '</Workbook>',
  ].join("\n");

  const ts   = new Date().toISOString().slice(0, 10);
  const name = section.name.replace(/[^a-zA-Z0-9 _-]/g, "") + "_Attendance_" + ts + ".xls";
  const blob = new Blob([xml], { type: "application/vnd.ms-excel" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
