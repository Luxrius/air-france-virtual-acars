import { TelemetrySample } from "../shared/telemetry-types";
import { FlightPhase, FlightPhaseEvent, FlightPhaseTracker } from "./phase-tracker";
import { trackDistanceNm } from "../shared/great-circle";
import { CheatFlags, TelemetryPoint } from "../shared/pirep-schema";

const SNAPSHOT_INTERVAL_MS = 7500;
const TELEMETRY_SUMMARY_CAP = 500;
const APPROACH_HIGH_RES_WINDOW_S = 60;

export interface FlightSessionResult {
  blockTimeMinutes: number;
  flightTimeMinutes: number;
  landingRateFpm: number;
  fuelUsedKg: number;
  fuelRemainingAtLandingKg: number;
  maxTaxiSpeedKt: number;
  cheatFlags: CheatFlags;
  telemetrySummary: TelemetryPoint[];
  telemetryFull: TelemetrySample[];
  approachHighRes: TelemetrySample[];
}

/**
 * Accumulates state across an entire flight: wraps FlightPhaseTracker for
 * phase transitions, and separately tracks timing, fuel, taxi speed,
 * cheat/abuse signals, and the telemetry buffers used to build the PIREP.
 * Pure/deterministic given its input sample stream — no I/O.
 */
export class FlightSession {
  private tracker = new FlightPhaseTracker();

  private blockStartMs: number | null = null;
  private blockEndMs: number | null = null;
  private flightStartMs: number | null = null;
  private flightEndMs: number | null = null;

  private fuelAtBlockStartKg: number | null = null;
  private landingRateFpm = 0;
  private fuelRemainingAtLandingKg = 0;
  private maxTaxiSpeedKt = 0;

  private simRateFlag = false;
  private pauseFlag = false;
  private pausedDurationSeconds = 0;
  private lastSampleTimestamp: number | null = null;

  private lastSnapshotAt = -Infinity;
  private telemetryFull: TelemetrySample[] = [];
  private approachHighRes: TelemetrySample[] = [];

  private plannedRouteDistanceNm: number | null = null;

  constructor(plannedRouteDistanceNm?: number) {
    this.plannedRouteDistanceNm = plannedRouteDistanceNm ?? null;
  }

  get phase(): FlightPhase {
    return this.tracker.phase;
  }

  process(sample: TelemetrySample): FlightPhaseEvent {
    const event = this.tracker.process(sample);

    this.trackCheatSignals(sample);
    this.trackTiming(event);
    this.trackFuelAndTaxi(sample, event);
    this.bufferTelemetry(sample, event);

    this.lastSampleTimestamp = sample.timestamp;
    return event;
  }

  private trackCheatSignals(sample: TelemetrySample) {
    if (sample.simRate !== 1) this.simRateFlag = true;
    if (sample.paused) {
      this.pauseFlag = true;
      if (this.lastSampleTimestamp !== null) {
        this.pausedDurationSeconds += (sample.timestamp - this.lastSampleTimestamp) / 1000;
      }
    }
  }

  private trackTiming(event: FlightPhaseEvent) {
    if (event.previousPhase === "PREFLIGHT" && event.phase === "TAXI_OUT" && this.blockStartMs === null) {
      this.blockStartMs = event.sample.timestamp;
    }
    if (event.previousPhase === "TAXI_OUT" && event.phase === "TAKEOFF" && this.flightStartMs === null) {
      this.flightStartMs = event.sample.timestamp;
    }
    if (event.phase === "LANDING" && event.landingRateFpm !== undefined) {
      this.flightEndMs = event.sample.timestamp;
      this.landingRateFpm = event.landingRateFpm;
      this.fuelRemainingAtLandingKg = event.sample.fuelTotalKg;
    }
    if (event.previousPhase === "TAXI_IN" && event.phase === "SHUTDOWN" && this.blockEndMs === null) {
      this.blockEndMs = event.sample.timestamp;
    }
  }

