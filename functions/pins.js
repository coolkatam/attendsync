// PINs live in their own collection, userPins/{id}, which the security rules lock against every browser.
// Only these server functions read or write it. The users record keeps just a yes/no flag, pinSet, for the screens.
// Older records may still hold the PIN inside the users document until it is moved (the move happens on login and
// through the one-time migration).

const MASTER_UID = "9502808301";

module.exports = function build({ admin, onCall, HttpsError }) {
  const db = () => admin.firestore();

  // the PIN for a person: the locked collection first, then (if not moved yet) the old field
  async function pinOf(id, userData) {
    const p = await db().collection("userPins").doc(id).get();
    if (p.exists && p.data().pin) return String(p.data().pin);
    return userData && userData.pin ? String(userData.pin) : "";
  }

  // move one person's PIN out of the users record
  async function moveToLocked(id, pin) {
    await db().collection("userPins").doc(id).set({ pin, movedAt: new Date().toISOString() });
    await db().collection("users").doc(id).update({ pin: admin.firestore.FieldValue.delete(), pinSet: true });
  }

  async function callerCanReset(request) {
    if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");
    if (request.auth.uid === MASTER_UID) return true;
    const d = await db().collection("users").doc(request.auth.uid).get();
    const role = d.exists ? d.data().role : "";
    if (role === "hod" || role === "admin") return true;
    throw new HttpsError("permission-denied", "Only the HoD or a Class Coordinator can reset a PIN.");
  }

  // First-time PIN for an approved person who has none yet; signs them in.
  const setPin = onCall(async (request) => {
    const phone = String((request.data && request.data.phone) || "").replace(/\D/g, "");
    const pin = String((request.data && request.data.pin) || "").trim();
    if (!/^\d{10}$/.test(phone) || !/^\d{4}$/.test(pin)) throw new HttpsError("invalid-argument", "Enter a valid number and a 4-digit PIN.");
    const ref = db().collection("users").doc(phone);
    const u = await ref.get();
    if (!u.exists || u.data().status !== "approved") throw new HttpsError("permission-denied", "This account is not approved.");
    if (await pinOf(phone, u.data())) throw new HttpsError("failed-precondition", "A PIN is already set. Ask the HoD to reset it.");
    await db().collection("userPins").doc(phone).set({ pin, movedAt: new Date().toISOString() });
    await ref.update({ pinSet: true, pin: admin.firestore.FieldValue.delete() });
    const token = await admin.auth().createCustomToken(phone, { role: u.data().role || "faculty" });
    return { token };
  });

  // HoD, Coordinator or master: clear someone's PIN so they set a new one at next login
  const resetPin = onCall(async (request) => {
    await callerCanReset(request);
    const id = String((request.data && request.data.id) || "");
    if (!id) throw new HttpsError("invalid-argument", "Who?");
    await db().collection("userPins").doc(id).delete();
    const ref = db().collection("users").doc(id);
    if ((await ref.get()).exists) await ref.update({ pin: admin.firestore.FieldValue.delete(), pinSet: false });
    return { ok: true };
  });

  // Move every PIN still sitting in a users record into the locked collection. Returns the counts.
  async function movePinsNow() {
    const snap = await db().collection("users").get();
    let moved = 0, already = 0, empty = 0;
    for (const d of snap.docs) {
      const pin = d.data().pin;
      if (pin === undefined) { if (d.data().pinSet) already++; continue; }
      if (!pin) { await d.ref.update({ pin: admin.firestore.FieldValue.delete() }); empty++; continue; }
      await moveToLocked(d.id, String(pin));
      moved++;
    }
    const left = (await db().collection("users").get()).docs.filter(d => d.data().pin !== undefined).length;
    return { users: snap.size, moved, alreadyMoved: already, emptyRemoved: empty, stillInUsersRecord: left };
  }

  return { setPin, resetPin, pinOf, moveToLocked, movePinsNow };
};
