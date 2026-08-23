import { collection, doc, serverTimestamp, writeBatch } from "firebase/firestore";
import { db } from "./firebase";
import { AcarsPirepDocument } from "../shared/pirep-schema";
import { TelemetrySample } from "../shared/telemetry-types";

const TELEMETRY_CHUNK_SIZE = 800;

// Firestore doesn't allow an array field to contain nested arrays, so each
// sample is a small map rather than a tuple.
function toCompactSample(s: TelemetrySample) {
  return {
    t: s.timestamp,
    lat: round(s.lat, 5),
    lon: round(s.lon, 5),
    altMsl: round(s.altMslFt),
    altAgl: round(s.altAglFt),
    gs: round(s.groundSpeedKt),
    vs: round(s.verticalSpeedFpm),
    hdg: round(s.headingDeg),
    fuel: round(s.fuelTotalKg),
  };
}

function round(n: number, decimals = 0): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

/**
 * Writes the pirep doc plus its telemetry subcollection (chunked to stay
 * well under Firestore's 1MiB/doc limit even on long-haul flights) in a
 * single batch. Returns the new pirep's id.
 */
export async function submitAcarsPirep(
  pirep: AcarsPirepDocument,
  telemetryFull: TelemetrySample[],
  approachHighRes: TelemetrySample[]
): Promise<string> {
  const pirepRef = doc(collection(db, "pireps"));
  const batch = writeBatch(db);

  batch.set(pirepRef, {
    ...pirep,
    submittedAt: serverTimestamp(),
    reviewedAt: null,
    reviewedBy: null,
  });

  for (let i = 0; i < telemetryFull.length; i += TELEMETRY_CHUNK_SIZE) {
    const chunk = telemetryFull.slice(i, i + TELEMETRY_CHUNK_SIZE).map(toCompactSample);
    const chunkRef = doc(collection(db, "pireps", pirepRef.id, "telemetry"), `chunk_${i / TELEMETRY_CHUNK_SIZE}`);
    batch.set(chunkRef, { pilotUid: pirep.pilotUid, samples: chunk });
  }

  if (approachHighRes.length > 0) {
    const approachRef = doc(collection(db, "pireps", pirepRef.id, "telemetry"), "approach");
    batch.set(approachRef, { pilotUid: pirep.pilotUid, samples: approachHighRes.map(toCompactSample) });
  }

  await batch.commit();
  return pirepRef.id;
}
