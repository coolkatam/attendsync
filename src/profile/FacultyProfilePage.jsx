// src/profile/FacultyProfilePage.jsx
// Faculty profile module — Bio, Qualifications, Experience, Publications,
// Workshops/FDPs, Conferences, Projects. Includes photo upload and bulk
// Excel import for Publications / Workshops / Conferences / Projects.

import React, { useState, useEffect, useRef } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { httpsCallable } from "firebase/functions";
import * as XLSX from "xlsx";
import { db, storage, functions } from "../firebase";
import { P, Btn, Card, Badge, Fld, Sel, Spinner } from "../components/UI";
import ResumeView from "./ResumeView";
import { SC, fmtMY } from "./profileShared";

const TABS = [
  ["bio", "Bio"],
  ["qualifications", "Qualifications"],
  ["experience", "Experience"],
  ["publications", "Publications"],
  ["workshops", "Workshops"],
  ["conferences", "Conferences"],
  ["projects", "Projects"],
];

const EMPTY_PROFILE = {
  bio: { designation: "", department: "", doj: "", email: "", employeeId: "", orcidId: "", scholarLink: "", experienceYears: "", specializations: [], technicalSkills: [], about: "", photoURL: "" },
  qualifications: [], experience: [], publications: [],
  workshops: [], conferences: [], projects: [],
};

function newId() { return "e" + Date.now() + Math.floor(Math.random() * 1000); }

// ── Shared form field components ─────────────────────────────────
// IMPORTANT: these live at module level (not inside EntryForm). Defining
// them inside the form component makes React remount the input on every
// keystroke, which throws the cursor out after each letter.
const LBL_STYLE = { fontSize: 16.5, color: "#374151", marginBottom: 6, fontWeight: 600 };
const INPUT_STYLE = { width: "100%", boxSizing: "border-box", border: "1.5px solid " + P.border, borderRadius: 10, padding: "11px 13px", fontSize: 18, fontFamily: "inherit" };

