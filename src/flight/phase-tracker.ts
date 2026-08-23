import { TelemetrySample } from "../shared/telemetry-types";

export type FlightPhase =
  | "PREFLIGHT"
  | "TAXI_OUT"
  | "TAKEOFF"
  | "CLIMB"
  | "CRUISE"
  | "DESCENT"
  | "APPROACH"
  | "LANDING"
  | "TAXI_IN"
  | "SHUTDOWN"
  | "COMPLETE";

// Deliberately excludes TAKEOFF: touching back down while still in TAKEOFF
// is a rejected/aborted takeoff (handled by nextPhase's own TAXI_OUT
// fallback), not a landing.
const LANDING_ELIGIBLE_PHASES: FlightPhase[] = ["CLIMB", "CRUISE", "DESCENT", "APPROACH"];

const APPROACH_AGL_FT = 3000;
const CLIMB_VS_THRESHOLD_FPM = 300;
const DESCENT_VS_THRESHOLD_FPM = -300;
const TAKEOFF_TO_CLIMB_AGL_FT = 500;
const SHUTDOWN_STATIONARY_KT = 2;
const SHUTDOWN_CONFIRM_TICKS = 3;

export interface FlightPhaseEvent {
  phase: FlightPhase;
  previousPhase: FlightPhase;
  sample: TelemetrySample;
  /** Set only on the exact tick the phase transitions to LANDING. */
  landingRateFpm?: number;
}

/**
 * Pure, deterministic phase-transition tracker fed one TelemetrySample at a
 * time. No I/O, no timers — safe to unit test with a canned sample array.
 */
export class FlightPhaseTracker {
  phase: FlightPhase = "PREFLIGHT";

  private prevSample: TelemetrySample | null = null;
  private hasBeenAirborne = false;
  private stationaryTicksSinceEngineOff = 0;

  process(sample: TelemetrySample): FlightPhaseEvent {
    const previousPhase = this.phase;
    const engineRunning = sample.engine1Combustion || sample.engine2Combustion;
    let landingRateFpm: number | undefined;

    const justTouchedDown =
      this.prevSample !== null &&
      !this.prevSample.onGround &&
      sample.onGround &&
      this.hasBeenAirborne;

    if (justTouchedDown && LANDING_ELIGIBLE_PHASES.includes(this.phase)) {
      landingRateFpm = this.prevSample!.verticalSpeedFpm;
      this.phase = "LANDING";
    } else {
      this.phase = this.nextPhase(sample, engineRunning);
    }

    if (!sample.onGround) this.hasBeenAirborne = true;
    this.prevSample = sample;

    return { phase: this.phase, previousPhase, sample, landingRateFpm };
  }

  private nextPhase(sample: TelemetrySample, engineRunning: boolean): FlightPhase {
    switch (this.phase) {
      case "PREFLIGHT":
        return engineRunning && sample.onGround ? "TAXI_OUT" : "PREFLIGHT";

      case "TAXI_OUT":
        if (!sample.onGround) return "TAKEOFF";
        if (!engineRunning) return "SHUTDOWN";
        return "TAXI_OUT";

      case "TAKEOFF":
        if (sample.onGround) return "TAXI_OUT"; // rejected takeoff
        return sample.altAglFt > TAKEOFF_TO_CLIMB_AGL_FT ? "CLIMB" : "TAKEOFF";

      case "CLIMB":
        if (sample.verticalSpeedFpm < DESCENT_VS_THRESHOLD_FPM) return "DESCENT";
        if (Math.abs(sample.verticalSpeedFpm) < CLIMB_VS_THRESHOLD_FPM) return "CRUISE";
        return "CLIMB";

      case "CRUISE":
        return sample.verticalSpeedFpm < DESCENT_VS_THRESHOLD_FPM ? "DESCENT" : "CRUISE";

      case "DESCENT":
        if (sample.altAglFt <= APPROACH_AGL_FT) return "APPROACH";
        if (sample.verticalSpeedFpm > CLIMB_VS_THRESHOLD_FPM) return "CLIMB"; // go-around
        return "DESCENT";

      case "APPROACH":
        if (sample.verticalSpeedFpm > CLIMB_VS_THRESHOLD_FPM) return "CLIMB"; // go-around
        return "APPROACH";

      case "LANDING":
        return "TAXI_IN";

      case "TAXI_IN":
        return engineRunning ? "TAXI_IN" : "SHUTDOWN";

      case "SHUTDOWN":
        if (!engineRunning && sample.groundSpeedKt < SHUTDOWN_STATIONARY_KT) {
          this.stationaryTicksSinceEngineOff += 1;
          return this.stationaryTicksSinceEngineOff >= SHUTDOWN_CONFIRM_TICKS ? "COMPLETE" : "SHUTDOWN";
        }
        this.stationaryTicksSinceEngineOff = 0;
        return "SHUTDOWN";

      case "COMPLETE":
        return "COMPLETE";
    }
  }
}
