// src/login/LandingLogin.jsx
// The one login page, on the department's landing picture.
//   New user       Employee ID + college email -> a password link is emailed -> create the password -> sign in
//   Existing user  Employee ID + password (Forgot password: a link to the college email)
//   Master Admin   (top corner) mobile number + PIN, as before; the few accounts that are not on Employee ID yet use it too
// After sign-in the app opens the home page for the person's role.

import React, { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { sendPasswordResetEmail, signInWithCustomToken } from "firebase/auth";
import { auth, functions } from "../firebase";
import { COLLEGE_DOMAIN, normEmpId, normEmail, isCollegeEmail } from "../utils";

const C = { navy: "#1b2a4e", blue: "#1a56a0", gold: "#f0a91c", ink: "#1a2230", gray: "#5b6673", line: "#d8dee6", red: "#b91c1c", green: "#166534", greenL: "#dcfce7", redL: "#fee2e2" };
const field = { width: "100%", boxSizing: "border-box", padding: "11px 12px", border: "1.5px solid " + C.line, borderRadius: 10, fontFamily: "inherit", fontSize: 15, background: "#fff", marginBottom: 13, color: C.ink };
const label = { display: "block", fontSize: 12, fontWeight: 700, color: C.gray, margin: "0 0 4px" };
const goBtn = busy => ({ width: "100%", border: 0, borderRadius: 10, padding: 12, background: "linear-gradient(180deg,#f5b52e,#e69a0e)", color: C.navy, fontFamily: "inherit", fontWeight: 800, fontSize: 15, cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1 });
const link = { background: "none", border: 0, padding: 0, color: C.blue, fontWeight: 600, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" };

const say = e => (e && e.message) || "Something went wrong. Please try again.";

function Field({ id, text, value, onChange, type = "text", placeholder, onEnter, autoComplete }) {
  return (
    <>
      <label htmlFor={id} style={label}>{text}</label>
      <input id={id} type={type} value={value} placeholder={placeholder} autoComplete={autoComplete} style={field}
        onChange={e => onChange(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && onEnter) onEnter(); }} />
    </>
  );
}
const Msg = ({ ok, children }) => children ? <div role="status" style={{ fontSize: 12.5, lineHeight: 1.5, borderRadius: 10, padding: "9px 11px", margin: "0 0 12px", color: ok ? C.green : C.red, background: ok ? C.greenL : C.redL }}>{children}</div> : null;

export default function LandingLogin({ onLogin }) {
  const [mode, setMode] = useState("main");          // main | master
  const [tab, setTab] = useState("new");             // new | old
  const [forgot, setForgot] = useState(false);
  const [empId, setEmpId] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  // Master Admin / mobile + PIN
  const [phone, setPhone] = useState("");
  const [pstep, setPstep] = useState("phone");       // phone | enter-pin | setup-pin
  const [pinUser, setPinUser] = useState(null);
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");

  const reset = () => { setErr(""); setOk(""); };
  const switchTab = t => { setTab(t); setForgot(false); reset(); setPw(""); };

  // Employee ID + college email must be a pair on the list; then Google emails the link
  async function sendLink(purpose) {
    reset();
    const id = normEmpId(empId), mail = normEmail(email);
    if (!id) { setErr("Enter your Employee ID."); return; }
    if (!isCollegeEmail(mail)) { setErr("Enter your college email, like name@" + COLLEGE_DOMAIN + "."); return; }
    setBusy(true);
    try {
      const res = await httpsCallable(functions, "passwordLinkCheck")({ employeeId: id, email: mail, purpose });
      await sendPasswordResetEmail(auth, mail, { url: res.data.continueUrl });
      setOk("Password link is sent to your official college email. Please check Spam if you do not see it in the Inbox, and " + (purpose === "forgot" ? "set a new password" : "create a password") + ". The mail is titled \"Reset your password for attendsync-66e55\": that is the right one. After that, come back here and choose Existing user to sign in.");
    } catch (e) {
      setErr(e.code === "auth/too-many-requests" ? "Too many mails were requested just now. Please try again in a little while." : e.code === "auth/operation-not-allowed" ? "Email sign-in has not been switched on yet. Please tell the administrator." : say(e));
    }
    setBusy(false);
  }

  async function signIn() {
    reset();
    const id = normEmpId(empId);
    if (!id || !pw) { setErr("Enter your Employee ID and password."); return; }
    setBusy(true);
    try {
      const res = await httpsCallable(functions, "employeeLogin")({ employeeId: id, password: pw });
      await signInWithCustomToken(auth, res.data.token);
      onLogin({ ...res.data.user, phone: res.data.id });
    } catch (e) { setErr(say(e)); setPw(""); }
    setBusy(false);
  }

  // ── Master Admin: mobile number + PIN (unchanged) ──
  async function checkPhone() {
    reset();
    if (phone.length < 10) { setErr("Enter a valid 10-digit number."); return; }
    setBusy(true);
    try {
      const data = (await httpsCallable(functions, "checkPhone")({ phone })).data;
      if (!data.exists) setErr("Number not found.");
      else if (data.status === "removed") setErr("This account has been removed. Please contact the HoD.");
      else if (data.status !== "approved") setErr("This account is not active. Please contact the HoD.");
      else { setPinUser(data); setPin(""); setPin2(""); setPstep(data.hasPin ? "enter-pin" : "setup-pin"); }
    } catch (e) { setErr(say(e)); }
    setBusy(false);
  }
  async function submitPin() {
    reset();
    if (!/^\d{4}$/.test(pin)) { setErr("Enter your 4-digit PIN."); return; }
    setBusy(true);
    try {
      const res = await httpsCallable(functions, "verifyLogin")({ phone, pin });
      await signInWithCustomToken(auth, res.data.token);
      onLogin({ phone, ...pinUser });
    } catch (e) { setErr("Incorrect PIN."); setPin(""); }
    setBusy(false);
  }
  async function createPin() {
    reset();
    if (!/^\d{4}$/.test(pin)) { setErr("PIN must be exactly 4 digits."); return; }
    if (pin !== pin2) { setErr("The two PINs do not match."); return; }
    setBusy(true);
    try {
      const res = await httpsCallable(functions, "setPin")({ phone, pin });
      await signInWithCustomToken(auth, res.data.token);
      onLogin({ ...pinUser, phone, hasPin: true });
    } catch (e) { setErr(say(e)); }
    setBusy(false);
  }
  const backToMain = () => { setMode("main"); setPstep("phone"); setPhone(""); setPin(""); setPin2(""); reset(); };

  return (
    <div className="ll-stage">
      <style>{`
        .ll-stage { position: relative; min-height: 100vh; background: #cfe0f2 url("/landing.jpg") center / cover no-repeat; overflow: hidden; font-family: "Segoe UI", system-ui, Arial, sans-serif; color: ${C.ink}; }
        .ll-card { position: absolute; right: 5%; bottom: 6%; width: min(390px, 92vw); max-height: 92vh; overflow-y: auto; background: rgba(255,255,255,0.9); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
                   border: 1px solid rgba(255,255,255,0.8); border-radius: 18px; box-shadow: 0 18px 50px rgba(20,40,80,0.35); padding: 20px 22px 18px; z-index: 5; }
        .ll-corner { position: absolute; top: 18px; right: 22px; z-index: 6; }
        .ll-stage input:focus { outline: none; border-color: ${C.blue}; box-shadow: 0 0 0 3px rgba(26,86,160,0.15); }
        @media (max-width: 820px) {
          .ll-stage { background-size: auto 52%; background-position: 28% top; }
          .ll-card { right: auto; left: 50%; transform: translateX(-50%); bottom: 3%; }
        }
      `}</style>

      <div className="ll-corner">
        <button onClick={() => (mode === "master" ? backToMain() : (setMode("master"), reset()))}
          style={{ color: C.navy, background: "rgba(255,255,255,0.8)", border: "1px solid rgba(27,42,78,0.25)", borderRadius: 20, padding: "6px 14px", fontWeight: 600, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>
          {mode === "master" ? "← Sign in" : "Master Admin"}
        </button>
      </div>

      <div className="ll-card">
        {mode === "main" ? (
          <>
            <p style={{ fontSize: 11.5, letterSpacing: ".14em", textTransform: "uppercase", color: C.gray, fontWeight: 700, margin: "0 0 10px" }}>Mech EMS · Sign in</p>
            <div role="tablist" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", background: "#e9eef5", borderRadius: 12, padding: 4, marginBottom: 16 }}>
              {[["new", "New user"], ["old", "Existing user"]].map(([k, t]) => (
                <button key={k} role="tab" aria-selected={tab === k} onClick={() => switchTab(k)}
                  style={{ border: 0, padding: "10px 8px", borderRadius: 9, fontFamily: "inherit", fontWeight: 700, fontSize: 14, cursor: "pointer", background: tab === k ? C.navy : "transparent", color: tab === k ? "#fff" : C.gray, boxShadow: tab === k ? "0 2px 8px rgba(27,42,78,0.3)" : "none" }}>{t}</button>
              ))}
            </div>

            {tab === "new" && (
              <div>
                <Field id="ll-emp" text="Employee ID" value={empId} onChange={setEmpId} placeholder="e.g. RE0009" autoComplete="username" />
                <Field id="ll-mail" text="College email" value={email} onChange={setEmail} placeholder={"name@" + COLLEGE_DOMAIN} autoComplete="email" onEnter={() => sendLink("first")} />
                <Msg>{err}</Msg>
                <Msg ok>{ok}</Msg>
                <button style={goBtn(busy)} disabled={busy} onClick={() => sendLink("first")}>{busy ? "Checking…" : "Send password link"}</button>
                <div style={{ fontSize: 12, color: C.gray, lineHeight: 1.5, marginTop: 12 }}>First time here? Enter the Employee ID and college email your HoD registered. Not recognised? Please contact the HoD.</div>
              </div>
            )}

            {tab === "old" && !forgot && (
              <div>
                <Field id="ll-emp2" text="Employee ID" value={empId} onChange={setEmpId} placeholder="e.g. RE0009" autoComplete="username" />
                <Field id="ll-pw" text="Password" type="password" value={pw} onChange={setPw} placeholder="Your password" autoComplete="current-password" onEnter={signIn} />
                <Msg>{err}</Msg>
                <button style={goBtn(busy)} disabled={busy} onClick={signIn}>{busy ? "Checking…" : "Login"}</button>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
                  <button style={link} onClick={() => { setForgot(true); reset(); }}>Forgot password?</button>
                  <button style={link} onClick={() => switchTab("new")}>New user?</button>
                </div>
              </div>
            )}

            {tab === "old" && forgot && (
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>Forgot password</div>
                <Field id="ll-emp3" text="Employee ID" value={empId} onChange={setEmpId} placeholder="e.g. RE0009" autoComplete="username" />
                <Field id="ll-mail3" text="College email" value={email} onChange={setEmail} placeholder={"name@" + COLLEGE_DOMAIN} autoComplete="email" onEnter={() => sendLink("forgot")} />
                <Msg>{err}</Msg>
                <Msg ok>{ok}</Msg>
                <button style={goBtn(busy)} disabled={busy} onClick={() => sendLink("forgot")}>{busy ? "Checking…" : "Email me a link"}</button>
                <div style={{ marginTop: 12 }}><button style={link} onClick={() => { setForgot(false); reset(); }}>← Back to sign in</button></div>
              </div>
            )}
          </>
        ) : (
          <>
            <p style={{ fontSize: 11.5, letterSpacing: ".14em", textTransform: "uppercase", color: C.gray, fontWeight: 700, margin: "0 0 10px" }}>Master Admin</p>
            {pstep === "phone" && (
              <div>
                <Field id="ll-ph" text="Mobile number" value={phone} onChange={v => setPhone(v.replace(/\D/g, ""))} placeholder="10-digit number" onEnter={checkPhone} autoComplete="tel" />
                <Msg>{err}</Msg>
                <button style={goBtn(busy)} disabled={busy} onClick={checkPhone}>{busy ? "Checking…" : "Continue"}</button>
              </div>
            )}
            {pstep === "enter-pin" && (
              <div>
                <div style={{ fontSize: 13, color: C.gray, marginBottom: 12 }}>Welcome back, <b>{pinUser && pinUser.name}</b></div>
                <Field id="ll-pin" text="4-digit PIN" type="password" value={pin} onChange={v => setPin(v.replace(/\D/g, "").slice(0, 4))} placeholder="••••" onEnter={submitPin} />
                <Msg>{err}</Msg>
                <button style={goBtn(busy)} disabled={busy} onClick={submitPin}>{busy ? "Checking…" : "Login"}</button>
                <div style={{ marginTop: 12 }}><button style={link} onClick={() => { setPstep("phone"); setPin(""); reset(); }}>← Change number</button></div>
              </div>
            )}
            {pstep === "setup-pin" && (
              <div>
                <div style={{ fontSize: 13, color: C.gray, marginBottom: 12 }}>Create a 4-digit PIN. You will use it to sign in next time.</div>
                <Field id="ll-npin" text="Create PIN" type="password" value={pin} onChange={v => setPin(v.replace(/\D/g, "").slice(0, 4))} placeholder="••••" />
                <Field id="ll-npin2" text="Confirm PIN" type="password" value={pin2} onChange={v => setPin2(v.replace(/\D/g, "").slice(0, 4))} placeholder="••••" onEnter={createPin} />
                <Msg>{err}</Msg>
                <button style={goBtn(busy)} disabled={busy} onClick={createPin}>{busy ? "Saving…" : "Set PIN and continue"}</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