  private trackFuelAndTaxi(sample: TelemetrySample, event: FlightPhaseEvent) {
    if (this.fuelAtBlockStartKg === null && (event.phase === "TAXI_OUT" || event.previousPhase === "TAXI_OUT")) {
      this.fuelAtBlockStartKg = sample.fuelTotalKg;
    }
    if ((event.phase === "TAXI_OUT" || event.phase === "TAXI_IN") && sample.groundSpeedKt > this.maxTaxiSpeedKt) {
      this.maxTaxiSpeedKt = sample.groundSpeedKt;
    }
  }

  private bufferTelemetry(sample: TelemetrySample, event: FlightPhaseEvent) {
    if (sample.timestamp - this.lastSnapshotAt >= SNAPSHOT_INTERVAL_MS) {
      this.telemetryFull.push(sample);
      this.lastSnapshotAt = sample.timestamp;
    }

    if (event.phase === "APPROACH" || event.phase === "LANDING") {
      this.approachHighRes.push(sample);
      const cutoffMs = sample.timestamp - APPROACH_HIGH_RES_WINDOW_S * 1000;
      while (this.approachHighRes.length > 0 && this.approachHighRes[0].timestamp < cutoffMs) {
        this.approachHighRes.shift();
      }
    }
  }

  /** Call once the session reaches COMPLETE. */
  finalize(): FlightSessionResult {
    const blockTimeMinutes =
      this.blockStartMs !== null && this.blockEndMs !== null
        ? (this.blockEndMs - this.blockStartMs) / 60000
        : 0;
    const flightTimeMinutes =
      this.flightStartMs !== null && this.flightEndMs !== null
        ? (this.flightEndMs - this.flightStartMs) / 60000
        : 0;
    const fuelUsedKg =
      this.fuelAtBlockStartKg !== null ? Math.max(0, this.fuelAtBlockStartKg - this.fuelRemainingAtLandingKg) : 0;

    const distanceFlownNm = trackDistanceNm(this.telemetryFull.map((s) => ({ lat: s.lat, lon: s.lon })));
    const distanceMismatchFlag = this.isDistanceMismatch(distanceFlownNm, flightTimeMinutes);

    return {
      blockTimeMinutes,
      flightTimeMinutes,
      landingRateFpm: this.landingRateFpm,
      fuelUsedKg,
      fuelRemainingAtLandingKg: this.fuelRemainingAtLandingKg,
      maxTaxiSpeedKt: this.maxTaxiSpeedKt,
      cheatFlags: {
        simRateFlag: this.simRateFlag,
        pauseFlag: this.pauseFlag,
        pausedDurationSeconds: Math.round(this.pausedDurationSeconds),
        distanceMismatchFlag,
        distanceFlownNm: Math.round(distanceFlownNm),
      },
      telemetrySummary: this.downsampleForSummary(this.telemetryFull),
      telemetryFull: this.telemetryFull,
      approachHighRes: this.approachHighRes,
    };
  }

  private isDistanceMismatch(distanceFlownNm: number, flightTimeMinutes: number): boolean {
    if (this.plannedRouteDistanceNm === null || flightTimeMinutes <= 0) return false;
    // A flight that covered noticeably less ground than the booked route,
    // relative to how long it was airborne, is worth a manual look —
    // this only sets a review flag, it never blocks submission.
    const coveredRatio = distanceFlownNm / this.plannedRouteDistanceNm;
    return coveredRatio < 0.5;
  }

  private downsampleForSummary(full: TelemetrySample[]): TelemetryPoint[] {
    const step = Math.max(1, Math.ceil(full.length / TELEMETRY_SUMMARY_CAP));
    const summary: TelemetryPoint[] = [];
    for (let i = 0; i < full.length; i += step) {
      const s = full[i];
      summary.push({
        t: s.timestamp,
        lat: s.lat,
        lon: s.lon,
        altMsl: Math.round(s.altMslFt),
        gs: Math.round(s.groundSpeedKt),
      });
    }
    return summary;
  }
}
