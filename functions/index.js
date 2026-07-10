const { setGlobalOptions } = require("firebase-functions");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

admin.initializeApp();
setGlobalOptions({ maxInstances: 10 });

// ── verifyLogin ──────────────────────────────────────────────
// Checks phone + PIN server-side; if valid, returns a signed
// Firebase custom token the app uses to create a real Auth session.
exports.verifyLogin = onCall(async (request) => {
  const phone = (request.data?.phone || "").replace(/\D/g, "");
  const pin = (request.data?.pin || "").trim();

  if (!phone || !pin) {
    throw new HttpsError("invalid-argument", "Phone number and PIN are required.");
  }

  const userDoc = await admin.firestore().collection("users").doc(phone).get();

  if (!userDoc.exists) {
    throw new HttpsError("not-found", "No account found for this phone number.");
  }

  const data = userDoc.data();

  if (data.status !== "approved") {
    throw new HttpsError("permission-denied", "This account is not approved yet.");
  }

  if (!data.pin || data.pin !== pin) {
    throw new HttpsError("unauthenticated", "Incorrect PIN.");
  }

  const customToken = await admin.auth().createCustomToken(phone, {
    role: data.role || "faculty",
  });

  return { token: customToken };
});

// ── checkPhone ───────────────────────────────────────────────
// Replaces the app's old direct Firestore read at the phone-entry
// step (which the new security rules correctly block before login).
// Runs with server privileges and returns ONLY safe fields —
// never the PIN itself.
exports.checkPhone = onCall(async (request) => {
  const phone = (request.data?.phone || "").replace(/\D/g, "");

  if (!phone || phone.length < 10) {
    throw new HttpsError("invalid-argument", "Enter a valid 10-digit number.");
  }

  const userDoc = await admin.firestore().collection("users").doc(phone).get();

  if (!userDoc.exists) {
    return { exists: false };
  }

  const data = userDoc.data();

  // Return everything the login screen needs, but strip the PIN.
  const { pin, ...safeData } = data;

  return {
    exists: true,
    ...safeData,
    hasPin: !!pin,
  };
});
