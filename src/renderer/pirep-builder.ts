import { AcarsPirepDocument, AircraftType, NetworkUsed } from "../shared/pirep-schema";
import { FlightSessionResult } from "../flight/flight-session";
import { computeAcarsDeductions } from "../shared/acars-scoring";

export interface FlightSetup {
  pilotUid: string;
  pilotId: string;
  pilotName: string;
  routeId: string | null;
  flightNumber: string;
  departureIcao: string;
  arrivalIcao: string;
  aircraftType: AircraftType;
  network: NetworkUsed;
  requiredReserveKg: number;
  paxCount: number;
  cargoKg: number;
  remarks: string;
}

/**
 * Landing distance from the runway threshold needs the airport/runway
 * facility position (not something SimConnect gives you without a
 * separate facility-data lookup, out of scope for this first pass — see
 * node-simconnect's facilities sample for how to extend this). Defaults
 * to 0 and is editable by the pilot on the completion-summary screen
 * before submitting, same as every other field there.
 */
const DEFAULT_LANDING_DISTANCE_FT = 0;

export function buildAcarsPirep(
  setup: FlightSetup,
  result: FlightSessionResult,
  networkVerified: boolean,
  landingDistanceFromThresholdFt: number = DEFAULT_LANDING_DISTANCE_FT
): AcarsPirepDocument {
  const metrics = {
    maxTaxiSpeedKt: Math.round(result.maxTaxiSpeedKt),
    landingDistanceFromThresholdFt: Math.round(landingDistanceFromThresholdFt),
    fuelRemainingAtLandingKg: Math.round(result.fuelRemainingAtLandingKg),
    requiredReserveKg: Math.round(setup.requiredReserveKg),
  };
  const { pointsAwarded, deductions } = computeAcarsDeductions(metrics);

  return {
    pilotUid: setup.pilotUid,
    pilotId: setup.pilotId,
    pilotName: setup.pilotName,
    routeId: setup.routeId,
    flightNumber: setup.flightNumber,
    departureIcao: setup.departureIcao,
    arrivalIcao: setup.arrivalIcao,
    aircraftType: setup.aircraftType,
    blockTimeMinutes: Math.round(result.blockTimeMinutes),
    flightTimeMinutes: Math.round(result.flightTimeMinutes),
    fuelUsedKg: Math.round(result.fuelUsedKg),
    landingRateFpm: Math.round(result.landingRateFpm),
    ...metrics,
    paxCount: setup.paxCount,
    cargoKg: setup.cargoKg,
    pointsAwarded,
    pointsDeductions: deductions,
    network: setup.network,
    networkUnverified: setup.network === "VATSIM" && !networkVerified,
    remarks: setup.remarks,
    status: "pending",
    source: "acars",
    cheatFlags: result.cheatFlags,
    telemetrySummary: result.telemetrySummary,
  };
}
