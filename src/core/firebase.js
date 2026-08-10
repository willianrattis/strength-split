import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCpq7zytWeXpjEhIFaiqHZKbODcM-ZYhKU",
  authDomain: "strength-split.firebaseapp.com",
  projectId: "strength-split",
  storageBucket: "strength-split.firebasestorage.app",
  messagingSenderId: "188488203799",
  appId: "1:188488203799:web:33f3ec2637257820436652",
  measurementId: "G-HP9J5WG1FY"
};
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});
export const provider = new GoogleAuthProvider();
