// Thin, stateless Firestore accessors. Every function here takes a uid and
// plain arguments, and returns raw data or void. Nothing here reads `state`,
// touches the DOM, or calls setSync — that all stays in the orchestrators
// in main.js.
import {
  doc, setDoc, getDoc, collection, getDocs, addDoc, deleteDoc,
  query, orderBy, limit as fsLimit, where, startAfter
} from "firebase/firestore";
import { db } from "./firebase.js";

// ---- prefs ----

export async function getPrefs(uid) {
  const snap = await getDoc(doc(db, "users", uid, "prefs", "app"));
  return snap.exists() ? snap.data() : null;
}
export async function setPrefs(uid, data) {
  await setDoc(doc(db, "users", uid, "prefs", "app"), data, { merge: true });
}
export async function getProfileDoc(uid) {
  const snap = await getDoc(doc(db, "users", uid, "prefs", "profile"));
  return snap.exists() ? snap.data() : null;
}
export async function setProfileDoc(uid, data) {
  await setDoc(doc(db, "users", uid, "prefs", "profile"), data, { merge: true });
}

// ---- sessions ----

function toPairs(snap) {
  const out = [];
  snap.forEach(d => out.push({ id: d.id, data: d.data() }));
  return out;
}

// Ordered by the `date` field, not documentId(): Firestore's automatic
// single-field index covers normal fields in both directions, but the
// automatic __name__ index is ascending only, so desc on documentId()
// demands an explicitly created index. A single orderBy with no where
// clause needs no composite index.
export async function fetchSessions(uid, limitN) {
  const q = query(
    collection(db, "users", uid, "sessions"),
    orderBy("date", "desc"),
    fsLimit(limitN)
  );
  const snap = await getDocs(q);
  const sessions = [];
  snap.forEach(d => sessions.push(d.data()));
  return { sessions, truncated: snap.size >= limitN };
}

// where("date", ...) + orderBy("date", ...) are on the same field, so this
// only needs the automatic single-field index — no composite index required.
export async function fetchSessionsSince(uid, sinceDate) {
  const q = query(
    collection(db, "users", uid, "sessions"),
    where("date", ">=", sinceDate),
    orderBy("date", "desc")
  );
  const snap = await getDocs(q);
  const sessions = [];
  snap.forEach(d => sessions.push(d.data()));
  return sessions;
}

// One page of sessions ordered by `date` desc, cursored by the `date` value
// of the last doc in the page (stateless — caller holds the cursor). Pages
// are keyed by the `date` field, same as fetchSessions/fetchSessionsSince, so
// no composite index is needed. If two sessions can ever share a `date`
// value, a pure date cursor can skip or repeat entries at a page boundary;
// this is only safe where date order (not exact pagination) is sufficient,
// which is what 5.2+ will rely on.
export async function fetchSessionsPage(uid, { limit, startAfterDate = null } = {}) {
  const clauses = [
    collection(db, "users", uid, "sessions"),
    orderBy("date", "desc")
  ];
  if (startAfterDate != null) clauses.push(startAfter(startAfterDate));
  clauses.push(fsLimit(limit));
  const q = query(...clauses);
  const snap = await getDocs(q);
  const sessions = [];
  snap.forEach(d => sessions.push(d.data()));
  const cursor = sessions.length ? sessions[sessions.length - 1].date : startAfterDate;
  return { sessions, cursor, done: sessions.length < limit };
}

// Unbounded, undordered — only for the full-account data export.
export async function fetchAllSessionsRaw(uid) {
  const snap = await getDocs(collection(db, "users", uid, "sessions"));
  return toPairs(snap);
}

export async function getSessionDoc(uid, id) {
  const snap = await getDoc(doc(db, "users", uid, "sessions", id));
  return snap.exists() ? snap.data() : null;
}
export async function putSessionDoc(uid, id, data) {
  await setDoc(doc(db, "users", uid, "sessions", id), data, { merge: true });
}

// ---- exercises ----

export async function fetchExercises(uid) {
  const snap = await getDocs(collection(db, "users", uid, "exercises"));
  return toPairs(snap);
}
export async function putExercise(uid, docId, data) {
  await setDoc(doc(db, "users", uid, "exercises", docId), data, { merge: true });
}
export async function addExercise(uid, data) {
  const ref = await addDoc(collection(db, "users", uid, "exercises"), data);
  return ref.id;
}
export async function deleteExercise(uid, docId) {
  await deleteDoc(doc(db, "users", uid, "exercises", docId));
}

// ---- day customizations ----

export async function fetchDayCustomizations(uid) {
  const snap = await getDocs(collection(db, "users", uid, "days"));
  return toPairs(snap);
}
export async function putDayCustomization(uid, dayKey, data) {
  await setDoc(doc(db, "users", uid, "days", String(dayKey)), data, { merge: true });
}
export async function deleteDayCustomization(uid, dayKey) {
  await deleteDoc(doc(db, "users", uid, "days", String(dayKey)));
}

// ---- plans ----

export async function fetchPlans(uid) {
  const snap = await getDocs(collection(db, "users", uid, "plans"));
  return toPairs(snap);
}
export async function putPlan(uid, docId, data) {
  await setDoc(doc(db, "users", uid, "plans", docId), data, { merge: true });
}
export async function addPlan(uid, data) {
  const ref = await addDoc(collection(db, "users", uid, "plans"), data);
  return ref.id;
}
export async function deletePlan(uid, docId) {
  await deleteDoc(doc(db, "users", uid, "plans", docId));
}
