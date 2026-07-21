// src/profile/FacultyProfilesDirectory.jsx
// HoD / Master Admin view:
//  1) "Directory" — grid of all faculty; tap anyone to open their full
//     profile (read-only FacultyProfilePage).
//  2) "Department research" — every Publication / Workshop / Conference /
//     Project across ALL faculty in one list, filtered by a From/To date
//     range, with one-click Excel download of exactly what is displayed.

import React, { useState, useEffect } from "react";
import { collection, getDocs } from "firebase/firestore";
import * as XLSX from "xlsx";
import { db } from "../firebase";
import { P, Spinner, Badge } from "../components/UI";
import FacultyProfilePage from "./FacultyProfilePage";

const CATS = [
  { id: "publications", label: "Publications", icon: "📄", main: "#0f766e", light: "#ccfbf1", dark: "#134e4a" },
  { id: "workshops",    label: "Workshops",    icon: "🛠️", main: "#b45309", light: "#fef3c7", dark: "#78350f" },
  { id: "conferences",  label: "Conferences",  icon: "🎤", main: "#6d28d9", light: "#ede9fe", dark: "#4c1d95" },
  { id: "projects",     label: "Projects",     icon: "🧪", main: "#c2410c", light: "#ffedd5", dark: "#7c2d12" },
];

function fmtMY(v) {
  if (!v) return "";
  const [y, m] = v.split("-");
  const months = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return (months[Number(m)] || "") + " " + y;
}

