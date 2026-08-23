// One-off manual verification script (not part of the app or the vitest
// suite). Runs a full mock flight through the real FlightSession/state
// machine, builds a real AcarsPirepDocument, and writes it (plus telemetry
// subcollection chunks) to the actual Firebase project the app targets —
// then reads it back and deletes it. Exists because this dev machine can't
// run MSFS/SimConnect; this is the strongest available substitute for a
// live end-to-end test. Run with:
//   node --env-file=.env scripts/verify-mock-flight.ts <email> <password>

import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import {
  getFirestore,
  doc,
  getDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  where,
  writeBatch,
  serverTimestamp,
} from "firebase/firestore";
import { FlightSession } from "../src/flight/flight-session";
import { MockTelemetrySource } from "../src/telemetry/MockTelemetrySource";
import { buildAcarsPirep, FlightSetup } from "../src/renderer/pirep-builder";
import { TelemetrySample } from "../src/shared/telemetry-types";

const app = initializeApp({
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
});
const auth = getAuth(app);
const db = getFirestore(app);

async function main() {
  const [email, password, flag] = process.argv.slice(2);
  const keep = flag === "--keep";
  if (!email || !password) {
    console.error("Usage: node --env-file=.env scripts/verify-mock-flight.ts <email> <password> [--keep]");
    process.exit(1);
  }

  console.log("Signing in...");
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const pilotSnap = await getDoc(doc(db, "pilots", cred.user.uid));
  if (!pilotSnap.exists()) throw new Error("No pilot doc for this account");
  const pilot = pilotSnap.data() as { uid: string; pilotId: string; displayName: string };
  console.log(`Signed in as ${pilot.displayName} (${pilot.pilotId})`);

  const setup: FlightSetup = {
    pilotUid: pilot.uid,
    pilotId: pilot.pilotId,
    pilotName: pilot.displayName,
    routeId: "af1680",
    flightNumber: "AF1680",
    departureIcao: "LFPG",
    arrivalIcao: "EGLL",
    aircraftType: "A220",
    network: "Offline",
    requiredReserveKg: 300,
    paxCount: 120,
    cargoKg: 800,
    remarks: "Automated verification run (mock flight) — safe to delete.",
  };

  console.log("Running mock flight (this takes ~30s)...");
  const session = new FlightSession(185); // CDG-LHR distance
  const source = new MockTelemetrySource();

  const completed = await new Promise<boolean>((resolve) => {
    source.onSample((sample: TelemetrySample) => {
      const event = session.process(sample);
      process.stdout.write(`\r  phase: ${event.phase.padEnd(10)} alt: ${Math.round(sample.altMslFt)}ft   `);
      if (event.phase === "COMPLETE") resolve(true);
    });
    source.onDisconnect(() => resolve(false));
    source.connect();
  });
  console.log();

  if (!completed) throw new Error("Mock flight ended without reaching COMPLETE");

  const result = session.finalize();
  console.log("Flight session result:", {
    blockTimeMinutes: result.blockTimeMinutes.toFixed(1),
    flightTimeMinutes: result.flightTimeMinutes.toFixed(1),
    landingRateFpm: result.landingRateFpm.toFixed(0),
    fuelUsedKg: result.fuelUsedKg.toFixed(0),
    telemetryPoints: result.telemetryFull.length,
    approachPoints: result.approachHighRes.length,
    cheatFlags: result.cheatFlags,
  });

  const pirep = buildAcarsPirep(setup, result, true);
  console.log("Writing PIREP to Firestore...");

  const pirepRef = doc(collection(db, "pireps"));
  const batch = writeBatch(db);
  batch.set(pirepRef, { ...pirep, submittedAt: serverTimestamp(), reviewedAt: null, reviewedBy: null });
  const toPoint = (s: TelemetrySample) => ({ t: s.timestamp, lat: s.lat, lon: s.lon, altMsl: s.altMslFt, gs: s.groundSpeedKt });
  const CHUNK = 800;
  for (let i = 0; i < result.telemetryFull.length; i += CHUNK) {
    const chunk = result.telemetryFull.slice(i, i + CHUNK).map(toPoint);
    batch.set(doc(collection(db, "pireps", pirepRef.id, "telemetry"), `chunk_${i / CHUNK}`), {
      pilotUid: pirep.pilotUid,
      samples: chunk,
    });
  }
  if (result.approachHighRes.length > 0) {
    const approach = result.approachHighRes.map(toPoint);
    batch.set(doc(collection(db, "pireps", pirepRef.id, "telemetry"), "approach"), {
      pilotUid: pirep.pilotUid,
      samples: approach,
    });
  }
  await batch.commit();
  console.log(`Written: pireps/${pirepRef.id}`);

  console.log("Reading it back...");
  const readBack = await getDoc(pirepRef);
  console.log("Read back OK:", {
    exists: readBack.exists(),
    source: readBack.data()?.source,
    status: readBack.data()?.status,
    pointsAwarded: readBack.data()?.pointsAwarded,
    telemetrySummaryLength: readBack.data()?.telemetrySummary?.length,
  });
  // A plain unconstrained collection list would be rejected by
  // firestore.rules for a non-admin reader (the rule's ownership check
  // depends on resource.data, which Firestore requires a matching `where`
  // for on list operations) — filter on pilotUid to match.
  const telemetrySnap = await getDocs(
    query(collection(db, "pireps", pirepRef.id, "telemetry"), where("pilotUid", "==", pilot.uid))
  );
  console.log(`Telemetry subcollection docs: ${telemetrySnap.size}`);

  if (keep) {
    console.log(`Kept pireps/${pirepRef.id} for manual inspection (pass no --keep flag to auto-clean next time).`);
  } else {
    console.log("Cleaning up test doc...");
    await Promise.all(telemetrySnap.docs.map((d) => deleteDoc(d.ref)));
    await deleteDoc(pirepRef);
    console.log("Done — verification PIREP deleted.");
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
