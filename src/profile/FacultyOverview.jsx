// src/profile/FacultyOverview.jsx
// One-page "at a glance" faculty summary for HoD / Master Admin — everything
// they'd want to know about a faculty member without clicking through tabs:
// contact, experience, subjects currently taught (pulled live from Sections),
// research interests, a publications breakdown, and projects guided.
// Publications/experience/interests are computed straight from the faculty's
// own profile data, so this view never goes stale or needs manual upkeep.

import React from "react";
import { SC, fmtMY } from "./profileShared";

function initialsOf(name) {
  return (name || "").split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

function yearsSince(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  const now = new Date();
  let years = now.getFullYear() - d.getFullYear();
  const monthDiff = now.getMonth() - d.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < d.getDate())) years--;
  return Math.max(years, 0);
}

// Indian academic year runs June–May.
function currentAcademicYearStart() {
  const now = new Date();
  const year = now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1;
  return year + "-06-01";
}

function pubBreakdown(pubs) {
  const ayStart = currentAcademicYearStart();
  function tally(list) {
    let sci = 0, scopus = 0, conf = 0, notIndexed = 0;
    list.forEach(p => {
      if (p.pubType === "Conference") { conf++; return; }
      if (p.indexing === "SCI") sci++;
      else if (p.indexing === "Scopus") scopus++;
      else notIndexed++;
    });
    return { sci, scopus, conf, notIndexed, total: list.length };
  }
  return {
    total: tally(pubs),
    recent: tally(pubs.filter(p => p.date && p.date >= ayStart)),
  };
}

function StatTile({ label, value, c }) {
  return (
    <div style={{ background: c.light, borderRadius: 10, padding: "10px 8px", textAlign: "center" }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: c.dark }}>{value}</div>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: c.main, marginTop: 2, textTransform: "uppercase" }}>{label}</div>
    </div>
  );
}

