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
import InternalMarksPage from "../marks/InternalMarksPage";
import HomeHub from "../components/HomeHub";
import OriginalSectionsScreen from "../originalSections/OriginalSectionsScreen";
import { UsersScreen } from "../AdminApp";
import { approveUser, rejectUser, makeAdmin, makeFaculty, makeHod, deleteUser, resetPin } from "../userActions";
import { P, TopBar } from "../components/UI";
import TimetablePage from "../timetable/TimetablePage";
import FacultyWorkload from "../timetable/FacultyWorkload";
import { IconAttendance, IconSearch, IconUsers, IconUserCircle, IconMarks, IconCalendar, IconWorkload } from "../components/Icons";

export default function HoDApp({ user, onLogout }) {
  const [tab, setTab] = useState(null); // null = show the home hub
  const [allUsers, setAllUsers] = useState([]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "users"), snap => {
      setAllUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  // Student data is a full-page tool with its own header (which carries its
  // own "Back to Dashboard" button) — no intermediate landing card needed.
  if (tab === "studentData") {
    return <HoDStudentLookup user={user} onBack={() => setTab(null)} />;
  }

  if (!tab) {
    return (
      <HomeHub
        user={user}
        onLogout={onLogout}
        roleLabel="Head of Department"
        greeting={"Welcome, " + user.name}
        onSelect={setTab}
        groups={[
          {
            label: "My own duties",
            tiles: [
              { id: "timetable", title: "My Timetable", desc: "Your weekly class schedule. Edit it any time and download it.", icon: IconCalendar, color: "amber" },
              { id: "profile", title: "My Profile", desc: "Your bio, qualifications, publications and downloadable resume.", icon: IconUserCircle, color: "blue" },
              { id: "myAttendance", title: "My Section Attendance", desc: "Mark and review attendance for the subjects you personally teach.", icon: IconAttendance, color: "teal" },
              { id: "myMarks", title: "My Subject Internal Marks", desc: "Enter marks for the subjects you teach, and any papers assigned to you for valuation.", icon: IconMarks, color: "indigo" },
            ],
          },
          {
            label: "Department oversight",
            tiles: [
              { id: "studentData", title: "Student Data", desc: "Look up any student's SGPA, CGPA, backlogs and attendance trend.", icon: IconSearch, color: "green" },
              { id: "workload", title: "Faculty Workload", desc: "Weekly periods for every faculty member, from their timetables.", icon: IconWorkload, color: "indigo" },
              { id: "allSectionsMarks", title: "All Sections Internal Marks", desc: "Monitor every original section's marks — see who's locked, drafted or not started.", icon: IconMarks, color: "amber" },
              { id: "profiles", title: "Faculty Profiles", desc: "Directory of every faculty member's bio, publications and research.", icon: IconUsers, color: "rose" },
              { id: "users", title: "Users", desc: "Approve registrations, promote faculty, manage the employee ID roster.", icon: IconUsers, color: "slate" },
            ],
          },
        ]}
      />
    );
  }

  if (tab === "allSectionsMarks") {
    return <OriginalSectionsScreen user={user} onBack={() => setTab(null)} />;
  }

  const tabTitle = {
    myAttendance: "My Section Attendance",
    myMarks: "My Subject Internal Marks",
    timetable: "My Timetable",
    workload: "Faculty Workload",
    profiles: "Faculty Profiles",
    users: "Users",
    profile: "My Profile",
  }[tab] || "";

  return (
    <div style={{ background: P.bg, minHeight: "100vh" }}>
      {tab !== "users" && (
        <TopBar title={tabTitle} subtitle={user.name}
          right={<button onClick={() => setTab(null)} style={{ background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 13 }}>← Back</button>} />
      )}

      {tab === "myAttendance" && (
        <FacultyApp user={user} onLogout={onLogout} hideShell initialTab="attendance" />
      )}

      {tab === "myMarks" && (
        <InternalMarksPage user={user} />
      )}

      {tab === "timetable" && <TimetablePage user={user} />}

      {tab === "workload" && <FacultyWorkload />}

      {tab === "profiles" && (
        <div style={{ padding: "24px 24px 80px", maxWidth: "min(1700px, 92vw)", margin: "0 auto" }}>
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
          onBack={() => setTab(null)}
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
