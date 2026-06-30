import HoDStudentLookup from "./hod/HoDStudentLookup";
import { useState, useEffect } from "react";
import { db } from "./firebase";
import {
  doc, getDoc, setDoc, onSnapshot,
  collection, getDocs, updateDoc
} from "firebase/firestore";
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

function Btn({ children, onClick, variant, small, full, disabled, style }) {
  const v = variant || "primary";
  const vs = {
    primary: { background: P.blue, color: "#fff", border: "none" },
    accent:  { background: P.teal, color: "#fff", border: "none" },
    success: { background: P.green, color: "#fff", border: "none" },
    outline: { background: "transparent", color: P.blue, border: "1.5px solid " + P.blue },
    ghost:   { background: P.border, color: P.gray, border: "none" },
  };
  return (
    <button
      onClick={disabled ? undefined : onClick}
      style={{
        borderRadius: 8, cursor: disabled ? "not-allowed" : "pointer",
        fontFamily: "inherit", fontWeight: 500,
        fontSize: small ? 13 : 14,
        padding: small ? "7px 14px" : "11px 20px",
        width: full ? "100%" : undefined,
        opacity: disabled ? 0.5 : 1,
        display: "inline-block",
        ...(vs[v] || vs.primary), ...(style || {}),
      }}
    >{children}</button>
  );
}

function Fld({ label, value, onChange, placeholder, type }) {
  return (
    <div style={{ marginBottom: 14 }}>
      {label && <div style={{ fontSize: 12, color: P.gray, marginBottom: 4, fontWeight: 600 }}>{label}</div>}
      <input
        type={type || "text"} value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%", boxSizing: "border-box",
          border: "1px solid " + P.border, borderRadius: 8,
          padding: "10px 12px", fontSize: 14,
          fontFamily: "inherit", background: "#fff", color: "#111", outline: "none",
        }}
      />
    </div>
  );
}

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

