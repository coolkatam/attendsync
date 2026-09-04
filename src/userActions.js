// src/userActions.js
// Shared user-management actions (approve/reject/promote/reset PIN/delete).
// Used by both AdminApp.js and HoDApp.jsx so HoD's Users tab behaves
// identically to the admin one, with no duplicated logic.

import { doc, updateDoc, deleteDoc, deleteField } from "firebase/firestore";
import { db } from "./firebase";

export async function approveUser(phone) {
  await updateDoc(doc(db, "users", phone), { status: "approved" });
}
export async function resetPin(phone) {
  // Must fully REMOVE the field, not set it to "" — the Firestore rule that
  // lets a not-yet-logged-in user set their own new PIN only fires when the
  // pin field is entirely absent (!('pin' in resource.data)). Leaving an
  // empty-string pin behind blocks them from ever completing that flow.
  await updateDoc(doc(db, "users", phone), { pin: deleteField() });
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