function Field({ label, value, onChange, placeholder, type = "text" }) {
  return (
    <div>
      <div style={LBL_STYLE}>{label}</div>
      <input type={type} value={value || ""} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={INPUT_STYLE} />
    </div>
  );
}
function Select({ label, value, onChange, options }) {
  return (
    <div>
      <div style={LBL_STYLE}>{label}</div>
      <select value={value || ""} onChange={e => onChange(e.target.value)} style={INPUT_STYLE}>
        <option value="">— select —</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

// Normalize text from Excel cells (strips invisible unicode, trims)
function norm(v) {
  if (v === undefined || v === null) return "";
  return String(v).normalize("NFKC").replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
}

// ── Excel column templates per section ───────────────────────────
const TEMPLATES = {
  publications: {
    headers: ["Type (Journal/Conference/Book Chapter/Patent)", "Title", "Journal or Conference Name", "Month (1-12)", "Year", "Volume/Issue", "Impact Factor", "Indexing (SCI/Scopus/UGC-CARE/Other)", "Authors in order (semicolon separated)", "DOI or link"],
    sample: ["Journal", "Sample paper title", "Journal of Cleaner Production", 3, 2025, "Vol 412", 11.1, "SCI", "K. Arun Kumar; P. Ramesh", "https://doi.org/..."],
    map: (row) => ({
      id: newId(), pubType: norm(row[0]) || "Journal", title: norm(row[1]), venue: norm(row[2]),
      date: row[4] ? String(row[4]) + "-" + String(row[3] || 1).padStart(2, "0") + "-01" : "",
      volume: norm(row[5]), impactFactor: norm(row[6]), indexing: norm(row[7]) || "Other",
      authors: norm(row[8]).split(";").map(a => a.trim()).filter(Boolean), doi: norm(row[9]),
    }),
  },
  workshops: {
    headers: ["Role (Attended/Conducted/Resource Person)", "Title", "Organizer", "Month (1-12)", "Year", "Duration (days)"],
    sample: ["Attended", "Sample workshop title", "NITTTR Chennai", 1, 2026, 5],
    map: (row) => ({
      id: newId(), role: norm(row[0]) || "Attended", title: norm(row[1]), organizer: norm(row[2]),
      date: row[4] ? String(row[4]) + "-" + String(row[3] || 1).padStart(2, "0") + "-01" : "",
      days: norm(row[5]),
    }),
  },
  conferences: {
    headers: ["Role (Attended/Presented/Organized)", "Title", "Venue/Organizer", "Month (1-12)", "Year"],
    sample: ["Presented", "Sample conference title", "IIT Madras", 12, 2024],
    map: (row) => ({
      id: newId(), role: norm(row[0]) || "Attended", title: norm(row[1]), venue: norm(row[2]),
      date: row[4] ? String(row[4]) + "-" + String(row[3] || 1).padStart(2, "0") + "-01" : "",
    }),
  },
  projects: {
    headers: ["Type (External Funded/Consultancy/M.Tech Guided/B.Tech Guided/Internal)", "Title", "Funding Agency or Student Batch", "Amount (if funded)", "Status (Ongoing/Completed)", "Start Month (1-12)", "Start Year", "End Month (1-12)", "End Year"],
    sample: ["External Funded", "Sample project title", "DST-SERB", "18.6 lakhs", "Ongoing", 6, 2024, 5, 2027],
    map: (row) => ({
      id: newId(), projType: norm(row[0]) || "Internal", title: norm(row[1]), agency: norm(row[2]),
      amount: norm(row[3]), status: norm(row[4]) || "Ongoing",
      date: row[6] ? String(row[6]) + "-" + String(row[5] || 1).padStart(2, "0") + "-01" : "",
      to: row[8] ? String(row[8]) + "-" + String(row[7] || 1).padStart(2, "0") + "-01" : "",
    }),
  },
};

function downloadTemplateFor(section) {
  const t = TEMPLATES[section];
  if (!t) return;
  const ws = XLSX.utils.aoa_to_sheet([t.headers, t.sample]);
  ws["!cols"] = t.headers.map(h => ({ wch: Math.max(String(h).length, 14) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, section.slice(0, 31));
  XLSX.writeFile(wb, section + "_template.xlsx");
}

function parseWorkbook(file, section) {
  return new Promise((resolve, reject) => {
    const t = TEMPLATES[section];
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
        // Skip header row (row 0); ignore fully blank rows
        const entries = rows.slice(1)
          .filter(r => r.some(c => norm(c) !== ""))
          .map(t.map);
        resolve(entries);
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// ── Main component ──────────────────────────────────────────────
export default function FacultyProfilePage({ user, viewPhone, readOnly = false }) {
  const phone = viewPhone || user.phone;
  const [profile, setProfile] = useState(null);
  const [personName, setPersonName] = useState(viewPhone ? "" : user.name);
  const [tab, setTab] = useState("bio");
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [bulkMsg, setBulkMsg] = useState("");
  const [photoFile, setPhotoFile] = useState(null); // data URL staged for the adjust modal
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState(null);
  const [showResume, setShowResume] = useState(false);
  const fileInputRef = useRef(null);
  const bulkInputRef = useRef({});

  useEffect(() => {
    async function load() {
      const snap = await getDoc(doc(db, "facultyProfiles", phone));
      let base = snap.exists()
        ? { ...EMPTY_PROFILE, ...snap.data(), bio: { ...EMPTY_PROFILE.bio, ...(snap.data().bio || {}) } }
        : { ...EMPTY_PROFILE };

      // Auto-fill designation/department/name from the users record on first
      // load, so faculty don't have to retype what they already gave at signup.
      try {
        const u = await getDoc(doc(db, "users", phone));
        if (u.exists()) {
          const ud = u.data();
          if (viewPhone) setPersonName(ud.name || phone);
          if (!base.bio.designation && ud.designation) base.bio = { ...base.bio, designation: ud.designation };
          if (!base.bio.department && ud.branch) base.bio = { ...base.bio, department: ud.branch };
        }
      } catch (e) { /* ignore */ }

      setProfile(base);
    }
    load();
  }, [phone, viewPhone]);

  async function persist(next) {
    setProfile(next);
    setSaving(true);
    try {
      await setDoc(doc(db, "facultyProfiles", phone), { ...next, updatedAt: new Date().toISOString() });
    } finally {
      setSaving(false);
    }
  }

  // Merge ORCID publications into the existing list, skipping anything that
  // already matches an existing entry by title (so re-syncing never creates
  // duplicates, and manually entered publications are never touched).
  function mergeOrcidPublications(existing, incoming) {
    const norm = s => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const existingTitles = new Set(existing.map(e => norm(e.title)));
    const newOnes = incoming.filter(p => p.title && !existingTitles.has(norm(p.title)));
    return [...existing, ...newOnes];
  }

  async function syncFromOrcid() {
    const orcidId = (profile.bio.orcidId || "").trim();
    if (!orcidId) { setSyncMsg({ ok: false, text: "Add your ORCID iD above first." }); return; }
    setSyncing(true);
    setSyncMsg(null);
    try {
      const call = httpsCallable(functions, "syncFacultyStats");
      const res = await call({ orcidId });
      const { publications } = res.data;
      const mergedPubs = mergeOrcidPublications(profile.publications || [], publications || []);
      const addedCount = mergedPubs.length - (profile.publications || []).length;
      await persist({ ...profile, publications: mergedPubs });
      setSyncMsg({ ok: true, text: "Synced — added " + addedCount + " new publication(s) from ORCID." });
    } catch (e) {
      setSyncMsg({ ok: false, text: e.message || "Sync failed. Please check the ORCID iD and try again." });
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMsg(null), 6000);
    }
  }

  function saveEntry(section, entry) {
    const list = profile[section] || [];
    const idx = list.findIndex(e => e.id === entry.id);
    const nextList = idx >= 0 ? list.map(e => (e.id === entry.id ? entry : e)) : [...list, entry];
    persist({ ...profile, [section]: nextList });
    setEditing(null);
  }

  function deleteEntry(section, id) {
    if (!window.confirm("Delete this entry? This cannot be undone.")) return;
    persist({ ...profile, [section]: (profile[section] || []).filter(e => e.id !== id) });
  }

  async function handleBulkFile(section, file) {
    if (!file) return;
    setBulkMsg("Reading file…");
    try {
      const entries = await parseWorkbook(file, section);
      if (entries.length === 0) {
        setBulkMsg("No rows found — check the file matches the template.");
        return;
      }
      const merged = { ...profile, [section]: [...(profile[section] || []), ...entries] };
      await persist(merged);
      setBulkMsg("✅ Added " + entries.length + " entries from the file.");
      setTimeout(() => setBulkMsg(""), 4000);
    } catch (e) {
      setBulkMsg("Could not read that file. Please use the downloaded template format.");
    }
  }

  async function handlePhotoSelect(file) {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { alert("Photo file is too large. Please choose a smaller image."); return; }
    const reader = new FileReader();
    reader.onload = e => setPhotoFile(e.target.result);
    reader.readAsDataURL(file);
  }

  async function uploadCroppedPhoto(blob) {
    setUploadingPhoto(true);
    setPhotoFile(null);
    try {
      const photoRef = ref(storage, "profilePhotos/" + phone);
      await uploadBytes(photoRef, blob, { contentType: "image/jpeg" });
      const rawUrl = await getDownloadURL(photoRef);
      // Every upload reuses the same storage path, so without a cache-buster
      // browsers keep showing the previously cached image at that same URL.
      const url = rawUrl + (rawUrl.includes("?") ? "&" : "?") + "v=" + Date.now();
      // Read the CURRENT profile fresh from state (not a stale form snapshot)
      // so uploading a photo never gets overwritten by an unrelated save.
      setProfile(prev => {
        const next = { ...prev, bio: { ...prev.bio, photoURL: url } };
        setDoc(doc(db, "facultyProfiles", phone), { ...next, updatedAt: new Date().toISOString() });
        return next;
      });
    } catch (e) {
      alert("Photo upload failed. Please try again.");
    } finally {
      setUploadingPhoto(false);
    }
  }

  if (!profile) return <Spinner />;

  const counts = {
    publications: (profile.publications || []).length,
    workshops: (profile.workshops || []).length,
    conferences: (profile.conferences || []).length,
    projects: (profile.projects || []).length,
    experience: (profile.experience || []).length,
  };

  const initials = (personName || phone).split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

  // Cache-bust with the doc's last-updated time so a re-uploaded photo never
  // keeps showing a previously cached image at the same URL.
  const displayPhotoURL = profile.bio.photoURL
    ? profile.bio.photoURL + (profile.bio.photoURL.includes("?") ? "&" : "?") + "cb=" + encodeURIComponent(profile.updatedAt || "")
    : "";

  return (
    <div>
      {/* ── Profile header ── */}
      <div style={{ background: "linear-gradient(135deg,#0f766e,#0369a1)", borderRadius: 16, padding: 20, marginBottom: 14, display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <div
            onClick={() => !readOnly && fileInputRef.current?.click()}
            style={{
              width: 100, height: 100, borderRadius: 16, background: displayPhotoURL ? "none" : "rgba(255,255,255,0.25)",
              border: "3px solid #fff", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 37, fontWeight: 800, color: "#fff", cursor: readOnly ? "default" : "pointer",
              backgroundImage: displayPhotoURL ? "url(" + displayPhotoURL + ")" : "none",
              backgroundSize: "cover", backgroundPosition: "center", overflow: "hidden",
            }}>
            {!profile.bio.photoURL && (uploadingPhoto ? "…" : initials || "?")}
          </div>
          {!readOnly && (
            <div onClick={() => fileInputRef.current?.click()}
              style={{ position: "absolute", bottom: 0, right: 0, width: 30, height: 30, borderRadius: "50%", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, cursor: "pointer", boxShadow: "0 2px 6px rgba(0,0,0,0.3)" }}>
              📷
            </div>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }}
            onChange={e => { handlePhotoSelect(e.target.files[0]); e.target.value = ""; }} />
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontWeight: 800, fontSize: 25, color: "#fff" }}>{personName || phone}</div>
          <div style={{ fontSize: 18, color: "rgba(255,255,255,0.9)", marginTop: 2 }}>
            {profile.bio.designation || "Designation not set"}
            {profile.bio.department ? " · " + profile.bio.department : ""}
            {profile.bio.experienceYears ? " · " + profile.bio.experienceYears + " yrs experience" : ""}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
            {(profile.bio.specializations || []).map((s, i) => (
              <span key={i} style={{ fontSize: 15, fontWeight: 600, background: "rgba(255,255,255,0.22)", color: "#fff", padding: "4px 12px", borderRadius: 20 }}>{s}</span>
            ))}
          </div>
        </div>
        {saving && <div style={{ fontSize: 15, color: "#fff" }}>Saving…</div>}
      </div>

      {/* ── Action bar: sync + resume download ── */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
        {!readOnly && (
          <button onClick={syncFromOrcid} disabled={syncing}
            style={{ background: "#4338ca", color: "#fff", border: "none", borderRadius: 10, padding: "10px 18px", fontWeight: 700, fontSize: 16.5, cursor: syncing ? "default" : "pointer", opacity: syncing ? 0.7 : 1 }}>
            {syncing ? "🔄 Syncing…" : "🔄 Sync from ORCID"}
          </button>
        )}
        <button onClick={() => setShowResume(true)}
          style={{ background: "#0f172a", color: "#fff", border: "none", borderRadius: 10, padding: "10px 18px", fontWeight: 700, fontSize: 16.5, cursor: "pointer" }}>
          📄 Download Resume
        </button>
        {syncMsg && (
          <span style={{ fontSize: 16, fontWeight: 600, color: syncMsg.ok ? "#15803d" : "#dc2626" }}>{syncMsg.text}</span>
        )}
      </div>

      {/* ── Stat counters ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: 10, marginBottom: 16 }}>
        {[
          ["Publications", counts.publications, SC.publications],
          ["Workshops", counts.workshops, SC.workshops],
          ["Conferences", counts.conferences, SC.conferences],
          ["Projects", counts.projects, SC.projects],
          ["Experience", counts.experience, SC.experience],
        ].map(([label, n, c]) => (
          <div key={label} style={{ background: c.light, borderRadius: 12, padding: "14px 12px", textAlign: "center" }}>
            <div style={{ fontSize: 29, fontWeight: 800, color: c.dark }}>{n}</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: c.main, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* ── Tabs — bold colored pills ── */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {TABS.map(([t, label]) => {
          const c = SC[t];
          const active = tab === t;
          return (
            <button key={t} onClick={() => setTab(t)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                background: active ? c.main : c.light,
                color: active ? "#fff" : c.dark,
                border: "none", borderRadius: 24, cursor: "pointer", fontFamily: "inherit",
                fontSize: 17, fontWeight: 700, padding: "9px 16px",
                boxShadow: active ? "0 3px 10px rgba(0,0,0,0.18)" : "none",
              }}>
              <span style={{ fontSize: 18 }}>{c.icon}</span> {label}
            </button>
          );
        })}
      </div>

      {/* ── Tab content ── */}
      {tab === "bio" && (
        <BioForm bio={profile.bio} readOnly={readOnly}
          onSave={bio => persist({ ...profile, bio })} />
      )}
      {tab !== "bio" && (
        <SectionList
          section={tab}
          entries={profile[tab] || []}
          readOnly={readOnly}
          bulkMsg={bulkMsg}
          onAdd={() => setEditing({ section: tab, entry: null })}
          onEdit={entry => setEditing({ section: tab, entry })}
          onDelete={id => deleteEntry(tab, id)}
          onTemplate={() => downloadTemplateFor(tab)}
          onBulkPick={(el) => { bulkInputRef.current[tab] = el; }}
          onBulkFile={file => handleBulkFile(tab, file)}
        />
      )}

      {editing && (
        <EntryForm
          section={editing.section}
          entry={editing.entry}
          onCancel={() => setEditing(null)}
          onSave={entry => saveEntry(editing.section, entry)}
        />
      )}

      {photoFile && (
        <PhotoAdjustModal
          src={photoFile}
          uploading={uploadingPhoto}
          onCancel={() => setPhotoFile(null)}
          onConfirm={uploadCroppedPhoto}
        />
      )}

      {showResume && (
        <ResumeView
          personName={personName || phone}
          phone={phone}
          profile={profile}
          onClose={() => setShowResume(false)}
        />
      )}
    </div>
  );
}

// ── Photo adjust modal: zoom + drag, then crop to a square via canvas ──
function PhotoAdjustModal({ src, onCancel, onConfirm, uploading }) {
  const BOX = 280; // preview box size in px, also the exported image size
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [natural, setNatural] = useState({ w: 1, h: 1 });
  const imgRef = useRef(null);
  const dragRef = useRef(null);

  function onImgLoad(e) {
    setNatural({ w: e.target.naturalWidth, h: e.target.naturalHeight });
  }

  const baseScale = Math.max(BOX / natural.w, BOX / natural.h);
  const dispW = natural.w * baseScale * zoom;
  const dispH = natural.h * baseScale * zoom;
  const left = (BOX - dispW) / 2 + offset.x;
  const top = (BOX - dispH) / 2 + offset.y;

  function startDrag(clientX, clientY) {
    dragRef.current = { startX: clientX, startY: clientY, origX: offset.x, origY: offset.y };
  }
  function moveDrag(clientX, clientY) {
    if (!dragRef.current) return;
    const dx = clientX - dragRef.current.startX;
    const dy = clientY - dragRef.current.startY;
    setOffset({ x: dragRef.current.origX + dx, y: dragRef.current.origY + dy });
  }
  function endDrag() { dragRef.current = null; }

  function confirm() {
    const canvas = document.createElement("canvas");
    canvas.width = BOX; canvas.height = BOX;
    const ctx = canvas.getContext("2d");
    const img = imgRef.current;
    ctx.drawImage(img, left, top, dispW, dispH);
    canvas.toBlob(blob => { if (blob) onConfirm(blob); }, "image/jpeg", 0.92);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.65)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 380, textAlign: "center" }}>
        <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 4 }}>📷 Adjust your photo</div>
        <div style={{ fontSize: 16, color: P.gray, marginBottom: 16 }}>Drag to reposition · use the slider to zoom</div>

        <div
          style={{ width: BOX, height: BOX, borderRadius: 16, overflow: "hidden", margin: "0 auto 18px", position: "relative", background: "#f3f4f6", cursor: "grab", border: "3px solid #e5e7eb", touchAction: "none" }}
          onMouseDown={e => startDrag(e.clientX, e.clientY)}
          onMouseMove={e => moveDrag(e.clientX, e.clientY)}
          onMouseUp={endDrag}
          onMouseLeave={endDrag}
          onTouchStart={e => startDrag(e.touches[0].clientX, e.touches[0].clientY)}
          onTouchMove={e => moveDrag(e.touches[0].clientX, e.touches[0].clientY)}
          onTouchEnd={endDrag}
        >
          <img ref={imgRef} src={src} alt="" onLoad={onImgLoad} draggable={false}
            style={{ position: "absolute", left, top, width: dispW, height: dispH, userSelect: "none", pointerEvents: "none" }} />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <span style={{ fontSize: 16, color: P.gray }}>🔍</span>
          <input type="range" min="1" max="3" step="0.05" value={zoom} onChange={e => setZoom(Number(e.target.value))} style={{ flex: 1 }} />
        </div>

        <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
          <button onClick={onCancel} disabled={uploading}
            style={{ background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 10, padding: "12px 22px", fontWeight: 700, fontSize: 17, cursor: "pointer" }}>Cancel</button>
          <button onClick={confirm} disabled={uploading}
            style={{ background: "#0369a1", color: "#fff", border: "none", borderRadius: 10, padding: "12px 26px", fontWeight: 700, fontSize: 17, cursor: "pointer", opacity: uploading ? 0.6 : 1 }}>
            {uploading ? "Uploading…" : "Use this photo"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Bio form ────────────────────────────────────────────────────
function BioForm({ bio, onSave, readOnly }) {
  const [d, setD] = useState({ ...bio });
  const [specInput, setSpecInput] = useState("");
  const [skillInput, setSkillInput] = useState("");
  const [saved, setSaved] = useState(false);
  const c = SC.bio;

  function handleSave() {
    onSave({ ...d, photoURL: bio.photoURL }); // always keep the CURRENT photo, never a stale one
    setSaved(true);
    setTimeout(() => setSaved(false), 3500);
  }

  function addSpec() {
    const v = specInput.trim();
    if (!v) return;
    setD({ ...d, specializations: [...(d.specializations || []), v] });
    setSpecInput("");
  }

  function addSkill() {
    const v = skillInput.trim();
    if (!v) return;
    setD({ ...d, technicalSkills: [...(d.technicalSkills || []), v] });
    setSkillInput("");
  }

  const lbl = { fontSize: 16.5, color: "#4b5563", marginBottom: 5, fontWeight: 600 };
  const inputStyle = { width: "100%", boxSizing: "border-box", border: "1.5px solid " + P.border, borderRadius: 9, padding: "9px 12px", fontSize: 18.5, fontFamily: "inherit" };
  const row2 = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 };
  const row3 = { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 14 };

  if (readOnly) {
    return (
      <Card style={{ borderTop: "4px solid " + c.main, padding: 20 }}>
        <Row label="Designation" value={bio.designation} />
        <Row label="Department" value={bio.department} />
        <Row label="Employee / College ID" value={bio.employeeId} />
        <Row label="Email" value={bio.email} />
        <Row label="ORCID iD" value={bio.orcidId ? <a href={"https://orcid.org/" + bio.orcidId} target="_blank" rel="noreferrer" style={{ color: "#0369a1" }}>{bio.orcidId}</a> : ""} />
        <Row label="Google Scholar" value={bio.scholarLink ? <a href={bio.scholarLink} target="_blank" rel="noreferrer" style={{ color: "#0369a1" }}>View profile →</a> : ""} />
        <Row label="Date of joining" value={bio.doj} />
        <Row label="Total experience" value={bio.experienceYears ? bio.experienceYears + " years" : ""} />
        <Row label="About" value={bio.about} />
      </Card>
    );
  }

  return (
    <Card style={{ borderTop: "4px solid " + c.main, padding: "18px 20px" }}>
      <div style={row2}>
        <div>
          <div style={lbl}>Designation</div>
          <select value={d.designation} onChange={e => setD({ ...d, designation: e.target.value })} style={inputStyle}>
            <option value="">— select —</option>
            <option value="Professor">Professor</option>
            <option value="Associate Professor">Associate Professor</option>
            <option value="Assistant Professor">Assistant Professor</option>
            <option value="Lab Assistant">Lab Assistant</option>
          </select>
        </div>
        <div>
          <div style={lbl}>Department</div>
          <input value={d.department} onChange={e => setD({ ...d, department: e.target.value })} placeholder="Mechanical Engineering" style={inputStyle} />
        </div>
      </div>
      <div style={row3}>
        <div>
          <div style={lbl}>Employee / College ID</div>
          <input value={d.employeeId} onChange={e => setD({ ...d, employeeId: e.target.value.trim() })} placeholder="e.g. RE0009" style={inputStyle} />
        </div>
        <div>
          <div style={lbl}>Date of joining</div>
          <input type="date" value={d.doj} onChange={e => setD({ ...d, doj: e.target.value })} style={inputStyle} />
        </div>
        <div>
          <div style={lbl}>Total experience (yrs)</div>
          <input type="number" value={d.experienceYears} onChange={e => setD({ ...d, experienceYears: e.target.value })} placeholder="12" style={inputStyle} />
        </div>
      </div>
      <div style={row3}>
        <div>
          <div style={lbl}>Email</div>
          <input type="email" value={d.email} onChange={e => setD({ ...d, email: e.target.value })} placeholder="name@college.in" style={inputStyle} />
        </div>
        <div>
          <div style={lbl}>ORCID iD</div>
          <input value={d.orcidId} onChange={e => setD({ ...d, orcidId: e.target.value.trim() })} placeholder="0000-0002-1825-0097" style={inputStyle} />
        </div>
        <div>
          <div style={lbl}>Google Scholar link</div>
          <input value={d.scholarLink} onChange={e => setD({ ...d, scholarLink: e.target.value.trim() })} placeholder="scholar.google.com/citations?user=…" style={inputStyle} />
        </div>
      </div>

      <div style={lbl}>Core / Technical skills</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        {(d.technicalSkills || []).map((s, i) => (
          <span key={i} onClick={() => setD({ ...d, technicalSkills: d.technicalSkills.filter((_, j) => j !== i) })}
            style={{ fontSize: 16, fontWeight: 600, background: c.light, color: c.dark, padding: "5px 12px", borderRadius: 20, cursor: "pointer" }}>
            {s} ✕
          </span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <input value={skillInput} onChange={e => setSkillInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addSkill(); } }}
          placeholder="e.g. AutoCAD, ANSYS, Six Sigma — press Enter or Add"
          style={{ ...inputStyle, flex: 1 }} />
        <button onClick={addSkill} style={{ background: c.main, color: "#fff", border: "none", borderRadius: 10, padding: "0 20px", fontWeight: 700, cursor: "pointer", fontSize: 17 }}>Add</button>
      </div>

      <div style={lbl}>Areas of interest</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        {(d.specializations || []).map((s, i) => (
          <span key={i} onClick={() => setD({ ...d, specializations: d.specializations.filter((_, j) => j !== i) })}
            style={{ fontSize: 16, fontWeight: 600, background: c.light, color: c.dark, padding: "5px 12px", borderRadius: 20, cursor: "pointer" }}>
            {s} ✕
          </span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <input value={specInput} onChange={e => setSpecInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addSpec(); } }}
          placeholder="e.g. Sustainable manufacturing — press Enter or Add"
          style={{ ...inputStyle, flex: 1 }} />
        <button onClick={addSpec} style={{ background: c.main, color: "#fff", border: "none", borderRadius: 10, padding: "0 20px", fontWeight: 700, cursor: "pointer", fontSize: 17 }}>Add</button>
      </div>

      <div style={lbl}>About me (2–4 sentences, appears at the top of your CV)</div>
      <textarea value={d.about} onChange={e => setD({ ...d, about: e.target.value })} rows={4}
        style={{ ...inputStyle, resize: "vertical", marginBottom: 20, lineHeight: 1.6 }} />

      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <button onClick={handleSave} style={{ background: saved ? "#16a34a" : c.main, color: "#fff", border: "none", borderRadius: 10, padding: "13px 26px", fontWeight: 700, fontSize: 18, cursor: "pointer" }}>
          {saved ? "✅ Saved!" : "Save bio"}
        </button>
        {saved && <span style={{ fontSize: 17, fontWeight: 600, color: "#16a34a" }}>Your bio has been saved successfully.</span>}
      </div>
    </Card>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 15, color: P.gray, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 18, marginTop: 2 }}>{value || "—"}</div>
    </div>
  );
}

// ── Section list (cards + Add + bulk upload) ────────────────────
function SectionList({ section, entries, onAdd, onEdit, onDelete, onTemplate, onBulkFile, readOnly, bulkMsg }) {
  const c = SC[section];
  const sorted = [...entries].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const bulkRef = useRef(null);

  return (
    <div>
      {!readOnly && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: c.dark }}>
            {entries.length} {entries.length === 1 ? "entry" : "entries"}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={onTemplate}
              style={{ background: "#fff", color: c.main, border: "1.5px solid " + c.main, borderRadius: 10, padding: "10px 16px", fontWeight: 700, fontSize: 16.5, cursor: "pointer" }}>
              ⬇ Download template
            </button>
            <button onClick={() => bulkRef.current?.click()}
              style={{ background: c.light, color: c.dark, border: "none", borderRadius: 10, padding: "10px 16px", fontWeight: 700, fontSize: 16.5, cursor: "pointer" }}>
              📤 Upload Excel
            </button>
            <input ref={bulkRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }}
              onChange={e => { onBulkFile(e.target.files[0]); e.target.value = ""; }} />
            <button onClick={onAdd}
              style={{ background: c.main, color: "#fff", border: "none", borderRadius: 10, padding: "10px 18px", fontWeight: 700, fontSize: 16.5, cursor: "pointer" }}>
              ＋ Add
            </button>
          </div>
        </div>
      )}
      {bulkMsg && (
        <div style={{ background: c.light, color: c.dark, borderRadius: 10, padding: "10px 14px", fontSize: 16.5, fontWeight: 600, marginBottom: 12 }}>
          {bulkMsg}
        </div>
      )}
      {sorted.length === 0 && (
        <div style={{ textAlign: "center", color: P.gray, fontSize: 17, border: "2px dashed " + P.border, borderRadius: 12, padding: 30 }}>
          Nothing added yet{readOnly ? "" : " — use Add for one entry, or Upload Excel for many at once"}
        </div>
      )}
      {sorted.map(e => (
        <div key={e.id} style={{ background: "#fff", border: "1.5px solid " + P.border, borderLeft: "5px solid " + c.main, borderRadius: 10, padding: "16px 18px", marginBottom: 10 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <EntryDisplay section={section} e={e} c={c} />
            </div>
            {!readOnly && (
              <div style={{ display: "flex", gap: 12, flexShrink: 0 }}>
                <span onClick={() => onEdit(e)} style={{ cursor: "pointer", fontSize: 21 }} title="Edit">✏️</span>
                <span onClick={() => onDelete(e.id)} style={{ cursor: "pointer", fontSize: 21 }} title="Delete">🗑️</span>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── How each entry type is displayed on its card ────────────────
function EntryDisplay({ section, e, c }) {
  const titleStyle = { fontWeight: 700, fontSize: 18.5, color: "#111827" };
  const subStyle = { fontSize: 16, color: P.gray, marginTop: 4 };
  if (section === "qualifications") {
    return (
      <>
        <div style={titleStyle}>{e.degree}{e.specialization ? " — " + e.specialization : ""}</div>
        <div style={subStyle}>{[e.institution, e.university, e.year, e.grade].filter(Boolean).join(" · ")}</div>
      </>
    );
  }
  if (section === "experience") {
    return (
      <>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div style={titleStyle}>{e.designation} — {e.organization}</div>
          {e.current && <Badge color="green">Current</Badge>}
        </div>
        <div style={subStyle}>{fmtMY(e.from)} – {e.current ? "Present" : fmtMY(e.to)}</div>
        {(e.responsibilities || []).length > 0 && (
          <div style={{ fontSize: 16.5, color: "#374151", marginTop: 8, lineHeight: 1.8 }}>
            {e.responsibilities.map((r, i) => <div key={i}>• {r}</div>)}
          </div>
        )}
      </>
    );
  }
  if (section === "publications") {
    return (
      <>
        <div style={titleStyle}>{e.title}</div>
        <div style={subStyle}>{[e.venue, fmtMY(e.date ? e.date.slice(0, 7) : ""), (e.authors || []).join(", ")].filter(Boolean).join(" · ")}</div>
        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
          {e.indexing && <Badge color="blue">{e.indexing}</Badge>}
          {e.pubType && <Badge color="teal">{e.pubType}</Badge>}
          {e.impactFactor && <Badge color="amber">IF {e.impactFactor}</Badge>}
        </div>
      </>
    );
  }
  if (section === "workshops") {
    return (
      <>
        <div style={titleStyle}>{e.title}</div>
        <div style={subStyle}>{[e.days ? e.days + "-day" : "", e.organizer, fmtMY(e.date ? e.date.slice(0, 7) : "")].filter(Boolean).join(" · ")}</div>
        {e.role && <div style={{ marginTop: 8 }}><Badge color={e.role === "Attended" ? "blue" : "green"}>{e.role}</Badge></div>}
      </>
    );
  }
  if (section === "conferences") {
    return (
      <>
        <div style={titleStyle}>{e.title}</div>
        <div style={subStyle}>{[e.venue, fmtMY(e.date ? e.date.slice(0, 7) : "")].filter(Boolean).join(" · ")}</div>
        {e.role && <div style={{ marginTop: 8 }}><Badge color="teal">{e.role}</Badge></div>}
      </>
    );
  }
  if (section === "projects") {
    return (
      <>
        <div style={titleStyle}>{e.title}</div>
        <div style={subStyle}>
          {[e.agency, e.amount ? "₹" + e.amount : "", (fmtMY(e.date ? e.date.slice(0, 7) : "") + (e.to ? " – " + fmtMY(e.to.slice(0, 7)) : ""))].filter(Boolean).join(" · ")}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          {e.projType && <Badge color="amber">{e.projType}</Badge>}
          {e.status && <Badge color={e.status === "Ongoing" ? "green" : "blue"}>{e.status}</Badge>}
        </div>
      </>
    );
  }
  return null;
}

// ── Entry add/edit form (modal — bigger, bolder) ─────────────────
function EntryForm({ section, entry, onSave, onCancel }) {
  const c = SC[section];
  const [d, setD] = useState(entry ? { ...entry } : { id: newId() });
  const [authorInput, setAuthorInput] = useState("");
  const [err, setErr] = useState("");

  function set(k, v) { setD(prev => ({ ...prev, [k]: v })); }

  function addAuthor() {
    const v = authorInput.trim();
    if (!v) return;
    set("authors", [...(d.authors || []), v]);
    setAuthorInput("");
  }
  function moveAuthor(i, dir) {
    const a = [...(d.authors || [])];
    const j = i + dir;
    if (j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j], a[i]];
    set("authors", a);
  }

  function validateAndSave() {
    const need = {
      qualifications: ["degree", "institution", "year"],
      experience: ["designation", "organization", "from"],
      publications: ["title", "venue", "date"],
      workshops: ["title", "organizer", "date"],
      conferences: ["title", "venue", "date"],
      projects: ["title", "date"],
    }[section] || [];
    for (const k of need) {
      if (!d[k] || String(d[k]).trim() === "") {
        setErr("Please fill all required (*) fields.");
        return;
      }
    }
    const out = { ...d };
    ["date", "to", "from"].forEach(k => {
      if (out[k] && out[k].length === 7) out[k] = out[k] + "-01";
    });
    if (section === "experience" && out.from) out.date = out.from;
    onSave(out);
  }

  const titles = {
    qualifications: "qualification", experience: "position", publications: "publication",
    workshops: "workshop / FDP", conferences: "conference", projects: "project",
  };
  const m = v => (v || "").slice(0, 7);
  const lbl = LBL_STYLE;
  const inputStyle = INPUT_STYLE;
  const row2 = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 };
  const row3 = { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 16 };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 640, maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ background: c.main, padding: "18px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", borderRadius: "16px 16px 0 0" }}>
          <div style={{ fontWeight: 800, fontSize: 21, color: "#fff" }}>{c.icon} {entry ? "Edit" : "Add"} {titles[section]}</div>
          <span onClick={onCancel} style={{ cursor: "pointer", fontSize: 23, color: "#fff" }}>✕</span>
        </div>

        <div style={{ padding: 24 }}>
          {section === "qualifications" && (
            <>
              <div style={row2}>
                <Field label="Degree *" value={d.degree} onChange={v => set("degree", v)} placeholder="Ph.D. / M.Tech / B.Tech" />
                <Field label="Specialization" value={d.specialization} onChange={v => set("specialization", v)} placeholder="Machine Design" />
              </div>
              <div style={{ marginBottom: 16 }}><Field label="Institution *" value={d.institution} onChange={v => set("institution", v)} placeholder="College / university name" /></div>
              <div style={{ marginBottom: 16 }}><Field label="University / board" value={d.university} onChange={v => set("university", v)} placeholder="JNTU Kakinada" /></div>
              <div style={row2}>
                <Field label="Year of passing *" type="number" value={d.year} onChange={v => set("year", v)} placeholder="2021" />
                <Field label="CGPA / percentage" value={d.grade} onChange={v => set("grade", v)} placeholder="8.4 CGPA" />
              </div>
            </>
          )}

          {section === "experience" && (
            <>
              <div style={{ marginBottom: 16 }}><Field label="Designation *" value={d.designation} onChange={v => set("designation", v)} placeholder="Assistant Professor" /></div>
              <div style={{ marginBottom: 16 }}><Field label="Organization *" value={d.organization} onChange={v => set("organization", v)} placeholder="Raghu Engineering College" /></div>
              <div style={row2}>
                <Field label="From *" type="month" value={m(d.from)} onChange={v => set("from", v)} />
                <Field label="To (leave blank if current)" type="month" value={m(d.to)} onChange={v => set("to", v)} />
              </div>
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 17, marginBottom: 16, cursor: "pointer" }}>
                <input type="checkbox" checked={!!d.current} onChange={e => set("current", e.target.checked)} />
                This is my current position
              </label>
              <div style={lbl}>Roles and responsibilities — one per line</div>
              <textarea rows={4} value={(d.responsibilities || []).join("\n")}
                onChange={e => set("responsibilities", e.target.value.split("\n"))}
                onBlur={e => set("responsibilities", e.target.value.split("\n").map(s => s.trim()).filter(Boolean))}
                placeholder={"Teaching CAD/CAM and Manufacturing Technology\nExamination records administrator"}
                style={{ ...inputStyle, resize: "vertical", marginBottom: 16, lineHeight: 1.6 }} />
            </>
          )}

          {section === "publications" && (
            <>
              <div style={row2}>
                <Select label="Type" value={d.pubType} onChange={v => set("pubType", v)}
                  options={[{ value: "Journal", label: "Journal paper" }, { value: "Conference", label: "Conference paper" }, { value: "Book Chapter", label: "Book chapter" }, { value: "Patent", label: "Patent" }]} />
                <Select label="Indexing" value={d.indexing} onChange={v => set("indexing", v)}
                  options={[{ value: "SCI", label: "SCI / SCIE" }, { value: "Scopus", label: "Scopus" }, { value: "UGC-CARE", label: "UGC-CARE" }, { value: "Other", label: "Other / not indexed" }]} />
              </div>
              <div style={{ marginBottom: 16 }}><Field label="Title *" value={d.title} onChange={v => set("title", v)} placeholder="Paper title" /></div>
              <div style={{ marginBottom: 16 }}><Field label="Journal / conference name *" value={d.venue} onChange={v => set("venue", v)} placeholder="Journal of Cleaner Production" /></div>
              <div style={row3}>
                <Field label="Month & year *" type="month" value={m(d.date)} onChange={v => set("date", v)} />
                <Field label="Volume / issue" value={d.volume} onChange={v => set("volume", v)} placeholder="Vol 412" />
                <Field label="Impact factor" value={d.impactFactor} onChange={v => set("impactFactor", v)} placeholder="11.1" />
              </div>

              <div style={lbl}>Authors in order (first author first)</div>
              {(d.authors || []).map((a, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, border: "1.5px solid " + P.border, borderRadius: 10, padding: "9px 13px", marginBottom: 7 }}>
                  <span style={{ fontSize: 17, flex: 1 }}>{i + 1}. {a}</span>
                  <span onClick={() => moveAuthor(i, -1)} style={{ cursor: "pointer", fontSize: 18 }}>↑</span>
                  <span onClick={() => moveAuthor(i, 1)} style={{ cursor: "pointer", fontSize: 18 }}>↓</span>
                  <span onClick={() => set("authors", d.authors.filter((_, j) => j !== i))} style={{ cursor: "pointer", fontSize: 18 }}>✕</span>
                </div>
              ))}
              <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
                <input value={authorInput} onChange={e => setAuthorInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addAuthor(); } }}
                  placeholder="Author name — press Enter or Add"
                  style={{ ...inputStyle, flex: 1 }} />
                <button onClick={addAuthor} style={{ background: c.light, color: c.dark, border: "none", borderRadius: 10, padding: "0 20px", fontWeight: 700, cursor: "pointer" }}>Add</button>
              </div>
              <div style={{ marginBottom: 16 }}><Field label="DOI or link" value={d.doi} onChange={v => set("doi", v)} placeholder="https://doi.org/…" /></div>
            </>
          )}

          {section === "workshops" && (
            <>
              <div style={{ marginBottom: 16 }}>
                <Select label="Role" value={d.role} onChange={v => set("role", v)}
                  options={[{ value: "Attended", label: "Attended" }, { value: "Conducted", label: "Conducted / organized" }, { value: "Resource Person", label: "Resource person" }]} />
              </div>
              <div style={{ marginBottom: 16 }}><Field label="Title *" value={d.title} onChange={v => set("title", v)} placeholder="Workshop / FDP title" /></div>
              <div style={{ marginBottom: 16 }}><Field label="Organizer *" value={d.organizer} onChange={v => set("organizer", v)} placeholder="NITTTR Chennai" /></div>
              <div style={row2}>
                <Field label="Month & year *" type="month" value={m(d.date)} onChange={v => set("date", v)} />
                <Field label="Duration (days)" type="number" value={d.days} onChange={v => set("days", v)} placeholder="5" />
              </div>
            </>
          )}

          {section === "conferences" && (
            <>
              <div style={{ marginBottom: 16 }}>
                <Select label="Role" value={d.role} onChange={v => set("role", v)}
                  options={[{ value: "Attended", label: "Attended" }, { value: "Presented", label: "Presented paper" }, { value: "Organized", label: "Organized / convener" }]} />
              </div>
              <div style={{ marginBottom: 16 }}><Field label="Title *" value={d.title} onChange={v => set("title", v)} placeholder="Conference name" /></div>
              <div style={{ marginBottom: 16 }}><Field label="Venue / organizer *" value={d.venue} onChange={v => set("venue", v)} placeholder="IIT Madras" /></div>
              <div style={{ marginBottom: 16 }}><Field label="Month & year *" type="month" value={m(d.date)} onChange={v => set("date", v)} /></div>
            </>
          )}

          {section === "projects" && (
            <>
              <div style={{ marginBottom: 16 }}>
                <Select label="Type" value={d.projType} onChange={v => set("projType", v)}
                  options={[{ value: "External Funded", label: "External funded (DST / AICTE / SERB…)" }, { value: "Consultancy", label: "Consultancy" }, { value: "M.Tech Guided", label: "M.Tech project guided" }, { value: "B.Tech Guided", label: "B.Tech project guided" }, { value: "Internal", label: "Internal / other" }]} />
              </div>
              <div style={{ marginBottom: 16 }}><Field label="Title *" value={d.title} onChange={v => set("title", v)} placeholder="Project title" /></div>
              <div style={{ marginBottom: 16 }}><Field label="Funding agency / student batch" value={d.agency} onChange={v => set("agency", v)} placeholder="DST-SERB  ·  or  ·  4 students, final year" /></div>
              <div style={row2}>
                <Field label="Amount (₹, if funded)" value={d.amount} onChange={v => set("amount", v)} placeholder="18.6 lakhs" />
                <Select label="Status" value={d.status} onChange={v => set("status", v)} options={[{ value: "Ongoing", label: "Ongoing" }, { value: "Completed", label: "Completed" }]} />
              </div>
              <div style={row2}>
                <Field label="Start (month & year) *" type="month" value={m(d.date)} onChange={v => set("date", v)} />
                <Field label="End (month & year)" type="month" value={m(d.to)} onChange={v => set("to", v)} />
              </div>
            </>
          )}

          {err && <div style={{ color: P.red, fontSize: 17, marginBottom: 14, fontWeight: 600 }}>{err}</div>}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, borderTop: "1.5px solid " + P.border, paddingTop: 16 }}>
            <button onClick={onCancel} style={{ background: "#f3f4f6", color: "#374151", border: "none", borderRadius: 10, padding: "12px 22px", fontWeight: 700, fontSize: 17, cursor: "pointer" }}>Cancel</button>
            <button onClick={validateAndSave} style={{ background: c.main, color: "#fff", border: "none", borderRadius: 10, padding: "12px 26px", fontWeight: 700, fontSize: 17, cursor: "pointer" }}>Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}
