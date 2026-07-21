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

// ── checkEmployeeId ──────────────────────────────────────────
// Runs server-side, BEFORE the person has logged in, so the employee
// roster (real names + IDs) is NEVER sent to the browser — only a verdict
// is returned. This is what keeps someone from reading the roster first
// and then submitting a perfectly matching fake registration.
//
// Verdict is one of: "full", "partial", "none" — never a hard block,
// so the approver (HoD/admin/master admin) always makes the final call
// with this verdict shown clearly on the pending request.

const TITLE_WORDS = new Set(["dr", "prof", "mr", "mrs", "ms", "er", "smt"]);

function normalizeName(name) {
  return (name || "")
    .toLowerCase()
    .replace(/\./g, " ")
    .split(/\s+/)
    .filter(w => w && !TITLE_WORDS.has(w));
}

// Simple Levenshtein edit distance — used to tolerate common Indian-name
// spelling variants (Swathi/Swati, Srikanth/Srikant) without being a full
// fuzzy-matching library.
function editDistance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

function wordsMatch(w1, w2) {
  if (w1 === w2) return true;
  const maxLen = Math.max(w1.length, w2.length);
  const tolerance = maxLen <= 5 ? 1 : 2; // short names get less slack
  return editDistance(w1, w2) <= tolerance;
}

// Compares a typed name against the roster name: "full" if every word in
// the shorter name has a fuzzy match in the other, "partial" if at least
// one meaningful word matches, "none" otherwise.
function compareNames(typed, rosterName) {
  const t = normalizeName(typed);
  const r = normalizeName(rosterName);
  if (t.length === 0 || r.length === 0) return "none";

  let matchedCount = 0;
  for (const tw of t) {
    if (r.some(rw => wordsMatch(tw, rw))) matchedCount++;
  }
  const shorter = Math.min(t.length, r.length);
  if (matchedCount >= shorter) return "full";
  if (matchedCount >= 1) return "partial";
  return "none";
}

exports.checkEmployeeId = onCall(async (request) => {
  const employeeId = (request.data?.employeeId || "").trim();
  const typedName = (request.data?.name || "").trim();

  if (!employeeId) {
    return { found: false, nameMatch: "none", rosterName: null };
  }

  const doc = await admin.firestore().collection("employeeRoster").doc(employeeId).get();

  if (!doc.exists) {
    return { found: false, nameMatch: "none", rosterName: null };
  }

  const rosterName = doc.data().name || "";
  const nameMatch = compareNames(typedName, rosterName);

  // Only confirm a match category — never return the roster name itself,
  // so the check can't be used to fish for real employee names.
  return { found: true, nameMatch, designation: doc.data().designation || "", department: doc.data().department || "" };
});
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
