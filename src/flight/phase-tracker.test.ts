import { describe, expect, it } from "vitest";
import { FlightPhaseTracker } from "./phase-tracker";
import { TelemetrySample } from "../shared/telemetry-types";

function sample(overrides: Partial<TelemetrySample>): TelemetrySample {
  return {
    timestamp: 0,
    lat: 49,
    lon: 2.5,
    altMslFt: 400,
    altAglFt: 0,
    groundSpeedKt: 0,
    verticalSpeedFpm: 0,
    headingDeg: 90,
    onGround: true,
    fuelTotalKg: 10000,
    simRate: 1,
    paused: false,
    engine1Combustion: false,
    engine2Combustion: false,
    atcId: "AFR008",
    ...overrides,
  };
}

describe("FlightPhaseTracker", () => {
  it("stays in PREFLIGHT until an engine starts on the ground", () => {
    const tracker = new FlightPhaseTracker();
    tracker.process(sample({}));
    expect(tracker.phase).toBe("PREFLIGHT");
  });

  it("walks through a full flight in order and captures landing rate", () => {
    const tracker = new FlightPhaseTracker();
    let t = 0;
    const tick = (overrides: Partial<TelemetrySample>) =>
      tracker.process(sample({ timestamp: (t += 1) * 1000, ...overrides }));

    expect(tick({}).phase).toBe("PREFLIGHT");

    // Engines start -> taxi out
    expect(tick({ engine1Combustion: true, engine2Combustion: true }).phase).toBe("TAXI_OUT");
    expect(tick({ engine1Combustion: true, engine2Combustion: true, groundSpeedKt: 15 }).phase).toBe(
      "TAXI_OUT"
    );

    // Rotate -> airborne -> TAKEOFF
    expect(
      tick({
        engine1Combustion: true,
        engine2Combustion: true,
        onGround: false,
        altAglFt: 50,
        groundSpeedKt: 140,
        verticalSpeedFpm: 1500,
      }).phase
    ).toBe("TAKEOFF");

    // Climbs through 500ft AGL -> CLIMB
    expect(
      tick({
        engine1Combustion: true,
        engine2Combustion: true,
        onGround: false,
        altAglFt: 800,
        verticalSpeedFpm: 1800,
      }).phase
    ).toBe("CLIMB");

    // Levels off -> CRUISE
    expect(
      tick({
        engine1Combustion: true,
        engine2Combustion: true,
        onGround: false,
        altAglFt: 36000,
        altMslFt: 36000,
        verticalSpeedFpm: 0,
      }).phase
    ).toBe("CRUISE");

    // Starts down -> DESCENT
    expect(
      tick({
        engine1Combustion: true,
        engine2Combustion: true,
        onGround: false,
        altAglFt: 20000,
        verticalSpeedFpm: -1500,
      }).phase
    ).toBe("DESCENT");

    // Below 3000ft AGL -> APPROACH
    expect(
      tick({
        engine1Combustion: true,
        engine2Combustion: true,
        onGround: false,
        altAglFt: 1500,
        verticalSpeedFpm: -700,
      }).phase
    ).toBe("APPROACH");

    // Touches down at -650fpm -> LANDING, rate captured from the sample just before touchdown
    const landingEvent = tick({
      engine1Combustion: true,
      engine2Combustion: true,
      onGround: true,
      altAglFt: 0,
      groundSpeedKt: 130,
      verticalSpeedFpm: -50,
    });
    expect(landingEvent.phase).toBe("LANDING");
    expect(landingEvent.landingRateFpm).toBe(-700);

    // Rolls out -> TAXI_IN
    expect(
      tick({ engine1Combustion: true, engine2Combustion: true, onGround: true, groundSpeedKt: 20 }).phase
    ).toBe("TAXI_IN");

    // Engines cut -> SHUTDOWN
    expect(tick({ onGround: true, groundSpeedKt: 0 }).phase).toBe("SHUTDOWN");

    // Stationary for a few ticks -> COMPLETE
    tick({ onGround: true, groundSpeedKt: 0 });
    tick({ onGround: true, groundSpeedKt: 0 });
    expect(tick({ onGround: true, groundSpeedKt: 0 }).phase).toBe("COMPLETE");
  });

  it("treats a rejected takeoff as returning to TAXI_OUT rather than LANDING", () => {
    const tracker = new FlightPhaseTracker();
    tracker.process(sample({ engine1Combustion: true, onGround: true }));
    tracker.process(
      sample({ engine1Combustion: true, onGround: false, altAglFt: 20, groundSpeedKt: 100 })
    );
    expect(tracker.phase).toBe("TAKEOFF");
    const event = tracker.process(
      sample({ engine1Combustion: true, onGround: true, groundSpeedKt: 90 })
    );
    expect(event.phase).toBe("TAXI_OUT");
    expect(event.landingRateFpm).toBeUndefined();
  });

  it("does not register a landing before ever having been airborne", () => {
    const tracker = new FlightPhaseTracker();
    const event = tracker.process(sample({ onGround: true }));
    expect(event.phase).toBe("PREFLIGHT");
    expect(event.landingRateFpm).toBeUndefined();
  });
});
