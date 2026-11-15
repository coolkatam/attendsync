
import HoDApp from "./hod/HoDApp";
import { useState, useEffect } from "react";
import { db, auth } from "./firebase";
import { doc, getDoc } from "firebase/firestore";
import LandingLogin from "./login/LandingLogin";
import DetailsPage from "./login/DetailsPage";
import AdminApp from "./AdminApp";
import FacultyApp from "./FacultyApp";

const P = {
  blue:"#1a56a0", blueL:"#dbeafe",
  teal:"#0e7490", tealL:"#cffafe",
  green:"#166534", greenL:"#dcfce7",
  red:"#b91c1c", redL:"#fee2e2",
  amber:"#92400e", amberL:"#fef3c7",
  gray:"#6b7280", border:"#e5e7eb",
  bg:"#f8fafc", white:"#ffffff",
};

function Spinner() {
  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
      <div style={{
        width: 40, height: 40, border: "3px solid " + P.blueL,
        borderTop: "3px solid " + P.blue, borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Root App ───────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    function goOnline() { setIsOffline(false); }
    function goOffline() { setIsOffline(true); }
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  useEffect(() => {
    // Check if user was previously logged in (stored in localStorage)
    const saved = localStorage.getItem("attendsync_user");
    if (saved) {
      try {
        const u = JSON.parse(saved);
        // Verify still approved. If offline and not cached, getDoc may hang;
        // fall back to the cached basic info so the app still opens.
        getDoc(doc(db, "users", u.phone))
          .then(snap => {
            if (snap.exists() && snap.data().status === "approved") {
              setUser({ ...snap.data(), phone: u.phone });
            } else if (!snap.exists()) {
              localStorage.removeItem("attendsync_user");
            }
            setLoading(false);
          })
          .catch(() => {
            // Offline with nothing cached for this user yet — can't verify, so log out safely.
            setLoading(false);
          });
      } catch {
        setLoading(false);
      }
    } else {
      setLoading(false);
    }
  }, []);

  function handleLogin(userData) {
    localStorage.setItem("attendsync_user", JSON.stringify({ phone: userData.phone }));
    setUser(userData);
  }

  function handleLogout() {
    localStorage.removeItem("attendsync_user");
    auth.signOut().catch(() => {});
    setUser(null);
  }

  if (loading) return <Spinner />;

  const offlineBanner = isOffline ? (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 1000,
      background: "#92400e", color: "#fff", textAlign: "center",
      fontSize: 13, fontWeight: 600, padding: "6px 10px",
    }}>
      📡 You're offline — changes will be saved and synced automatically once you're back online.
    </div>
  ) : null;
  const contentStyle = isOffline ? { paddingTop: 34 } : undefined;

  if (!user) {
    return (
      <>
        {offlineBanner}
        <div style={contentStyle}><LandingLogin onLogin={handleLogin} /></div>
      </>
    );
  }

  if (user.detailsDone === false) {
    return <DetailsPage user={user} onDone={u => setUser(u)} onLogout={handleLogout} />;
  }

  return (
    <>
      {offlineBanner}
      <div style={contentStyle}>
        {user.role === "admin"
  ? <AdminApp user={user} onLogout={handleLogout} />
  : user.role === "hod"
  ? <HoDApp user={user} onLogout={handleLogout} />
  : <FacultyApp user={user} onLogout={handleLogout} />}
      </div>
    </>
  );
}
