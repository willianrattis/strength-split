// firestore.rules on the Firestore emulator: the `sharedPlans` short links (KMP app, M7 P31) and a
// check that `users/**` still belongs to its owner only. Plain REST, no extra dependency; writes go
// through `:commit` like the SDKs (a `set` with a serverTimestamp transform), signed-in requests carry
// an unsigned emulator JWT, `Bearer owner` seeds past the rules. Not part of `npm test` (vitest):
//
//   JAVA_HOME=<JDK 21> firebase emulators:exec --only firestore --project demo-strength-split "node --test tests/rules/"
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

const host = process.env.FIRESTORE_EMULATOR_HOST;
if (!host) throw new Error("FIRESTORE_EMULATOR_HOST not set: run through `firebase emulators:exec` (see the header)");
const project = process.env.GCLOUD_PROJECT || "demo-strength-split";
const root = `projects/${project}/databases/(default)/documents`;
const api = `http://${host}/v1/${root}`;

const ID = "Ab3dE5gH9k";
const PLAN = "eyJ2IjoxLCJuYW1lIjoiRTJFIFBsYW5vIn0";

/** Unsigned ID token the emulator accepts (what @firebase/rules-unit-testing builds). */
function token(uid) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: `https://securetoken.google.com/${project}`, aud: project, iat: now, exp: now + 3600, auth_time: now,
    sub: uid, user_id: uid, firebase: { sign_in_provider: "custom", identities: {} },
  };
  return `${b64({ alg: "none", kid: "fakekid", typ: "JWT" })}.${b64(claims)}.`;
}

