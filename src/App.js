
import HoDStudentLookup from "./hod/HoDStudentLookup";
import HoDApp from "./hod/HoDApp";
import { useState, useEffect } from "react";
import { db, auth, functions } from "./firebase";
import { httpsCallable } from "firebase/functions";
import { signInWithCustomToken, signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import {
  doc, getDoc, setDoc, onSnapshot,
  collection, getDocs, updateDoc
} from "firebase/firestore";
import AdminApp from "./AdminApp";
import FacultyApp from "./FacultyApp";
import { MASTER_ADMIN_PHONE, normEmail, isCollegeEmail, COLLEGE_DOMAIN } from "./utils";

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
  hod:     { label: "HoD",                icon: "👑", roles: ["hod"],     color: "#a8681c", colorL: "#f9edd8", desc: "Head of Department" },
  admin:   { label: "Class Coordinators", icon: "🧭", roles: ["admin"],   color: "#1a6e8a", colorL: "#dcf1f7", desc: "Section admins & year coordinators" },
  faculty: { label: "Subject Faculty",    icon: "📘", roles: ["faculty"], color: "#3f7264", colorL: "#e2efea", desc: "Attendance, marks & mentoring" },
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
  // college-email sign-in
  const [ident, setIdent]     = useState("");          // what was typed: a mobile number or a college email
  const [emailInfo, setEmailInfo] = useState(null);    // the person's record, from checkEmail
  const [pw, setPw]           = useState("");
  const [notice, setNotice]   = useState("");
  const emailMode = door !== "master" && /[a-zA-Z@]/.test(ident);
  const email = normEmail(ident);

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
      setIdent(""); setEmailInfo(null); setPw(""); setNotice("");
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
      // Phone lookup now happens server-side (Cloud Function) because
      // Firestore security rules block reads before login. The function
      // returns safe fields only — never the PIN itself.
      const checkPhoneFn = httpsCallable(functions, "checkPhone");
      const res = await checkPhoneFn({ phone });
      const data = res.data;
      if (data.exists) {
        if (data.status === "approved") {
          if (!roleAllowed(data)) {
            setErr(doorErrorMsg(data));
            setLoading(false);
            return;
          }
          setUserData(data);
          if (data.hasPin) {
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
        setErr("Number not found. New faculty: enter your college email (name@" + COLLEGE_DOMAIN + ") instead, in the Subject Faculty login.");
      }
    } catch (e) {
      setErr("Error: " + e.message);
    }
    setLoading(false);
  }

  async function checkEmailAddr() {
    if (!isCollegeEmail(email)) { setErr("Enter your college email, like name@" + COLLEGE_DOMAIN); return; }
    setLoading(true); setErr(""); setNotice("");
    try {
      const res = await httpsCallable(functions, "checkEmail")({ email });
      const data = res.data;
      if (!data.exists) {
        if (door === "faculty") setStep("email-register");
        else setErr("This email is not registered. New faculty register through the Subject Faculty login.");
      } else if (data.status === "approved") {
        if (!roleAllowed(data)) { setErr(doorErrorMsg(data)); setLoading(false); return; }
        setEmailInfo(data); setPw(""); setStep("email-pass");
        if (!data.pwSet) await sendLink(true);        // first time: send the set-password link straight away
      } else if (data.status === "pending") setStep("pending");
      else if (data.status === "rejected") setStep("rejected");
    } catch (e) { setErr(e.message || "Something went wrong."); }
    setLoading(false);
  }

  async function sendLink(first) {
    setErr(""); setNotice("");
    try {
      await sendPasswordResetEmail(auth, email);
      setNotice((first ? "This is your first sign-in. " : "") + "We have emailed a link to " + email + ". Its subject reads \"Reset your password for attendsync-66e55\": that is the right mail. Open it to " + (first ? "set" : "set or reset") + " your password, then come back here and sign in. If you do not see it, check Spam or Junk.");
    } catch (e) {
      setErr(e.code === "auth/operation-not-allowed" ? "Email sign-in has not been switched on yet. Please tell the administrator." : e.code === "auth/too-many-requests" ? "Too many mails were requested just now. Please try again in a little while." : "Could not send the email (" + (e.code || e.message) + ").");
    }
  }

  async function submitEmailPassword() {
    if (!pw) { setErr("Enter your password"); return; }
    setLoading(true); setErr("");
    try {
      const cred = await signInWithEmailAndPassword(auth, email, pw);
      if (cred.user.uid !== emailInfo.id) { await auth.signOut(); throw new Error("mismatch"); }
      updateDoc(doc(db, "users", emailInfo.id), { pwSet: true }).catch(() => {});
      const { id, exists, hasPin, ...rest } = emailInfo;
      onLogin({ ...rest, phone: id, pwSet: true });
    } catch (e) {
      setErr(e.code === "auth/invalid-credential" || e.code === "auth/wrong-password" || e.code === "auth/user-not-found"
        ? "Incorrect password. If you have not set one yet, or forgot it, use 'Email me a link'."
        : e.code === "auth/operation-not-allowed" ? "Email sign-in has not been switched on yet. Please tell the administrator."
        : e.code === "auth/too-many-requests" ? "Too many attempts. Please wait a few minutes, or use 'Email me a link'."
        : "Could not sign in. Please try again.");
      setPw("");
    }
    setLoading(false);
  }

  async function submitEmailRegistration() {
    if (!form.name.trim()) { setErr("Name is required"); return; }
    if (!form.designation.trim()) { setErr("Designation is required"); return; }
    if (!(form.employeeId || "").trim()) { setErr("Employee ID is required"); return; }
    setLoading(true); setErr("");
    try {
      await httpsCallable(functions, "requestEmailAccess")({ email, name: form.name, designation: form.designation, branch: form.branch, employeeId: form.employeeId });
      setStep("pending");
    } catch (e) { setErr(e.message || "Something went wrong."); }
    setLoading(false);
  }

  const recheck = () => (emailMode ? checkEmailAddr() : checkPhone());

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

  // Calls the verifyLogin Cloud Function (checks phone+PIN server-side) and,
  // if valid, signs into a real Firebase Auth session using the token it returns.
  // This is invisible to the person logging in — same screen, same PIN, same button.
  async function verifyLoginAndSignIn(phoneToCheck, pinToCheck) {
    const verifyLogin = httpsCallable(functions, "verifyLogin");
    const result = await verifyLogin({ phone: phoneToCheck, pin: pinToCheck });
    await signInWithCustomToken(auth, result.data.token);
  }

  async function createPin() {
    if (!/^\d{4}$/.test(pin)) { setErr("PIN must be exactly 4 digits"); return; }
    if (pin !== pin2) { setErr("PINs don't match"); return; }
    setLoading(true); setErr("");
    try {
      // the PIN is kept on the server, out of reach of every browser
      const res = await httpsCallable(functions, "setPin")({ phone, pin });
      await signInWithCustomToken(auth, res.data.token);
      onLogin({ ...userData, phone, hasPin: true });
    } catch (e) {
      setErr("Error: " + e.message);
    }
    setLoading(false);
  }

  async function submitPin() {
    if (!/^\d{4}$/.test(pin)) { setErr("Enter your 4-digit PIN"); return; }
    setLoading(true); setErr("");
    try {
      await verifyLoginAndSignIn(phone, pin);
      onLogin({ phone, ...userData });
    } catch (e) {
      setErr("Incorrect PIN");
      setPin("");
    }
    setLoading(false);
  }

  // ── LANDING PAGE (no door chosen yet) ──────────────────────
  if (!door) {
    return (
      <div style={{
        minHeight: "100vh", position: "relative", overflow: "hidden",
        backgroundColor: "#24303d",
        backgroundImage: 'url("/mech-bg.jpg")',
        backgroundSize: "cover", backgroundPosition: "center",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 16,
      }}>
        <style>{`
          @keyframes gearspin { to { transform: rotate(360deg); } }
          @keyframes gearspinRev { to { transform: rotate(-360deg); } }
        `}</style>

        {/* Soft dark overlay so text and cards stay readable over the machinery */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: "linear-gradient(180deg, rgba(15,23,42,0.42) 0%, rgba(15,23,42,0.28) 45%, rgba(15,23,42,0.5) 100%)",
        }} />

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
          <img src="/logo192.png" alt="Mech EMS" style={{ width: 68, height: 68, borderRadius: 16, margin: "0 auto 14px", display: "block", boxShadow: "0 4px 20px rgba(0,0,0,0.5)" }} />
          <div style={{ fontSize: 32, fontWeight: 800, color: "#fff", letterSpacing: 0.5, textShadow: "0 2px 14px rgba(0,0,0,0.65)" }}>Mech EMS</div>
          <div style={{ fontSize: 13, color: "#ffd9a0", marginTop: 6, letterSpacing: 2, textTransform: "uppercase", fontWeight: 600, textShadow: "0 1px 8px rgba(0,0,0,0.7)" }}>
            Engineered for Education
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", marginTop: 4, textShadow: "0 1px 6px rgba(0,0,0,0.7)" }}>
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
                  background: "rgba(255,255,255,0.9)", borderRadius: 16, padding: "26px 22px",
                  width: 220, cursor: "pointer", textAlign: "center",
                  backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
                  boxShadow: "0 12px 38px rgba(0,0,0,0.45)",
                  border: "1px solid rgba(255,255,255,0.55)",
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
                <div style={{ fontWeight: 700, fontSize: 16, color: "#22303c", marginBottom: 4 }}>{d.label}</div>
                <div style={{ fontSize: 12, color: "#5b6b78", lineHeight: 1.4 }}>{d.desc}</div>
                <div style={{
                  marginTop: 14, fontSize: 13, fontWeight: 600, color: d.color,
                  border: `1.5px solid ${d.color}`, borderRadius: 8, padding: "7px 0",
                }}>Login →</div>
              </div>
            );
          })}
        </div>

        <div style={{ position: "absolute", bottom: 14, fontSize: 11, color: "rgba(255,255,255,0.75)", zIndex: 5, textShadow: "0 1px 6px rgba(0,0,0,0.7)" }}>
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
            {door === "master" ? (
              <>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Enter your mobile number</div>
                <Fld label="Mobile number" value={phone} onChange={v => setPhone(v.replace(/\D/g, ""))} placeholder="10-digit number" type="tel" />
              </>
            ) : (
              <>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Enter your college email</div>
                <Fld label="College email" value={ident} onChange={v => { setIdent(v.trim()); setPhone(v.replace(/\D/g, "")); }} placeholder={"name@" + COLLEGE_DOMAIN} type="text" />
              </>
            )}
            {err && <div style={{ color: P.red, fontSize: 13, marginBottom: 10 }}>{err}</div>}
            <Btn full onClick={() => (door === "master" || !emailMode ? checkPhone() : checkEmailAddr())} disabled={loading} style={{ background: d.color }}>{loading ? "Checking…" : "Continue"}</Btn>
            {door !== "master" && (
              <div style={{ marginTop: 16, background: P.bg, borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ fontSize: 12, color: P.gray, lineHeight: 1.5 }}>
                  Sign in with your college email. First time? A link to set your password is emailed to you. {door === "faculty" ? "New faculty can register here too: the HoD approves." : ""} You can still sign in with the mobile number and PIN you used before.
                </div>
              </div>
            )}
          </div>
        )}

        {/* Email: new joiner asks for access */}
        {step === "email-register" && (
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>New registration</div>
            <div style={{ fontSize: 13, color: P.gray, marginBottom: 16 }}>
              Email: <strong>{email}</strong>{" "}
              <span style={{ color: P.blue, cursor: "pointer" }} onClick={() => { setStep("phone"); setErr(""); }}>change</span>
            </div>
            <Fld label="Full name *" value={form.name} onChange={v => setForm(f => ({...f, name: v}))} placeholder="Your full name" />
            <Fld label="Designation *" value={form.designation} onChange={v => setForm(f => ({...f, designation: v}))} placeholder="e.g. Assistant Professor" />
            <Fld label="Employee ID *" value={form.employeeId || ""} onChange={v => setForm(f => ({...f, employeeId: v}))} placeholder="e.g. RE0009" />
            <Fld label="Department / Branch" value={form.branch} onChange={v => setForm(f => ({...f, branch: v}))} placeholder="e.g. Mechanical Engineering" />
            {err && <div style={{ color: P.red, fontSize: 13, marginBottom: 10 }}>{err}</div>}
            <Btn full onClick={submitEmailRegistration} disabled={loading}>{loading ? "Submitting…" : "Submit for approval"}</Btn>
            <div style={{ fontSize: 12, color: P.gray, marginTop: 10, lineHeight: 1.5 }}>The HoD will approve your request. After that you will get an email with a link to set your password.</div>
          </div>
        )}

        {/* Email: password */}
        {step === "email-pass" && (
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Enter your password</div>
            <div style={{ fontSize: 13, color: P.gray, marginBottom: 16 }}>
              Welcome, <strong>{emailInfo?.name}</strong> ({email}){" "}
              <span style={{ color: P.blue, cursor: "pointer" }} onClick={() => { setStep("phone"); setPw(""); setErr(""); setNotice(""); }}>change</span>
            </div>
            {notice && <div style={{ fontSize: 12.5, color: P.green, background: P.greenL, borderRadius: 8, padding: "9px 11px", marginBottom: 12, lineHeight: 1.5 }}>{notice}</div>}
            <Fld label="Password" value={pw} onChange={setPw} placeholder="Your password" type="password" />
            {err && <div style={{ color: P.red, fontSize: 13, marginBottom: 10 }}>{err}</div>}
            <Btn full onClick={submitEmailPassword} disabled={loading}>{loading ? "Checking…" : "Login"}</Btn>
            <div style={{ marginTop: 12, fontSize: 12.5, color: P.gray, textAlign: "center" }}>
              First time, or forgot your password?{" "}
              <span style={{ color: P.blue, cursor: "pointer", fontWeight: 600 }} onClick={() => sendLink(false)}>Email me a link</span>
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
            <Btn variant="outline" onClick={recheck}>Check status</Btn>
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
            <Btn full onClick={submitPin} disabled={loading}>{loading ? "Checking…" : "Login"}</Btn>
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
