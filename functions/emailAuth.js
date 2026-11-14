// College-email sign-in.
// Faculty sign in with their college email and a password they set themselves from a link the portal emails them.
// Google stores the password in scrambled form; we never see it. A person's record keeps its old id (the mobile
// number) when they already had one, so attendance, marks and timetables stay with them. A new person's id is built
// from the email.

const COLLEGE_DOMAIN = "raghuenggcollege.in";
const MASTER_UID = "9502808301";

function normEmail(e) { return String(e || "").normalize("NFKC").trim().toLowerCase(); }
function isCollegeEmail(e) { return new RegExp("^[a-z0-9._%+-]+@" + COLLEGE_DOMAIN.replace(/\./g, "\\.") + "$").test(e); }
function idFromEmail(e) { return e.replace(/@/g, "_at_").replace(/\./g, "_dot_"); }

module.exports = function build({ admin, onCall, HttpsError, compareNames }) {
  async function findUserByEmail(email) {
    const db = admin.firestore();
    const q = await db.collection("users").where("email", "==", email).limit(1).get();
    if (!q.empty) return { id: q.docs[0].id, data: q.docs[0].data() };
    const d = await db.collection("users").doc(idFromEmail(email)).get();
    return d.exists ? { id: d.id, data: d.data() } : null;
  }

  // the sign-in account for an approved person, made on first need (uid = the person's record id)
  async function ensureAuthUser(id, email, name) {
    try { await admin.auth().getUser(id); return; } catch (e) { if (e.code !== "auth/user-not-found") throw e; }
    try {
      const other = await admin.auth().getUserByEmail(email);
      if (other && other.uid !== id) throw new HttpsError("failed-precondition", "This email is already linked to a different account. Please contact the HoD.");
    } catch (e) { if (e instanceof HttpsError) throw e; if (e.code !== "auth/user-not-found") throw e; }
    await admin.auth().createUser({ uid: id, email, displayName: name || undefined, emailVerified: false });
  }

  // who is asking: the master admin, the HoD or a Class Coordinator
  async function callerRole(request) {
    if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");
    const uid = request.auth.uid;
    if (uid === MASTER_UID) return "master";
    const d = await admin.firestore().collection("users").doc(uid).get();
    const role = d.exists ? d.data().role : "";
    if (role === "hod" || role === "admin") return role;
    throw new HttpsError("permission-denied", "Only the HoD or a Class Coordinator can do this.");
  }

  // Before sign-in: what is this email? Never returns a PIN.
  const checkEmail = onCall(async (request) => {
    const email = normEmail(request.data && request.data.email);
    if (!isCollegeEmail(email)) throw new HttpsError("invalid-argument", "Use your college email, like name@" + COLLEGE_DOMAIN + ".");
    const hit = await findUserByEmail(email);
    if (!hit) return { exists: false };
    const { pin, ...safe } = hit.data;
    if (safe.status === "approved") await ensureAuthUser(hit.id, email, safe.name);
    return { exists: true, ...safe, id: hit.id, hasPin: !!pin, pwSet: !!safe.pwSet };
  });

  // A new joiner who is not on the uploaded list asks for access. The HoD approves.
  const requestEmailAccess = onCall(async (request) => {
    const d = request.data || {};
    const email = normEmail(d.email);
    const name = String(d.name || "").trim();
    const designation = String(d.designation || "").trim();
    const branch = String(d.branch || "").trim();
    const employeeId = String(d.employeeId || "").trim();
    if (!isCollegeEmail(email)) throw new HttpsError("invalid-argument", "Use your college email, like name@" + COLLEGE_DOMAIN + ".");
    if (!name || !designation || !employeeId) throw new HttpsError("invalid-argument", "Name, designation and Employee ID are required.");
    const hit = await findUserByEmail(email);
    if (hit) return { status: hit.data.status };
    // roster verdict for whoever approves: never shows the roster name itself
    let rosterCheck = "Employee ID not on the roster";
    const r = await admin.firestore().collection("employeeRoster").doc(employeeId).get();
    if (r.exists) rosterCheck = compareNames(name, r.data().name || "") === "none" ? "Employee ID found, but the name differs" : "Employee ID found, name matches";
    await admin.firestore().collection("users").doc(idFromEmail(email)).set({
      name, designation, branch, employeeId, email, role: "faculty", status: "pending",
      via: "email", rosterCheck, registeredAt: new Date().toISOString(),
    });
    return { status: "pending" };
  });

  // After approval (or when a link is needed again): make sure the sign-in account exists
  const ensureEmailAccount = onCall(async (request) => {
    await callerRole(request);
    const id = String((request.data && request.data.id) || "");
    const d = await admin.firestore().collection("users").doc(id).get();
    if (!d.exists || !d.data().email) throw new HttpsError("not-found", "That person has no college email on file.");
    if (d.data().status !== "approved") throw new HttpsError("failed-precondition", "That person is not approved yet.");
    await ensureAuthUser(id, d.data().email, d.data().name);
    return { ok: true, email: d.data().email };
  });

  // The uploaded list: [{ name, email, employeeId, designation, matchId }]
  // every row becomes a new account; an existing account is never changed
  const importFaculty = onCall({ timeoutSeconds: 300 }, async (request) => {
    await callerRole(request);
    const rows = Array.isArray(request.data && request.data.rows) ? request.data.rows.slice(0, 500) : [];
    const db = admin.firestore();
    const results = [];
    for (const row of rows) {
      const email = normEmail(row.email);
      const name = String(row.name || "").trim();
      try {
        if (!isCollegeEmail(email)) throw new Error("Not a @" + COLLEGE_DOMAIN + " email.");
        if (!name) throw new Error("No name.");
        const existing = await findUserByEmail(email);
        if (existing) {
          if (existing.data.status === "approved") await ensureAuthUser(existing.id, email, existing.data.name);
          results.push({ email, ok: true, id: existing.id, note: "already in the portal", canSend: existing.data.status === "approved" });
          continue;
        }
        const id = idFromEmail(email);
        await db.collection("users").doc(id).set({
          name, designation: String(row.designation || "").trim(), branch: "", employeeId: String(row.employeeId || "").trim(),
          email, role: "faculty", status: "approved", via: "upload", importedBy: request.auth.uid, registeredAt: new Date().toISOString(),
        });
        await ensureAuthUser(id, email, name);
        results.push({ email, ok: true, id, note: "new account", canSend: true });
      } catch (e) {
        results.push({ email, ok: false, error: e.message || String(e) });
      }
    }
    return { results };
  });

  return { checkEmail, requestEmailAccess, ensureEmailAccount, importFaculty };
};

module.exports.normEmail = normEmail;
module.exports.isCollegeEmail = isCollegeEmail;
module.exports.idFromEmail = idFromEmail;
