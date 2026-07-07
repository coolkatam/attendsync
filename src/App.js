
import HoDStudentLookup from "./hod/HoDStudentLookup";
import HoDApp from "./hod/HoDApp";
import { useState, useEffect } from "react";
import { db } from "./firebase";
import {
  doc, getDoc, setDoc, onSnapshot,
  collection, getDocs, updateDoc
} from "firebase/firestore";
import AdminApp from "./AdminApp";
import FacultyApp from "./FacultyApp";
import { MASTER_ADMIN_PHONE } from "./utils";

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
// Door definitions: which door allows which role(s)
const DOORS = {
  hod:     { label: "HoD",                icon: "👑", roles: ["hod"],     color: "#7c3aed", colorL: "#ede9fe", desc: "Head of Department" },
  admin:   { label: "Class Coordinators", icon: "🧭", roles: ["admin"],   color: "#0e7490", colorL: "#cffafe", desc: "Section admins & year coordinators" },
  faculty: { label: "Subject Faculty",    icon: "📘", roles: ["faculty"], color: "#166534", colorL: "#dcfce7", desc: "Attendance, marks & mentoring" },
  master:  { label: "Master Admin",       icon: "⭐", roles: ["admin"],   color: "#92400e", colorL: "#fef3c7", desc: "" },
};

// Small CSS-only rotating gear
function Gear({ size, x, y, duration, reverse, opacity, color }) {
  return (
    <div style={{
      position: "absolute", left: x, top: y, width: size, height: size,
      opacity: opacity || 0.14, pointerEvents: "none",
      animation: `gearspin ${duration}s linear infinite ${reverse ? "reverse" : ""}`,
    }}>
      <svg viewBox="0 0 100 100" width="100%" height="100%">
        <g fill={color || "#ffffff"}>
          {[0,45,90,135,180,225,270,315].map(a => (
            <rect key={a} x="46" y="2" width="8" height="18" rx="2" transform={`rotate(${a} 50 50)`} />
          ))}
          <circle cx="50" cy="50" r="30" />
          <circle cx="50" cy="50" r="12" fill="#0f2436" />
        </g>
      </svg>
    </div>
  );
}

