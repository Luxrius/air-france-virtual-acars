import { collection, getDocs, orderBy, query, where } from "firebase/firestore";
import { db } from "./firebase";
import { Booking } from "../shared/pirep-schema";

// Same query shape as the web portal's getPilotBookings().
export async function getPilotBookings(pilotUid: string): Promise<Booking[]> {
  const q = query(collection(db, "bookings"), where("pilotUid", "==", pilotUid), orderBy("scheduledAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Booking);
}