export default function FacultyProfilesDirectory({ user }) {
  const [view, setView] = useState("directory"); // directory | research
  const [faculty, setFaculty] = useState(null);  // [{phone, name, designation, profile}]
  const [openPhone, setOpenPhone] = useState(null);
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("publications");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  useEffect(() => {
    async function load() {
      const [usersSnap, profSnap] = await Promise.all([
        getDocs(collection(db, "users")),
        getDocs(collection(db, "facultyProfiles")),
      ]);
      const profiles = {};
      profSnap.forEach(d => { profiles[d.id] = d.data(); });
      const list = [];
      usersSnap.forEach(d => {
        const u = d.data();
        if (u.status !== "approved") return;
        list.push({
          phone: d.id,
          name: u.name || d.id,
          designation: (profiles[d.id]?.bio?.designation) || u.designation || "",
          photoURL: profiles[d.id]?.bio?.photoURL || "",
          profile: profiles[d.id] || {},
        });
      });
      list.sort((a, b) => a.name.localeCompare(b.name));
      setFaculty(list);
    }
    load();
  }, []);

  if (openPhone) {
    const person = faculty?.find(f => f.phone === openPhone);
    return (
      <div>
        <button onClick={() => setOpenPhone(null)}
          style={{ background: "#fff", color: "#374151", border: "1.5px solid " + P.border, borderRadius: 10, padding: "10px 18px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit", marginBottom: 14 }}>
          ← Back to faculty list
        </button>
        <FacultyProfilePage user={user} viewPhone={openPhone} readOnly={true} key={openPhone} />
        {person && <div style={{ height: 8 }} />}
      </div>
    );
  }

  if (!faculty) return <Spinner />;

  // ── Department research: flatten all entries across faculty ──
  const allEntries = [];
  if (view === "research") {
    faculty.forEach(f => {
      (f.profile[cat] || []).forEach(e => {
        const d = e.date || "";
        if (fromDate && d < fromDate) return;
        if (toDate && d > toDate + "\uffff") return;
        allEntries.push({ ...e, facultyName: f.name, facultyPhone: f.phone });
      });
    });
    allEntries.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }

  function downloadExcel() {
    const c = CATS.find(x => x.id === cat);
    let headers, rows;
    if (cat === "publications") {
      headers = ["Faculty", "Type", "Title", "Journal/Conference", "Month-Year", "Volume", "Impact Factor", "Indexing", "Authors", "DOI"];
      rows = allEntries.map(e => [e.facultyName, e.pubType || "", e.title || "", e.venue || "", fmtMY((e.date || "").slice(0, 7)), e.volume || "", e.impactFactor || "", e.indexing || "", (e.authors || []).join("; "), e.doi || ""]);
    } else if (cat === "workshops") {
      headers = ["Faculty", "Role", "Title", "Organizer", "Month-Year", "Duration (days)"];
      rows = allEntries.map(e => [e.facultyName, e.role || "", e.title || "", e.organizer || "", fmtMY((e.date || "").slice(0, 7)), e.days || ""]);
    } else if (cat === "conferences") {
      headers = ["Faculty", "Role", "Title", "Venue/Organizer", "Month-Year"];
      rows = allEntries.map(e => [e.facultyName, e.role || "", e.title || "", e.venue || "", fmtMY((e.date || "").slice(0, 7))]);
    } else {
      headers = ["Faculty", "Type", "Title", "Agency/Students", "Amount", "Status", "Start", "End"];
      rows = allEntries.map(e => [e.facultyName, e.projType || "", e.title || "", e.agency || "", e.amount || "", e.status || "", fmtMY((e.date || "").slice(0, 7)), fmtMY((e.to || "").slice(0, 7))]);
    }
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws["!cols"] = headers.map(h => ({ wch: Math.max(String(h).length + 2, 14) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, c.label.slice(0, 31));
    const range = (fromDate || toDate) ? ("_" + (fromDate || "start") + "_to_" + (toDate || "today")) : "_all";
    XLSX.writeFile(wb, "Department_" + c.label + range + ".xlsx");
  }

  const filteredFaculty = faculty.filter(f =>
    f.name.toLowerCase().includes(search.toLowerCase()) || f.phone.includes(search));

  const activeCat = CATS.find(x => x.id === cat);

  return (
    <div>
      {/* ── View switch ── */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <button onClick={() => setView("directory")}
          style={{ background: view === "directory" ? "#0f766e" : "#ccfbf1", color: view === "directory" ? "#fff" : "#134e4a", border: "none", borderRadius: 24, padding: "11px 20px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
          👥 Faculty directory
        </button>
        <button onClick={() => setView("research")}
          style={{ background: view === "research" ? "#c2410c" : "#ffedd5", color: view === "research" ? "#fff" : "#7c2d12", border: "none", borderRadius: 24, padding: "11px 20px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
          📊 Department research
        </button>
      </div>

      {view === "directory" && (
        <>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search faculty by name or phone…"
            style={{ width: "100%", boxSizing: "border-box", border: "1.5px solid " + P.border, borderRadius: 12, padding: "13px 16px", fontSize: 15, fontFamily: "inherit", marginBottom: 16 }} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 12 }}>
            {filteredFaculty.map(f => {
              const initials = f.name.split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
              const pubs = (f.profile.publications || []).length;
              const projs = (f.profile.projects || []).length;
              return (
                <div key={f.phone} onClick={() => setOpenPhone(f.phone)}
                  style={{ background: "#fff", border: "1.5px solid " + P.border, borderRadius: 14, padding: 16, cursor: "pointer", display: "flex", gap: 12, alignItems: "center", transition: "box-shadow .15s" }}
                  onMouseEnter={e => e.currentTarget.style.boxShadow = "0 6px 18px rgba(0,0,0,0.1)"}
                  onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}>
                  <div style={{
                    width: 54, height: 54, borderRadius: "50%", flexShrink: 0,
                    background: f.photoURL ? "transparent" : "#0f766e",
                    backgroundImage: f.photoURL ? "url(" + f.photoURL + ")" : "none",
                    backgroundSize: "cover", backgroundPosition: "center",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "#fff", fontWeight: 700, fontSize: 17,
                  }}>{!f.photoURL && initials}</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.name}</div>
                    <div style={{ fontSize: 12, color: P.gray }}>{f.designation || "—"}</div>
                    <div style={{ fontSize: 11.5, color: P.gray, marginTop: 3 }}>📄 {pubs} publications · 🧪 {projs} projects</div>
                  </div>
                </div>
              );
            })}
          </div>
          {filteredFaculty.length === 0 && (
            <div style={{ textAlign: "center", color: P.gray, fontSize: 14, padding: 30 }}>No faculty match that search.</div>
          )}
        </>
      )}

      {view === "research" && (
        <>
          {/* Category pills */}
          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
            {CATS.map(c => (
              <button key={c.id} onClick={() => setCat(c.id)}
                style={{ background: cat === c.id ? c.main : c.light, color: cat === c.id ? "#fff" : c.dark, border: "none", borderRadius: 22, padding: "9px 16px", fontWeight: 700, fontSize: 13.5, cursor: "pointer", fontFamily: "inherit" }}>
                {c.icon} {c.label}
              </button>
            ))}
          </div>

          {/* From / To range + download */}
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, background: "#fff", border: "1.5px solid " + P.border, borderRadius: 10, padding: "9px 13px" }}>
              <span style={{ color: P.gray, fontWeight: 600 }}>From:</span>
              <input type="date" value={fromDate} max={toDate || undefined} onChange={e => setFromDate(e.target.value)}
                style={{ border: "none", fontSize: 14, fontFamily: "inherit" }} />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, background: "#fff", border: "1.5px solid " + P.border, borderRadius: 10, padding: "9px 13px" }}>
              <span style={{ color: P.gray, fontWeight: 600 }}>To:</span>
              <input type="date" value={toDate} min={fromDate || undefined} onChange={e => setToDate(e.target.value)}
                style={{ border: "none", fontSize: 14, fontFamily: "inherit" }} />
            </label>
            {(fromDate || toDate) && (
              <button onClick={() => { setFromDate(""); setToDate(""); }}
                style={{ background: "none", border: "none", color: P.gray, fontSize: 13, textDecoration: "underline", cursor: "pointer", fontFamily: "inherit" }}>
                Clear
              </button>
            )}
            <div style={{ flex: 1 }} />
            <button onClick={downloadExcel} disabled={allEntries.length === 0}
              style={{ background: activeCat.main, color: "#fff", border: "none", borderRadius: 10, padding: "11px 20px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit", opacity: allEntries.length === 0 ? 0.5 : 1 }}>
              ⬇ Download Excel ({allEntries.length})
            </button>
          </div>

          {/* Summary line */}
          <div style={{ fontSize: 14, fontWeight: 700, color: activeCat.dark, marginBottom: 12 }}>
            {allEntries.length} {activeCat.label.toLowerCase()}
            {(fromDate || toDate) ? " between " + (fromDate ? fmtMY(fromDate.slice(0, 7)) : "start") + " and " + (toDate ? fmtMY(toDate.slice(0, 7)) : "today") : " (all time)"}
            {" · across " + new Set(allEntries.map(e => e.facultyPhone)).size + " faculty"}
          </div>

          {/* Entries */}
          {allEntries.map(e => (
            <div key={e.facultyPhone + "_" + e.id}
              style={{ background: "#fff", border: "1.5px solid " + P.border, borderLeft: "5px solid " + activeCat.main, borderRadius: 10, padding: "14px 16px", marginBottom: 9 }}>
              <div style={{ fontWeight: 700, fontSize: 14.5 }}>{e.title}</div>
              <div style={{ fontSize: 12.5, color: P.gray, marginTop: 3 }}>
                {[
                  e.venue || e.organizer || e.agency,
                  fmtMY((e.date || "").slice(0, 7)) + (e.to ? " – " + fmtMY((e.to || "").slice(0, 7)) : ""),
                ].filter(Boolean).join(" · ")}
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ fontSize: 12, fontWeight: 700, background: activeCat.light, color: activeCat.dark, padding: "3px 10px", borderRadius: 16 }}>
                  👤 {e.facultyName}
                </span>
                {e.indexing && <Badge color="blue">{e.indexing}</Badge>}
                {e.pubType && <Badge color="teal">{e.pubType}</Badge>}
                {e.role && <Badge color="green">{e.role}</Badge>}
                {e.projType && <Badge color="amber">{e.projType}</Badge>}
                {e.status && <Badge color={e.status === "Ongoing" ? "green" : "blue"}>{e.status}</Badge>}
              </div>
            </div>
          ))}
          {allEntries.length === 0 && (
            <div style={{ textAlign: "center", color: P.gray, fontSize: 14, border: "2px dashed " + P.border, borderRadius: 12, padding: 30 }}>
              No {activeCat.label.toLowerCase()} found for this date range.
            </div>
          )}
        </>
      )}
    </div>
  );
}
