// src/components/ChangePassword.jsx
// "Change password" in the page header. It emails a link to the person's own college email; the password is changed
// only from that link. Shown only for people who sign in with Employee ID and password.

import React, { useState } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../firebase";

export default function ChangePassword({ user }) {
  const [state, setState] = useState("idle");     // idle | sending | sent | failed
  if (!user || !user.email || !user.pwSet) return null;
  async function go() {
    if (state === "sending") return;
    setState("sending");
    try { await sendPasswordResetEmail(auth, user.email, { url: window.location.origin + "/" }); setState("sent"); }
    catch (e) { setState("failed"); }
    setTimeout(() => setState("idle"), 9000);
  }
  const text = state === "sending" ? "Sending…" : state === "sent" ? "Link sent to your college email" : state === "failed" ? "Could not send. Try again" : "Change password";
  return (
    <button onClick={go} title="A link to change your password is emailed to your college email"
      style={{ background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.85)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 7, padding: "7px 14px", cursor: "pointer", fontSize: 12.5, fontWeight: 600, fontFamily: "inherit", flexShrink: 0 }}>
      {text}
    </button>
  );
}
