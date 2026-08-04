// src/profile/ResumeView.jsx
// Full-page resume/CV preview built from a faculty member's profile data —
// two columns (photo + contact on the left, everything else on the right),
// downloadable via the browser's own print-to-PDF (keeps all text real and
// selectable, which is what makes a PDF resume ATS-parseable — unlike a
// screenshot-style export, nothing here is rendered as an image).

import React from "react";
import { SC, fmtMY } from "./profileShared";

function initialsOf(name) {
  return (name || "").split(" ").map(w => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

function SectionHeading({ c, children }) {
  return (
    <div style={{ fontSize: 14.5, fontWeight: 800, color: c.dark, borderBottom: "2.5px solid " + c.main, paddingBottom: 5, marginBottom: 10, marginTop: 20, letterSpacing: 0.3, textTransform: "uppercase" }}>
      {c.icon} {children}
    </div>
  );
}

function TagRow({ items, c }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
      {items.map((s, i) => (
        <span key={i} style={{ fontSize: 12, fontWeight: 600, background: c.light, color: c.dark, padding: "4px 11px", borderRadius: 14 }}>{s}</span>
      ))}
    </div>
  );
}

export default function ResumeView({ personName, phone, profile, onClose }) {
  const bio = profile.bio || {};
  const experience = [...(profile.experience || [])].sort((a, b) => (b.from || "").localeCompare(a.from || ""));
  const qualifications = [...(profile.qualifications || [])].sort((a, b) => String(b.year || "").localeCompare(String(a.year || "")));
  const publications = [...(profile.publications || [])].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const workshops = [...(profile.workshops || [])].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const conferences = [...(profile.conferences || [])].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const projects = [...(profile.projects || [])].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  return (
    <div style={{ position: "fixed", inset: 0, background: "#525659", zIndex: 300, overflowY: "auto" }}>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #resume-print-root, #resume-print-root * { visibility: visible; }
          #resume-print-root { position: absolute; top: 0; left: 0; width: 100%; box-shadow: none !important; margin: 0 !important; }
          .resume-no-print { display: none !important; }
          @page { size: A4; margin: 0; }
        }
      `}</style>

      {/* ── Toolbar (hidden when printing) ── */}
      <div className="resume-no-print" style={{ position: "sticky", top: 0, zIndex: 10, background: "#1f2937", padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>Resume preview</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => window.print()}
            style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}>
            🖨️ Print / Save as PDF
          </button>
          <button onClick={onClose}
            style={{ background: "rgba(255,255,255,0.15)", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}>
            ✕ Close
          </button>
        </div>
      </div>

      {/* ── The resume page itself ── */}
      <div id="resume-print-root" style={{ background: "#fff", maxWidth: 850, margin: "20px auto 60px", boxShadow: "0 4px 24px rgba(0,0,0,0.35)", fontFamily: "Georgia, 'Times New Roman', serif", color: "#1f2937", display: "flex", minHeight: 1100 }}>

        {/* ── Left sidebar ── */}
        <div style={{ width: "28%", background: "linear-gradient(180deg,#1e3a8a,#2563eb)", color: "#fff", padding: "30px 18px" }}>
          <div style={{
            width: 110, height: 110, borderRadius: 16, margin: "0 auto 16px", overflow: "hidden",
            background: bio.photoURL ? "transparent" : "#334155", border: "3px solid rgba(255,255,255,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, fontWeight: 800,
          }}>
            {bio.photoURL ? <img src={bio.photoURL} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initialsOf(personName)}
          </div>
          <div style={{ textAlign: "center", fontSize: 19, fontWeight: 800 }}>{personName}</div>
          <div style={{ textAlign: "center", fontSize: 13, color: "#93c5fd", marginTop: 4, marginBottom: 18 }}>
            {bio.designation || ""}{bio.department ? " · " + bio.department : ""}
          </div>

          <div style={{ fontSize: 12, fontWeight: 800, color: "#93c5fd", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Contact</div>
          <div style={{ fontSize: 12.5, lineHeight: 2, marginBottom: 18, wordBreak: "break-word" }}>
            {bio.employeeId && <div>🪪 College ID: {bio.employeeId}</div>}
            {bio.email && <div>✉️ {bio.email}</div>}
            {phone && <div>📞 {phone}</div>}
            {bio.orcidId && <div>🆔 ORCID: {bio.orcidId}</div>}
            {bio.scholarLink && <div>🎓 Google Scholar profile</div>}
          </div>

        </div>

        {/* ── Right main column ── */}
        <div style={{ width: "72%", padding: "34px 30px" }}>

          {bio.about && (
            <>
              <SectionHeading c={SC.bio}>Professional Summary</SectionHeading>
              <div style={{ fontSize: 13, lineHeight: 1.7, color: "#374151" }}>{bio.about}</div>
            </>
          )}

          {qualifications.length > 0 && (
            <>
              <SectionHeading c={SC.qualifications}>Education</SectionHeading>
              {qualifications.map((q, i) => (
                <div key={i} style={{ marginBottom: 10 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{q.degree}{q.specialization ? " — " + q.specialization : ""}</div>
                  <div style={{ fontSize: 12.5, color: "#6b7280" }}>{[q.institution, q.university, q.year, q.grade].filter(Boolean).join(" · ")}</div>
                </div>
              ))}
            </>
          )}

          {(bio.technicalSkills || []).length > 0 && (
            <>
              <SectionHeading c={SC.skills}>Core / Technical Skills</SectionHeading>
              <TagRow items={bio.technicalSkills} c={SC.skills} />
            </>
          )}

          {(bio.specializations || []).length > 0 && (
            <>
              <SectionHeading c={SC.interest}>Areas of Interest</SectionHeading>
              <TagRow items={bio.specializations} c={SC.interest} />
            </>
          )}

          {experience.length > 0 && (
            <>
              <SectionHeading c={SC.experience}>Work Experience</SectionHeading>
              {experience.map((e, i) => (
                <div key={i} style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 14 }}>
                    <span>{e.designation} — {e.organization}</span>
                    <span style={{ fontWeight: 600, fontSize: 12, color: "#6b7280" }}>{fmtMY(e.from)} – {e.current ? "Present" : fmtMY(e.to)}</span>
                  </div>
                  {(e.responsibilities || []).length > 0 && (
                    <div style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.7, color: "#374151" }}>
                      {e.responsibilities.map((r, j) => <div key={j}>• {r}</div>)}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}

          {publications.length > 0 && (
            <>
              <SectionHeading c={SC.publications}>Publications / Research</SectionHeading>
              {publications.map((p, i) => (
                <div key={i} style={{ marginBottom: 10 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>{i + 1}. {p.title}</div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    {[p.venue, fmtMY(p.date ? p.date.slice(0, 7) : ""), (p.authors || []).join(", "), p.doi].filter(Boolean).join(" · ")}
                  </div>
                </div>
              ))}
            </>
          )}

          {workshops.length > 0 && (
            <>
              <SectionHeading c={SC.workshops}>Workshops & FDPs</SectionHeading>
              {workshops.map((w, i) => (
                <div key={i} style={{ marginBottom: 8, fontSize: 12.5 }}>
                  <span style={{ fontWeight: 700 }}>{w.title}</span> — {[w.role, w.organizer, fmtMY(w.date ? w.date.slice(0, 7) : "")].filter(Boolean).join(", ")}
                </div>
              ))}
            </>
          )}

          {conferences.length > 0 && (
            <>
              <SectionHeading c={SC.conferences}>Conferences</SectionHeading>
              {conferences.map((c, i) => (
                <div key={i} style={{ marginBottom: 8, fontSize: 12.5 }}>
                  <span style={{ fontWeight: 700 }}>{c.title}</span> — {[c.role, c.venue, fmtMY(c.date ? c.date.slice(0, 7) : "")].filter(Boolean).join(", ")}
                </div>
              ))}
            </>
          )}

          {projects.length > 0 && (
            <>
              <SectionHeading c={SC.projects}>Projects</SectionHeading>
              {projects.map((p, i) => (
                <div key={i} style={{ marginBottom: 8, fontSize: 12.5 }}>
                  <span style={{ fontWeight: 700 }}>{p.title}</span> — {[p.projType, p.agency, p.status, fmtMY(p.date ? p.date.slice(0, 7) : "")].filter(Boolean).join(", ")}
                </div>
              ))}
            </>
          )}

          {experience.length === 0 && qualifications.length === 0 && publications.length === 0 &&
            workshops.length === 0 && conferences.length === 0 && projects.length === 0 && (
            <div style={{ color: "#9ca3af", fontSize: 14, textAlign: "center", marginTop: 60 }}>
              Nothing added yet — fill in Qualifications, Experience, Publications etc. to build your resume.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
