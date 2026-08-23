// Mirrors the web portal's src/types/index.ts Pirep/Pilot/Booking/Route
// shapes exactly, plus the ACARS-only extensions this client adds. The
// portal's Firestore rules only check `pilotUid` and `status` on create,
// so these extra fields pass through without a rules change; the portal's
// admin UI silently ignores fields it doesn't render.

import { AcarsDeduction } from "./acars-scoring";

export type AircraftType = "A220" | "A320neo" | "A350" | "B777" | "B787";
export type NetworkUsed = "VATSIM" | "IVAO" | "Offline";
export type PirepStatus = "pending" | "approved" | "rejected";

export interface CheatFlags {
  simRateFlag: boolean;
  pauseFlag: boolean;
  pausedDurationSeconds: number;
  distanceMismatchFlag: boolean;
  distanceFlownNm: number;
}

/** What this client writes to `pireps/{id}`, matching NewPirepInput plus
 * the ACARS-only fields (flightTimeMinutes, source, cheatFlags,
 * networkUnverified, telemetry summary) and what submitPirep() itself
 * would add server-side-equivalent (status/submittedAt/reviewedAt/etc). */
export interface AcarsPirepDocument {
  pilotUid: string;
  pilotId: string;
  pilotName: string;
  routeId: string | null;
  flightNumber: string;
  departureIcao: string;
  arrivalIcao: string;
  aircraftType: AircraftType;
  blockTimeMinutes: number;
  flightTimeMinutes: number;
  fuelUsedKg: number;
  landingRateFpm: number;
  maxTaxiSpeedKt: number;
  landingDistanceFromThresholdFt: number;
  fuelRemainingAtLandingKg: number;
  requiredReserveKg: number;
  paxCount: number;
  cargoKg: number;
  pointsAwarded: number;
  pointsDeductions: AcarsDeduction[];
  network: NetworkUsed;
  networkUnverified: boolean;
  remarks: string;
  status: PirepStatus;
  source: "acars";
  cheatFlags: CheatFlags;
  // Downsampled, capped ~500-point summary track for quick chart rendering
  // without reading the telemetry subcollection. Firestore doesn't allow
  // arrays to nest arrays, so each point is a small map, not a tuple.
  telemetrySummary: TelemetryPoint[];
}

export interface TelemetryPoint {
  t: number;
  lat: number;
  lon: number;
  altMsl: number;
  gs: number;
}

export interface Pilot {
  uid: string;
  pilotId: string;
  displayName: string;
  email: string;
  vatsimCid: string;
  homeHub: string;
  rank: string;
  totalHours: number;
  points: number;
  createdAt: string;
  role: "pilot" | "admin";
}

export interface Booking {
  id: string;
  pilotUid: string;
  routeId: string;
  aircraftType: AircraftType;
  scheduledAt: string;
  createdAt: string;
}

export interface RouteRef {
  id: string;
  flightNumber: string;
  departureIcao: string;
  departureLat: number;
  departureLon: number;
  arrivalIcao: string;
  arrivalLat: number;
  arrivalLon: number;
  distanceNm: number;
  aircraftTypes: AircraftType[];
}
