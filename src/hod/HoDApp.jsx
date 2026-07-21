// src/hod/HoDApp.jsx
// HoD dashboard — professional shell with centered pill tabs:
//   📋 My section attendance — the HoD's own teaching subjects (mark + report)
//   🔍 Student data          — roll-number lookup, CGPA, attendance summary
//   🧑‍🏫 Faculty profiles      — directory of all faculty + department research
//   👤 My profile            — the HoD's own faculty profile

import React, { useState, useEffect } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import FacultyApp from "../FacultyApp";
import HoDStudentLookup from "./HoDStudentLookup";
import FacultyProfilePage from "../profile/FacultyProfilePage";
import FacultyProfilesDirectory from "../profile/FacultyProfilesDirectory";
import HomeShell from "../components/HomeShell";
import { UsersScreen } from "../AdminApp";
import { approveUser, rejectUser, makeAdmin, makeFaculty, makeHod, deleteUser, resetPin } from "../userActions";
import { P } from "../components/UI";

export default function HoDApp({ user, onLogout }) {
  const [tab, setTab] = useState("studentData");
  const [allUsers, setAllUsers] = useState([]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "users"), snap => {
      setAllUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  // Student data is a full-page tool with its own header — show it standalone
  // with a floating button back to the dashboard.
  if (tab === "studentDataFull") {
    return (
      <div style={{ position: "relative" }}>
        <HoDStudentLookup user={user} onLogout={onLogout} />
        <button onClick={() => setTab("studentData")}
          style={{ position: "fixed", bottom: 20, right: 20, zIndex: 1000, background: "#2E1065", color: "#fff", border: "none", borderRadius: 30, padding: "13px 22px", fontSize: 14, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 14px rgba(0,0,0,0.3)", fontFamily: "inherit" }}>
          ← Back to dashboard
        </button>
      </div>
    );
  }

  return (
    <div style={{ background: P.bg, minHeight: "100vh" }}>
      <HomeShell
        user={user}
        onLogout={onLogout}
        theme="hod"
        roleLabel="Head of Department"
        tabs={[
          { id: "myAttendance", label: "My section attendance", icon: "📋", color: "purple" },
          { id: "studentData", label: "Student data", icon: "🔍", color: "green" },
          { id: "profiles", label: "Faculty profiles", icon: "🧑‍🏫", color: "coral" },
          { id: "users", label: "Users", icon: "👥", color: "slate" },
          { id: "profile", label: "My profile", icon: "👤", color: "pink" },
        ]}
        active={tab}
        onSelect={setTab}
      />

      {tab === "myAttendance" && (
        <FacultyApp user={user} onLogout={onLogout} hideShell initialTab="attendance" />
      )}

      {tab === "studentData" && (
        <div style={{ padding: "24px 16px 80px", maxWidth: 700, margin: "0 auto", textAlign: "center" }}>
          <div style={{ background: "#fff", border: "1.5px solid " + P.border, borderRadius: 16, padding: 30 }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>🔍</div>
            <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 6 }}>Student data lookup</div>
            <div style={{ fontSize: 14, color: P.gray, marginBottom: 18, lineHeight: 1.6 }}>
              Search any student by roll number — semester-wise SGPA, credit-weighted CGPA,
              backlogs, attendance trends and mentor comments.
            </div>
            <button onClick={() => setTab("studentDataFull")}
              style={{ background: "#15803d", color: "#fff", border: "none", borderRadius: 12, padding: "14px 28px", fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>
              Open student lookup →
            </button>
          </div>
        </div>
      )}

      {tab === "profiles" && (
        <div style={{ padding: "20px 16px 80px", maxWidth: 1100, margin: "0 auto" }}>
          <FacultyProfilesDirectory user={user} />
        </div>
      )}

      {tab === "users" && (
        <UsersScreen
          allUsers={allUsers}
          currentUser={user}
          isMaster={false}
          onApprove={approveUser}
          onReject={rejectUser}
          onMakeAdmin={makeAdmin}
          onMakeFaculty={makeFaculty}
          onMakeHod={makeHod}
          onDelete={deleteUser}
          onResetPin={resetPin}
          onBack={() => setTab("studentData")}
        />
      )}

      {tab === "profile" && (
        <div style={{ padding: "20px 16px 80px", maxWidth: 900, margin: "0 auto" }}>
          <FacultyProfilePage user={user} />
        </div>
      )}
    </div>
  );
}