// ── Login / Registration screen ───────────────────────────
function LoginScreen({ onLogin }) {
  const [phone, setPhone]   = useState("");
  const [step, setStep]     = useState("phone"); // phone | register | pending | rejected | setup-pin | enter-pin
  const [userData, setUserData] = useState(null);
  const [form, setForm]     = useState({ name: "", designation: "", branch: "", subjects: "" });
  const [pin, setPin]       = useState("");
  const [pin2, setPin2]     = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr]       = useState("");

  // If opened via an admin's invite link (?admin=<phone>), tag new registrations to that admin.
  const invitedBy = new URLSearchParams(window.location.search).get("admin") || "";

  async function checkPhone() {
    if (phone.length < 10) { setErr("Enter a valid 10-digit number"); return; }
    setLoading(true); setErr("");
    try {
      const snap = await getDoc(doc(db, "users", phone));
      if (snap.exists()) {
        const data = snap.data();
        if (data.status === "approved") {
          setUserData(data);
          if (data.pin) {
            setStep("enter-pin");
          } else {
            setStep("setup-pin");
          }
        } else if (data.status === "pending") {
          setStep("pending");
        } else if (data.status === "rejected") {
          setStep("rejected");
        }
      } else {
        setStep("register");
      }
    } catch (e) {
      setErr("Error: " + e.message);
    }
    setLoading(false);
  }

  async function submitRegistration() {
    if (!form.name.trim()) { setErr("Name is required"); return; }
    if (!form.designation.trim()) { setErr("Designation is required"); return; }
    setLoading(true); setErr("");
    try {
      await setDoc(doc(db, "users", phone), {
        name: form.name.trim(),
        designation: form.designation.trim(),
        branch: form.branch.trim(),
        subjects: form.subjects.trim(),
        phone,
        role: "faculty",
        status: "pending",
        invitedBy,
        registeredAt: new Date().toISOString(),
      });
      setStep("pending");
    } catch (e) {
      setErr("Error: " + e.message);
    }
    setLoading(false);
  }

  async function createPin() {
    if (!/^\d{4}$/.test(pin)) { setErr("PIN must be exactly 4 digits"); return; }
    if (pin !== pin2) { setErr("PINs don't match"); return; }
    setLoading(true); setErr("");
    try {
      await updateDoc(doc(db, "users", phone), { pin });
      onLogin({ phone, ...userData, pin });
    } catch (e) {
      setErr("Error: " + e.message);
    }
    setLoading(false);
  }

  function submitPin() {
    if (!/^\d{4}$/.test(pin)) { setErr("Enter your 4-digit PIN"); return; }
    if (pin !== userData.pin) { setErr("Incorrect PIN"); setPin(""); return; }
    onLogin({ phone, ...userData });
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg,#1a56a0,#0e7490)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <div style={{
        background: "#fff", borderRadius: 16, padding: "2rem 1.5rem",
        width: "100%", maxWidth: 400, boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
      }}>
        <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
          <img src="/logo192.png" alt="AttendLog" style={{
            width: 64, height: 64, borderRadius: 16,
            margin: "0 auto 12px", display: "block",
          }} />
          <div style={{ fontSize: 24, fontWeight: 700, color: P.blue }}>AttendSync</div>
          <div style={{ fontSize: 13, color: P.gray, marginTop: 4 }}>Section Attendance Platform</div>
        </div>

        {/* Step 1: Enter phone */}
        {step === "phone" && (
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Enter your mobile number</div>
            <Fld label="Mobile number" value={phone} onChange={setPhone} placeholder="10-digit number" type="tel" />
            {err && <div style={{ color: P.red, fontSize: 13, marginBottom: 10 }}>{err}</div>}
            <Btn full onClick={checkPhone} disabled={loading}>{loading ? "Checking…" : "Continue"}</Btn>
            <div style={{ marginTop: 16, background: P.bg, borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: P.gray, marginBottom: 4 }}>ADMIN LOGIN</div>
              <div style={{ fontSize: 12, color: P.gray }}>Admins are pre-registered. Enter your admin mobile number above.</div>
            </div>
          </div>
        )}

        {/* Step 2: Register */}
        {step === "register" && (
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>New registration</div>
            <div style={{ fontSize: 13, color: P.gray, marginBottom: 16 }}>
              Mobile: <strong>+91 {phone}</strong>{" "}
              <span style={{ color: P.blue, cursor: "pointer" }} onClick={() => { setStep("phone"); setErr(""); }}>change</span>
            </div>
            <Fld label="Full name *" value={form.name} onChange={v => setForm(f => ({...f, name: v}))} placeholder="Your full name" />
            <Fld label="Designation *" value={form.designation} onChange={v => setForm(f => ({...f, designation: v}))} placeholder="e.g. Assistant Professor" />
            <Fld label="Department / Branch" value={form.branch} onChange={v => setForm(f => ({...f, branch: v}))} placeholder="e.g. Mechanical Engineering" />
            <Fld label="Subjects you handle" value={form.subjects} onChange={v => setForm(f => ({...f, subjects: v}))} placeholder="e.g. Thermodynamics, Fluid Mechanics" />
            {invitedBy && (
              <div style={{ fontSize: 12, color: P.green, background: P.greenL, borderRadius: 8, padding: "8px 10px", marginBottom: 14 }}>
                ✓ Joining via your admin's invite link
              </div>
            )}
            {err && <div style={{ color: P.red, fontSize: 13, marginBottom: 10 }}>{err}</div>}
            <Btn full onClick={submitRegistration} disabled={loading}>{loading ? "Submitting…" : "Submit for approval"}</Btn>
          </div>
        )}

        {/* Step 3: Pending */}
        {step === "pending" && (
          <div style={{ textAlign: "center", padding: "1rem 0" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Registration submitted!</div>
            <div style={{ fontSize: 13, color: P.gray, marginBottom: 20, lineHeight: 1.6 }}>
              Your request is pending admin approval.<br />
              Please check back after your admin has approved your account.
            </div>
            <Btn variant="outline" onClick={checkPhone}>Check status</Btn>
            <div style={{ marginTop: 10 }}>
              <span style={{ fontSize: 12, color: P.gray, cursor: "pointer" }} onClick={() => setStep("phone")}>← Back</span>
            </div>
          </div>
        )}

        {/* Rejected */}
        {step === "rejected" && (
          <div style={{ textAlign: "center", padding: "1rem 0" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>❌</div>
            <div style={{ fontWeight: 700, fontSize: 16, color: P.red, marginBottom: 8 }}>Registration rejected</div>
            <div style={{ fontSize: 13, color: P.gray, marginBottom: 20 }}>
              Your registration was not approved. Please contact your admin.
            </div>
            <span style={{ fontSize: 12, color: P.blue, cursor: "pointer" }} onClick={() => setStep("phone")}>← Back</span>
          </div>
        )}

        {/* Step: First-time PIN setup (after admin approval) */}
        {step === "setup-pin" && (
          <div>
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
              <div style={{ fontWeight: 700, fontSize: 16, color: P.green }}>Verified!</div>
              <div style={{ fontSize: 13, color: P.gray, marginTop: 4 }}>
                Create a 4-digit PIN to protect your account. You'll use this PIN to log in next time.
              </div>
            </div>
            <Fld label="Create 4-digit PIN" value={pin} onChange={v => setPin(v.replace(/\D/g, "").slice(0, 4))} placeholder="••••" type="password" />
            <Fld label="Confirm PIN" value={pin2} onChange={v => setPin2(v.replace(/\D/g, "").slice(0, 4))} placeholder="••••" type="password" />
            {err && <div style={{ color: P.red, fontSize: 13, marginBottom: 10 }}>{err}</div>}
            <Btn full onClick={createPin} disabled={loading}>{loading ? "Saving…" : "Set PIN & continue"}</Btn>
            <div style={{ marginTop: 10, textAlign: "center" }}>
              <span style={{ fontSize: 12, color: P.gray, cursor: "pointer" }} onClick={() => { setStep("phone"); setPin(""); setPin2(""); setErr(""); }}>← Back</span>
            </div>
          </div>
        )}

        {/* Step: Enter existing PIN */}
        {step === "enter-pin" && (
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Enter your PIN</div>
            <div style={{ fontSize: 13, color: P.gray, marginBottom: 16 }}>
              Welcome back, <strong>{userData?.name}</strong>{" "}
              <span style={{ color: P.blue, cursor: "pointer" }} onClick={() => { setStep("phone"); setPin(""); setErr(""); }}>change number</span>
            </div>
            <Fld label="4-digit PIN" value={pin} onChange={v => setPin(v.replace(/\D/g, "").slice(0, 4))} placeholder="••••" type="password" />
            {err && <div style={{ color: P.red, fontSize: 13, marginBottom: 10 }}>{err}</div>}
            <Btn full onClick={submitPin} disabled={loading}>Login</Btn>
            <div style={{ marginTop: 12, fontSize: 12, color: P.gray, textAlign: "center" }}>
              Forgot your PIN? Ask your admin to reset it.
            </div>
          </div>
        )}
      </div>
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
              setUser({ phone: u.phone, ...snap.data() });
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
        <div style={contentStyle}><LoginScreen onLogin={handleLogin} /></div>
      </>
    );
  }

  return (
    <>
      {offlineBanner}
      <div style={contentStyle}>
        {user.role === "admin"
  ? <AdminApp user={user} onLogout={handleLogout} />
  : user.role === "hod"
  ? <HoDStudentLookup user={user} onLogout={handleLogout} />
  : <FacultyApp user={user} onLogout={handleLogout} />}
      </div>
    </>
  );
}