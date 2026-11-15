// Sign-in with Employee ID and a password.
// The HoD or Master Admin lists each person by Employee ID and college email. The person proves they own that
// mailbox through a password link Google emails them, sets a password, and from then on signs in with the Employee ID
// and password. Google keeps the password in scrambled form; we never see it. A person's record id is their Employee ID,
// and so is their sign-in account's uid, which is what the security rules compare against.

const COLLEGE_DOMAIN = "raghuenggcollege.in";
const MASTER_UID = "9502808301";
const WEB_API_KEY = "AIzaSyC8UB5pQlgE74uX2UDMaGn408nbLDGCx4o";      // the public web key of this project (also in the app)
const SITE = "https://attendsync-66e55.web.app/";

function normEmail(e) { return String(e || "").normalize("NFKC").trim().toLowerCase(); }
function isCollegeEmail(e) { return new RegExp("^[a-z0-9._%+-]+@" + COLLEGE_DOMAIN.replace(/\./g, "\\.") + "$").test(e); }
// Employee ID as a record id: capitals, no spaces, nothing that is not a letter, digit, dash or underscore
function normEmpId(v) { return String(v || "").normalize("NFKC").toUpperCase().replace(/\s+/g, "").replace(/[^A-Z0-9_-]/g, ""); }

module.exports = function build({ admin, onCall, HttpsError }) {
  const db = () => admin.firestore();

  // the sign-in account for a listed person (uid = Employee ID, email = their college email)
  async function ensureAuthUser(id, email, name) {
    try {
      const u = await admin.auth().getUser(id);
      if (normEmail(u.email) !== email) await admin.auth().updateUser(id, { email });
      return;
    } catch (e) { if (e.code !== "auth/user-not-found") throw e; }
    try {
      const other = await admin.auth().getUserByEmail(email);
      if (other && other.uid !== id) throw new HttpsError("failed-precondition", "That email is already used by another account. Please contact the HoD.");
    } catch (e) { if (e instanceof HttpsError) throw e; if (e.code !== "auth/user-not-found") throw e; }
    await admin.auth().createUser({ uid: id, email, displayName: name || undefined, emailVerified: false });
  }

  // HoD or Master Admin only
  async function mustBeHodOrMaster(request) {
    if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");
    const uid = request.auth.uid;
    if (uid === MASTER_UID) return;
    const d = await db().collection("users").doc(uid).get();
    if (d.exists && d.data().role === "hod") return;
    throw new HttpsError("permission-denied", "Only the HoD or the Master Admin can add faculty.");
  }

  // [{ employeeId, email }] -> one new entry each. Nothing already in the portal is ever changed.
  const addFaculty = onCall({ timeoutSeconds: 300 }, async (request) => {
    await mustBeHodOrMaster(request);
    const rows = Array.isArray(request.data && request.data.rows) ? request.data.rows.slice(0, 500) : [];
    const results = [];
    for (const row of rows) {
      const id = normEmpId(row.employeeId);
      const email = normEmail(row.email);
      try {
        if (!id) throw new Error("No Employee ID.");
        if (!isCollegeEmail(email)) throw new Error("Not a @" + COLLEGE_DOMAIN + " email.");
        const ref = db().collection("users").doc(id);
        if ((await ref.get()).exists) throw new Error("Employee ID " + id + " is already in the portal.");
        const dup = await db().collection("users").where("email", "==", email).limit(1).get();
        if (!dup.empty) throw new Error("That email is already used by " + (dup.docs[0].data().employeeId || dup.docs[0].id) + ".");
        await ref.set({
          name: id, employeeId: id, email, role: "faculty", status: "approved", detailsDone: false,
          via: "list", addedBy: request.auth.uid, registeredAt: new Date().toISOString(),
        });
        results.push({ employeeId: id, email, ok: true });
      } catch (e) {
        results.push({ employeeId: id || String(row.employeeId || ""), email, ok: false, error: e.message || String(e) });
      }
    }
    return { results };
  });

  // New user (first password) or forgot password: the Employee ID and college email must be a pair on the list.
  // The caller then has Google email the link. The answer never says which of the two was wrong.
  const passwordLinkCheck = onCall(async (request) => {
    const id = normEmpId(request.data && request.data.employeeId);
    const email = normEmail(request.data && request.data.email);
    const purpose = (request.data && request.data.purpose) === "forgot" ? "forgot" : "first";
    const notFound = new HttpsError("not-found", "We could not match this Employee ID and college email. Please contact the HoD.");
    if (!id || !isCollegeEmail(email)) throw notFound;
    const d = await db().collection("users").doc(id).get();
    if (!d.exists) throw notFound;
    const u = d.data();
    if (u.status !== "approved" || normEmail(u.email) !== email) throw notFound;
    if (purpose === "first" && u.pwSet) throw new HttpsError("failed-precondition", "You have already created a password. Use Existing user to sign in, or Forgot password.");
    if (purpose === "forgot" && !u.pwSet) throw new HttpsError("failed-precondition", "You have not created a password yet. Use New user.");
    await ensureAuthUser(id, email, u.name);
    return { ok: true, firstTime: !u.pwSet, continueUrl: SITE };
  });

  // Existing user: Employee ID and password. Google checks the password; we then hand back a sign-in token.
  const employeeLogin = onCall(async (request) => {
    const id = normEmpId(request.data && request.data.employeeId);
    const password = String((request.data && request.data.password) || "");
    const bad = new HttpsError("unauthenticated", "Incorrect Employee ID or password.");
    if (!id || !password) throw bad;
    const d = await db().collection("users").doc(id).get();
    if (!d.exists) throw bad;
    const u = d.data();
    if (!u.email) throw bad;
    if (u.status === "removed") throw new HttpsError("permission-denied", "This account has been removed. Please contact the HoD.");
    if (u.status !== "approved") throw new HttpsError("permission-denied", "This account is not active. Please contact the HoD.");
    const res = await fetch("https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" + WEB_API_KEY, {
      method: "POST", headers: { "Content-Type": "application/json", Referer: SITE },
      body: JSON.stringify({ email: normEmail(u.email), password, returnSecureToken: false }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const code = body && body.error && body.error.message;
      if (code && /TOO_MANY_ATTEMPTS/.test(code)) throw new HttpsError("resource-exhausted", "Too many attempts. Please wait a few minutes, or use Forgot password.");
      throw bad;
    }
    if (!u.pwSet) await d.ref.update({ pwSet: true }).catch(() => {});
    const token = await admin.auth().createCustomToken(id, { role: u.role || "faculty" });
    const { pin, ...safe } = u;
    return { token, id, user: { ...safe, pwSet: true } };
  });

  return { addFaculty, passwordLinkCheck, employeeLogin };
};

module.exports.normEmail = normEmail;
module.exports.isCollegeEmail = isCollegeEmail;
module.exports.normEmpId = normEmpId;