function LoginScreen({ onLogin }) {
  const [door, setDoor]     = useState(null); // null = landing | "hod" | "admin" | "faculty" | "master"
  const [phone, setPhone]   = useState("");
  const [step, setStep]     = useState("phone"); // phone | register | pending | rejected | setup-pin | enter-pin
  const [userData, setUserData] = useState(null);
  const [form, setForm]     = useState({ name: "", designation: "", branch: "", subjects: "" });
  const [pin, setPin]       = useState("");
  const [pin2, setPin2]     = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr]       = useState("");

  // If opened via an admin's invite link (?admin=<phone>), tag new registrations to that admin.
  const invitedBy = (new URLSearchParams(window.location.search).get("admin") || "").replace(/\D/g, "");

  // Invite links go straight to the faculty door
  useEffect(() => {
    if (invitedBy && !door) setDoor("faculty");
  }, [invitedBy]);

  // Make the browser Back button navigate WITHIN the app (door -> landing) instead
  // of leaving the site entirely. We push a history entry whenever a door is opened,
  // and popping it just returns to the landing page.
  useEffect(() => {
    function onPopState() {
      setDoor(null);
      setStep("phone"); setPhone(""); setPin(""); setPin2(""); setErr(""); setUserData(null);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function openDoor(k) {
    window.history.pushState({ door: k }, "");
    setDoor(k); setErr("");
  }

  function resetAll() {
    window.history.back();
  }

  // Validate the found user's role against the chosen door
  function roleAllowed(data) {
    if (door === "master") return phone === MASTER_ADMIN_PHONE;
    if (door === "hod")    return data.role === "hod";
    if (door === "admin")  return data.role === "admin";
    if (door === "faculty") return data.role === "faculty" || !data.role;
    return false;
  }

  function doorErrorMsg(data) {
    if (door === "master") return "This login is only for the Master Admin.";
    if (door === "hod") return "You are not registered as HoD. Please use the correct login (Class Coordinators or Subject Faculty).";
    if (door === "admin") return data.role === "hod"
      ? "You are the HoD — please use the HoD login."
      : "You are not a Class Coordinator. Please use the Subject Faculty login.";
    return data.role === "admin"
      ? "You are a Class Coordinator — please use the Class Coordinators login."
      : "You are the HoD — please use the HoD login.";
  }

  async function checkPhone() {
    if (phone.length < 10) { setErr("Enter a valid 10-digit number"); return; }
    setLoading(true); setErr("");
    try {
      const snap = await getDoc(doc(db, "users", phone));
      if (snap.exists()) {
        const data = snap.data();
        if (data.status === "approved") {
          if (!roleAllowed(data)) {
            setErr(doorErrorMsg(data));
            setLoading(false);
            return;
          }
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
        if (door === "faculty") {
          setStep("register");
        } else {
          setErr("Number not found. New registrations are only through the Subject Faculty login (via your coordinator's invite link).");
        }
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

  // ── LANDING PAGE (no door chosen yet) ──────────────────────
  if (!door) {
    return (
      <div style={{
        minHeight: "100vh", position: "relative", overflow: "hidden",
        background: "linear-gradient(135deg,#1e2a3a 0%,#1f4e5f 30%,#2b6777 55%,#3d7a5c 78%,#c2680e 100%)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 16,
      }}>
        <style>{`
          @keyframes gearspin { to { transform: rotate(360deg); } }
          @keyframes gearspinRev { to { transform: rotate(-360deg); } }
        `}</style>

        {/* Blueprint grid overlay for engineering feel */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none", opacity: 0.08,
          backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }} />
        {/* Warm radial glow accents */}
        <div style={{ position: "absolute", top: "-10%", right: "-8%", width: 420, height: 420, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,176,59,0.35), transparent 70%)", pointerEvents: "none" }} />
        <div style={{ position: "absolute", bottom: "-15%", left: "-10%", width: 480, height: 480, borderRadius: "50%", background: "radial-gradient(circle, rgba(45,212,191,0.25), transparent 70%)", pointerEvents: "none" }} />

        {/* Decorative colorful gears */}
        <Gear size={190} x="-60px" y="-50px" duration={38} color="#ffb03b" opacity={0.22} />
        <Gear size={110} x="110px" y="70px" duration={26} reverse color="#2dd4bf" opacity={0.20} />
        <Gear size={230} x="calc(100% - 150px)" y="calc(100% - 170px)" duration={44} color="#ffb03b" opacity={0.20} />
        <Gear size={120} x="calc(100% - 240px)" y="calc(100% - 60px)" duration={30} reverse color="#f97316" opacity={0.22} />
        <Gear size={90}  x="calc(100% - 120px)" y="60px" duration={22} color="#2dd4bf" opacity={0.16} />
        <Gear size={70}  x="40px" y="calc(100% - 120px)" duration={18} reverse color="#f97316" opacity={0.16} />

        {/* Master admin subtle corner link */}
        <button onClick={() => openDoor("master")}
          style={{
            position: "absolute", top: 14, right: 18, zIndex: 10,
            background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.65)",
            border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8,
            padding: "5px 12px", fontSize: 11, cursor: "pointer", fontFamily: "inherit",
          }}>
          ⭐ Master Admin
        </button>

        {/* Title */}
        <div style={{ textAlign: "center", marginBottom: 36, zIndex: 5 }}>
          <img src="/logo192.png" alt="AttendSync" style={{ width: 68, height: 68, borderRadius: 16, margin: "0 auto 14px", display: "block", boxShadow: "0 4px 20px rgba(0,0,0,0.4)" }} />
          <div style={{ fontSize: 32, fontWeight: 800, color: "#fff", letterSpacing: 0.5, textShadow: "0 2px 12px rgba(0,0,0,0.35)" }}>AttendSync</div>
          <div style={{ fontSize: 13, color: "#ffd9a0", marginTop: 6, letterSpacing: 2, textTransform: "uppercase", fontWeight: 600 }}>
            Department of Mechanical Engineering
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 4 }}>
            Attendance · Internal Marks · Student Records · Mentoring
          </div>
        </div>

        {/* Three doors */}
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", justifyContent: "center", zIndex: 5, maxWidth: 900 }}>
          {["hod", "admin", "faculty"].map(k => {
            const d = DOORS[k];
            return (
              <div key={k} onClick={() => openDoor(k)}
                style={{
                  background: "rgba(255,255,255,0.98)", borderRadius: 16, padding: "26px 22px",
                  width: 220, cursor: "pointer", textAlign: "center",
                  boxShadow: "0 10px 34px rgba(0,0,0,0.35)",
                  borderTop: `5px solid ${d.color}`,
                  transition: "transform .15s",
                }}
                onMouseEnter={e => e.currentTarget.style.transform = "translateY(-4px)"}
                onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}
              >
                <div style={{
                  width: 58, height: 58, borderRadius: "50%", background: d.colorL,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 26, margin: "0 auto 12px",
                }}>{d.icon}</div>
                <div style={{ fontWeight: 700, fontSize: 16, color: "#1e293b", marginBottom: 4 }}>{d.label}</div>
                <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.4 }}>{d.desc}</div>
                <div style={{
                  marginTop: 14, fontSize: 13, fontWeight: 600, color: d.color,
                  border: `1.5px solid ${d.color}`, borderRadius: 8, padding: "7px 0",
                }}>Login →</div>
              </div>
            );
          })}
        </div>

        <div style={{ position: "absolute", bottom: 14, fontSize: 11, color: "rgba(255,255,255,0.55)", zIndex: 5 }}>
          Raghu Engineering College · Mechanical Engineering
        </div>
      </div>
    );
  }

  // ── LOGIN FLOW (door chosen) ───────────────────────────────
  const d = DOORS[door];
  return (
    <div style={{
      minHeight: "100vh", position: "relative", overflow: "hidden",
      background: "linear-gradient(135deg,#1e2a3a 0%,#1f4e5f 30%,#2b6777 55%,#3d7a5c 78%,#c2680e 100%)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <style>{`@keyframes gearspin { to { transform: rotate(360deg); } }`}</style>
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none", opacity: 0.08,
        backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
        backgroundSize: "44px 44px",
      }} />
      <Gear size={190} x="-60px" y="-50px" duration={38} color="#ffb03b" opacity={0.2} />
      <Gear size={230} x="calc(100% - 150px)" y="calc(100% - 170px)" duration={44} color="#2dd4bf" opacity={0.18} />

      <div style={{
        background: "#fff", borderRadius: 16, padding: "2rem 1.5rem",
        width: "100%", maxWidth: 400, boxShadow: "0 8px 32px rgba(0,0,0,0.3)", zIndex: 5,
        borderTop: `5px solid ${d.color}`,
      }}>
        <div style={{ textAlign: "center", marginBottom: "1.2rem" }}>
          <div style={{
            width: 52, height: 52, borderRadius: "50%", background: d.colorL,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 24, margin: "0 auto 10px",
          }}>{d.icon}</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#1e293b" }}>{d.label} Login</div>
          <div style={{ fontSize: 12, color: P.gray, marginTop: 2, cursor: "pointer", textDecoration: "underline" }} onClick={resetAll}>
            ← Choose a different login
          </div>
        </div>

        {/* Step 1: Enter phone */}
        {step === "phone" && (
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Enter your mobile number</div>
            <Fld label="Mobile number" value={phone} onChange={v => setPhone(v.replace(/\D/g, ""))} placeholder="10-digit number" type="tel" />
            {err && <div style={{ color: P.red, fontSize: 13, marginBottom: 10 }}>{err}</div>}
            <Btn full onClick={checkPhone} disabled={loading} style={{ background: d.color }}>{loading ? "Checking…" : "Continue"}</Btn>
            {door === "faculty" && !invitedBy && (
              <div style={{ marginTop: 16, background: P.bg, borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ fontSize: 12, color: P.gray }}>New faculty? Use the invite link shared by your class coordinator to register.</div>
              </div>
            )}
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
  ? <HoDApp user={user} onLogout={handleLogout} />
  : <FacultyApp user={user} onLogout={handleLogout} />}
      </div>
    </>
  );
}
