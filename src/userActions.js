// src/userActions.js
// Shared user-management actions (approve/reject/promote/reset PIN/delete).
// Used by both AdminApp.js and HoDApp.jsx so HoD's Users tab behaves
// identically to the admin one, with no duplicated logic.

import { doc, getDoc, updateDoc, deleteDoc, deleteField } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { sendPasswordResetEmail } from "firebase/auth";
import { db, auth, functions } from "./firebase";

// Emails a link to set (or reset) the password. The sign-in account is made first if it does not exist yet.
export async function sendSetPasswordLink(id, email) {
  await httpsCallable(functions, "ensureEmailAccount")({ id });
  await sendPasswordResetEmail(auth, email);
}

export async function approveUser(id) {
  await updateDoc(doc(db, "users", id), { status: "approved" });
  // a person who signs in with a college email gets the set-password link as soon as they are approved
  try {
    const u = (await getDoc(doc(db, "users", id))).data() || {};
    if (u.email && !u.pwSet) {
      await sendSetPasswordLink(id, u.email);
      window.alert("Approved. A link to set a password was emailed to " + u.email + ".");
    }
  } catch (e) {
    window.alert("Approved, but the password link could not be emailed (" + (e.message || e) + "). Use 'Send password link' on their card to try again.");
  }
}
export async function resetPin(phone) {
  // Must fully REMOVE the field, not set it to "" — the Firestore rule that
  // lets a not-yet-logged-in user set their own new PIN only fires when the
  // pin field is entirely absent (!('pin' in resource.data)). Leaving an
  // empty-string pin behind blocks them from ever completing that flow.
  await httpsCallable(functions, "resetPin")({ id: phone });
}
// "Removed" keeps the record (nothing is deleted): the person can't log in and is out of every list until restored
export async function restoreUser(id) {
  const u = (await getDoc(doc(db, "users", id))).data() || {};
  await updateDoc(doc(db, "users", id), { status: u.removedFrom || "approved", removedFrom: deleteField(), removedAt: deleteField() });
}
export async function removeUser(id, name) {
  if (!window.confirm("Remove " + name + "? They can no longer log in and disappear from every list. Nothing is deleted, and you can restore them any time.")) return;
  const u = (await getDoc(doc(db, "users", id))).data() || {};
  await updateDoc(doc(db, "users", id), { status: "removed", removedFrom: u.status || "approved", removedAt: new Date().toISOString() });
}
export async function rejectUser(phone) {
  await updateDoc(doc(db, "users", phone), { status: "rejected" });
}
export async function makeAdmin(phone) {
  await updateDoc(doc(db, "users", phone), { role: "admin" });
}
export async function makeFaculty(phone) {
  await updateDoc(doc(db, "users", phone), { role: "faculty" });
}
export async function makeHod(phone) {
  if (!window.confirm("Make this user HoD? They will get the HoD dashboard. If they are currently an admin, they will LOSE their admin dashboard.")) return;
  await updateDoc(doc(db, "users", phone), { role: "hod" });
}
export async function deleteUser(phone, name) {
  if (!window.confirm("Delete user " + name + " (" + phone + ")? This cannot be undone.")) return;
  await deleteDoc(doc(db, "users", phone));
}