function Panel({ title, icon, c, children }) {
  return (
    <div style={{ background: "#fff", border: "1.5px solid #e5e7eb", borderRadius: 14, padding: 18, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 800, fontSize: 14.5, color: c.dark, marginBottom: 14 }}>
        <span style={{ background: c.light, color: c.main, width: 30, height: 30, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>{icon}</span>
        {title}
      </div>
      {children}
    </div>
  );
}

export default function FacultyOverview({ personName, phone, profile, facultySections, onOpenFullProfile, onDownloadResume }) {
  const bio = profile.bio || {};
  const experience = profile.experience || [];
  const publications = profile.publications || [];
  const projects = profile.projects || [];

  const currentRole = experience.find(e => e.current) || [...experience].sort((a, b) => (b.from || "").localeCompare(a.from || ""))[0];
  const totalExperienceYears = bio.experienceYears || "";
  const collegeExperienceYears = yearsSince(bio.doj);
  const pubs = pubBreakdown(publications);
  const btechGuided = projects.filter(p => p.projType === "B.Tech Guided").length;
  const mtechGuided = projects.filter(p => p.projType === "M.Tech Guided").length;

  const subjects = [];
  (facultySections || []).forEach(sec => {
    (sec.subjects || []).forEach(sub => {
      if (sub.facultyPhone === phone) subjects.push({ section: sec.name, subject: sub.name, type: sub.type });
    });
  });

  return (
    <div>
      {/* ── Header banner ── */}
      <div style={{ background: "linear-gradient(135deg,#0f766e,#0369a1)", borderRadius: 16, padding: 22, marginBottom: 16, display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{
          width: 92, height: 92, borderRadius: 16, flexShrink: 0, overflow: "hidden",
          background: bio.photoURL ? "transparent" : "rgba(255,255,255,0.25)", border: "3px solid #fff",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, fontWeight: 800, color: "#fff",
        }}>
          {bio.photoURL ? <img src={bio.photoURL} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initialsOf(personName)}
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontWeight: 800, fontSize: 23, color: "#fff" }}>{personName}</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", marginTop: 2 }}>College ID: {bio.employeeId || "— (not set)"}</div>
          <div style={{ fontSize: 15, color: "#fff", marginTop: 6 }}>
            {bio.designation || "Designation not set"}{bio.department ? " · " + bio.department : ""}
          </div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 10, fontSize: 12.5, color: "rgba(255,255,255,0.9)" }}>
            {bio.email && <span>✉️ {bio.email}</span>}
            <span>📞 {phone}</span>
            {bio.orcidId && <span>🆔 ORCID {bio.orcidId}</span>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onDownloadResume} style={{ background: "#0f172a", color: "#fff", border: "none", borderRadius: 10, padding: "10px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>📄 Resume</button>
          <button onClick={onOpenFullProfile} style={{ background: "rgba(255,255,255,0.2)", color: "#fff", border: "none", borderRadius: 10, padding: "10px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Full profile →</button>
        </div>
      </div>

      {/* ── Top stat row ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 10, marginBottom: 16 }}>
        <StatTile label="Total Experience" value={totalExperienceYears ? totalExperienceYears + " yrs" : "—"} c={SC.experience} />
        <StatTile label="Experience Here" value={collegeExperienceYears != null ? collegeExperienceYears + " yrs" : "—"} c={SC.qualifications} />
        <StatTile label="Publications" value={pubs.total.total} c={SC.publications} />
        <StatTile label="Projects Guided" value={btechGuided + mtechGuided} c={SC.projects} />
      </div>

      {/* ── Subjects teaching (live from Sections) ── */}
      <Panel title="Subjects Teaching — Current" icon="📘" c={SC.qualifications}>
        {subjects.length === 0 ? (
          <div style={{ color: "#9ca3af", fontSize: 13.5 }}>Not currently assigned any subject in Sections.</div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {subjects.map((s, i) => (
              <span key={i} style={{ fontSize: 12.5, fontWeight: 600, background: SC.qualifications.light, color: SC.qualifications.dark, padding: "6px 12px", borderRadius: 16 }}>
                {s.subject} <span style={{ opacity: 0.7 }}>· {s.section}</span>
              </span>
            ))}
          </div>
        )}
      </Panel>

      {/* ── Roles & responsibilities (current position) ── */}
      <Panel title="Roles & Responsibilities" icon="💼" c={SC.experience}>
        {!currentRole ? (
          <div style={{ color: "#9ca3af", fontSize: 13.5 }}>No experience entries added yet.</div>
        ) : (
          <>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>
              {currentRole.designation} — {currentRole.organization}
              <span style={{ fontWeight: 500, fontSize: 12, color: "#6b7280", marginLeft: 8 }}>
                {fmtMY(currentRole.from)} – {currentRole.current ? "Present" : fmtMY(currentRole.to)}
              </span>
            </div>
            {(currentRole.responsibilities || []).length > 0 ? (
              <div style={{ fontSize: 13, lineHeight: 1.8, color: "#374151" }}>
                {currentRole.responsibilities.map((r, i) => <div key={i}>• {r}</div>)}
              </div>
            ) : (
              <div style={{ color: "#9ca3af", fontSize: 13.5 }}>No responsibilities listed for this role.</div>
            )}
          </>
        )}
      </Panel>

      {/* ── Areas of research interest ── */}
      <Panel title="Areas of Research Interest" icon="🔬" c={SC.interest}>
        {(bio.specializations || []).length === 0 ? (
          <div style={{ color: "#9ca3af", fontSize: 13.5 }}>None added yet.</div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {bio.specializations.map((s, i) => (
              <span key={i} style={{ fontSize: 12.5, fontWeight: 600, background: SC.interest.light, color: SC.interest.dark, padding: "6px 12px", borderRadius: 16 }}>{s}</span>
            ))}
          </div>
        )}
      </Panel>

      {/* ── Publications summary ── */}
      <Panel title="Publications Summary" icon="📄" c={SC.publications}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: "#6b7280", marginBottom: 8, textTransform: "uppercase" }}>Total (all-time)</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 18 }}>
          <StatTile label="SCI" value={pubs.total.sci} c={SC.publications} />
          <StatTile label="Scopus" value={pubs.total.scopus} c={SC.qualifications} />
          <StatTile label="Conferences" value={pubs.total.conf} c={SC.conferences} />
          <StatTile label="Not Indexed" value={pubs.total.notIndexed} c={SC.workshops} />
        </div>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: "#6b7280", marginBottom: 8, textTransform: "uppercase" }}>Recent (current academic year)</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          <StatTile label="SCI" value={pubs.recent.sci} c={SC.publications} />
          <StatTile label="Scopus" value={pubs.recent.scopus} c={SC.qualifications} />
          <StatTile label="Conferences" value={pubs.recent.conf} c={SC.conferences} />
          <StatTile label="Not Indexed" value={pubs.recent.notIndexed} c={SC.workshops} />
        </div>
      </Panel>

      {/* ── Projects guided ── */}
      <Panel title="Projects Guided / Undertaken" icon="🧪" c={SC.projects}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
          <StatTile label="B.Tech Projects" value={btechGuided} c={SC.projects} />
          <StatTile label="M.Tech Projects" value={mtechGuided} c={SC.skills} />
        </div>
      </Panel>
    </div>
  );
}