async function call(method, url, auth, body) {
  const headers = { "Content-Type": "application/json" };
  if (auth === "owner") headers.Authorization = "Bearer owner";
  else if (auth) headers.Authorization = `Bearer ${token(auth)}`;
  const res = await fetch(url, { method, headers, body: body && JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const str = (s) => ({ stringValue: s });
const int = (n) => ({ integerValue: String(n) });

/** The doc the app writes: `{v: 1, plan, ownerUid}` + `createdAt` = serverTimestamp. */
function sharedPlanWrite(id, { v = int(1), plan = str(PLAN), ownerUid = str("alice"), extra = {}, drop = [], serverTime = true } = {}) {
  const fields = { v, plan, ownerUid, ...extra };
  for (const k of drop) delete fields[k];
  const write = { update: { name: `${root}/sharedPlans/${id}`, fields } };
  if (serverTime) write.updateTransforms = [{ fieldPath: "createdAt", setToServerValue: "REQUEST_TIME" }];
  return write;
}

const commit = (auth, ...writes) => call("POST", `${api}:commit`, auth, { writes });
const getDoc = (auth, path) => call("GET", `${api}/${path}`, auth);
const remove = (auth, path) => commit(auth, { delete: `${root}/${path}` });

function listByOwner(auth, ownerUid) {
  const where = ownerUid && { fieldFilter: { field: { fieldPath: "ownerUid" }, op: "EQUAL", value: str(ownerUid) } };
  return call("POST", `${api}:runQuery`, auth, { structuredQuery: { from: [{ collectionId: "sharedPlans" }], ...(where && { where }) } });
}

const allowed = (r) => assert.equal(r.status, 200, JSON.stringify(r.body));
const denied = (r) => assert.equal(r.status, 403, JSON.stringify(r.body));

beforeEach(async () => {
  const res = await fetch(`http://${host}/emulator/v1/${root}`, { method: "DELETE" });
  assert.equal(res.status, 200);
});

const seed = () => commit("owner", sharedPlanWrite(ID));

// ---- create ----

test("create: signed in, own uid, exactly v/plan/ownerUid/createdAt (server time), 10 base62 id", async () => {
  allowed(await commit("alice", sharedPlanWrite(ID)));
  allowed(await commit("alice", sharedPlanWrite("0000000000")));
  allowed(await commit("alice", sharedPlanWrite("zzzzzzzzzz", { plan: str(PLAN + "==") })));
});

test("create: plan up to 65 536 chars", async () => {
  allowed(await commit("alice", sharedPlanWrite(ID, { plan: str("A".repeat(65536)) })));
  denied(await commit("alice", sharedPlanWrite("Ab3dE5gH9z", { plan: str("A".repeat(65537)) })));
});

test("create: denied signed out or for another uid", async () => {
  denied(await commit(null, sharedPlanWrite(ID)));
  denied(await commit("bob", sharedPlanWrite(ID)));
  denied(await commit("alice", sharedPlanWrite(ID, { ownerUid: str("") })));
});

test("create: denied with a key more or less", async () => {
  denied(await commit("alice", sharedPlanWrite(ID, { extra: { name: str("Plano") } })));
  denied(await commit("alice", sharedPlanWrite(ID, { drop: ["v"] })));
  denied(await commit("alice", sharedPlanWrite(ID, { drop: ["plan"] })));
  denied(await commit("alice", sharedPlanWrite(ID, { drop: ["ownerUid"] })));
  denied(await commit("alice", sharedPlanWrite(ID, { serverTime: false })));
});

test("create: denied with a client createdAt, another version or a plan that is not a base64url string", async () => {
  denied(await commit("alice", sharedPlanWrite(ID, { serverTime: false, extra: { createdAt: { timestampValue: "2026-10-30T12:00:00Z" } } })));
  denied(await commit("alice", sharedPlanWrite(ID, { v: int(2) })));
  denied(await commit("alice", sharedPlanWrite(ID, { v: str("1") })));
  denied(await commit("alice", sharedPlanWrite(ID, { plan: int(1) })));
  denied(await commit("alice", sharedPlanWrite(ID, { plan: str("") })));
  denied(await commit("alice", sharedPlanWrite(ID, { plan: str("ey!J9") })));
  denied(await commit("alice", sharedPlanWrite(ID, { plan: str(PLAN + "===") })));
});

test("create: denied unless the id is exactly 10 base62 chars", async () => {
  for (const id of ["Ab3dE5gH9", "Ab3dE5gH9kX", "Ab3dE5gH-k", "Ab3dE5gH_k", "Ab3dE5gH9%C3%A7"]) {
    denied(await commit("alice", sharedPlanWrite(id)));
  }
});

// ---- read ----

test("get: public (the site reads signed out), a missing id is a plain not found", async () => {
  allowed(await seed());
  const signedOut = await getDoc(null, `sharedPlans/${ID}`);
  allowed(signedOut);
  assert.equal(signedOut.body.fields.plan.stringValue, PLAN);
  assert.equal(signedOut.body.fields.ownerUid.stringValue, "alice");
  assert.ok(signedOut.body.fields.createdAt.timestampValue);
  allowed(await getDoc("bob", `sharedPlans/${ID}`));
  assert.equal((await getDoc(null, "sharedPlans/ZZZZZZZZZZ")).status, 404);
});

test("list: only the owner's own ownerUid query", async () => {
  allowed(await seed());
  allowed(await commit("owner", sharedPlanWrite("Bb3dE5gH9k", { ownerUid: str("bob") })));
  const mine = await listByOwner("alice", "alice");
  allowed(mine);
  assert.deepEqual(mine.body.filter((r) => r.document).map((r) => r.document.name.split("/").pop()), [ID]);
  denied(await listByOwner("alice", null));
  denied(await listByOwner("alice", "bob"));
  denied(await listByOwner(null, "alice"));
  denied(await listByOwner(null, null));
});

// ---- update / delete ----

test("update: never, not even by the owner", async () => {
  allowed(await seed());
  denied(await commit("alice", sharedPlanWrite(ID)));
  denied(await commit("alice", sharedPlanWrite(ID, { plan: str("eyJ4Ijox") })));
  denied(await commit("bob", sharedPlanWrite(ID, { ownerUid: str("bob") })));
  const r = await commit("alice", { update: { name: `${root}/sharedPlans/${ID}`, fields: { plan: str("eyJ4Ijox") } }, updateMask: { fieldPaths: ["plan"] } });
  denied(r);
});

test("delete: the owner only", async () => {
  allowed(await seed());
  denied(await remove(null, `sharedPlans/${ID}`));
  denied(await remove("bob", `sharedPlans/${ID}`));
  allowed(await remove("alice", `sharedPlans/${ID}`));
  assert.equal((await getDoc(null, `sharedPlans/${ID}`)).status, 404);
});

// ---- the rest of the rules, unchanged ----

test("users/{uid}/** stays its owner's only", async () => {
  const prefs = { update: { name: `${root}/users/alice/prefs/app`, fields: { theme: str("dark") } } };
  allowed(await commit("alice", prefs));
  allowed(await getDoc("alice", "users/alice/prefs/app"));
  denied(await getDoc("bob", "users/alice/prefs/app"));
  denied(await getDoc(null, "users/alice/prefs/app"));
  denied(await commit("bob", prefs));
});

test("config/featureFlags: read signed in, write admin only", async () => {
  allowed(await commit("owner", { update: { name: `${root}/config/featureFlags`, fields: { profile: { booleanValue: true } } } }));
  allowed(await getDoc("alice", "config/featureFlags"));
  denied(await getDoc(null, "config/featureFlags"));
  denied(await commit("alice", { update: { name: `${root}/config/featureFlags`, fields: { profile: { booleanValue: false } } } }));
});
