import { signInWithEmailAndPassword, onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./firebase";
import { Pilot } from "../shared/pirep-schema";

export function signIn(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email, password);
}

export function watchAuthState(cb: (user: User | null) => void) {
  return onAuthStateChanged(auth, cb);
}

export async function loadPilot(uid: string): Promise<Pilot | null> {
  const snap = await getDoc(doc(db, "pilots", uid));
  return snap.exists() ? (snap.data() as Pilot) : null;
}
