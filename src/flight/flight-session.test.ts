import { describe, expect, it } from "vitest";
import { FlightSession } from "./flight-session";
import { TelemetrySample } from "../shared/telemetry-types";

function sample(overrides: Partial<TelemetrySample>): TelemetrySample {
  return {
    timestamp: 0,
    lat: 49.0097,
    lon: 2.5479,
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

describe("FlightSession", () => {
  it("computes block time, flight time, fuel used, and landing rate across a full flight", () => {
    const session = new FlightSession(3167); // roughly CDG-JFK, for the distance check

    const engines = { engine1Combustion: true, engine2Combustion: true };
    const minutes = (n: number) => n * 60 * 1000;

    session.process(sample({ timestamp: 0 })); // PREFLIGHT
    session.process(sample({ timestamp: minutes(1), ...engines, fuelTotalKg: 9500 })); // engine start -> TAXI_OUT (block start)
    session.process(sample({ timestamp: minutes(10), ...engines, groundSpeedKt: 15 })); // taxiing

    session.process(
      sample({ timestamp: minutes(11), ...engines, onGround: false, altAglFt: 50, groundSpeedKt: 140, verticalSpeedFpm: 1500 })
    ); // TAKEOFF (flight start)

    session.process(
      sample({ timestamp: minutes(12), ...engines, onGround: false, altAglFt: 800, verticalSpeedFpm: 1800 })
    ); // CLIMB

    session.process(
      sample({
        timestamp: minutes(60),
        ...engines,
        onGround: false,
        altAglFt: 36000,
        altMslFt: 36000,
        verticalSpeedFpm: 0,
        lat: 45,
        lon: -30,
        fuelTotalKg: 6000,
      })
    ); // CRUISE, over the Atlantic

    session.process(
      sample({ timestamp: minutes(400), ...engines, onGround: false, altAglFt: 20000, verticalSpeedFpm: -1500, lat: 41, lon: -74 })
    ); // DESCENT

    session.process(
      sample({ timestamp: minutes(405), ...engines, onGround: false, altAglFt: 1500, verticalSpeedFpm: -700, lat: 40.7, lon: -73.9 })
    ); // APPROACH

    session.process(
      sample({
        timestamp: minutes(410),
        ...engines,
        onGround: true,
        altAglFt: 0,
        groundSpeedKt: 130,
        verticalSpeedFpm: -50,
        fuelTotalKg: 2000,
        lat: 40.6413,
        lon: -73.7781,
      })
    ); // LANDING (flight end, landing rate from previous sample's VS)

    session.process(sample({ timestamp: minutes(415), ...engines, onGround: true, groundSpeedKt: 20, fuelTotalKg: 2000 })); // TAXI_IN
    session.process(sample({ timestamp: minutes(420), onGround: true, groundSpeedKt: 0, fuelTotalKg: 1950 })); // SHUTDOWN (block end)
    session.process(sample({ timestamp: minutes(420.1), onGround: true, groundSpeedKt: 0 }));
    session.process(sample({ timestamp: minutes(420.2), onGround: true, groundSpeedKt: 0 }));
    const finalEvent = session.process(sample({ timestamp: minutes(420.3), onGround: true, groundSpeedKt: 0 }));

    expect(finalEvent.phase).toBe("COMPLETE");

    const result = session.finalize();

    expect(result.blockTimeMinutes).toBeCloseTo(419, 0); // engine start (1min) to shutdown (420min)
    expect(result.flightTimeMinutes).toBeCloseTo(399, 0); // wheels up (11min) to wheels down (410min)
    expect(result.landingRateFpm).toBe(-700);
    expect(result.fuelUsedKg).toBe(9500 - 2000);
    expect(result.fuelRemainingAtLandingKg).toBe(2000);
    expect(result.telemetryFull.length).toBeGreaterThan(0);
  });

  it("flags a flight that covered far less distance than the booked route", () => {
    // A short local pattern flight (touch-and-go style circuit) near a
    // fixed point — realistic enough to pass through CLIMB/APPROACH so it
    // registers as a genuine landing, but covers almost no ground distance
    // relative to the booked 3167nm route.
    const session = new FlightSession(3167);
    const engines = { engine1Combustion: true, engine2Combustion: true };

    session.process(sample({ timestamp: 0, ...engines }));
    session.process(sample({ timestamp: 60000, ...engines, onGround: false, altAglFt: 200, verticalSpeedFpm: 1500 }));
    session.process(sample({ timestamp: 120000, ...engines, onGround: false, altAglFt: 800, verticalSpeedFpm: 1500 }));
    session.process(
      sample({ timestamp: 180000, ...engines, onGround: false, altAglFt: 1500, verticalSpeedFpm: -700 })
    );
    session.process(
      sample({
        timestamp: 240000,
        ...engines,
        onGround: true,
        altAglFt: 0,
        verticalSpeedFpm: -300,
        groundSpeedKt: 100,
      })
    );
    session.process(sample({ timestamp: 300000, onGround: true, groundSpeedKt: 0 }));
    session.process(sample({ timestamp: 360000, onGround: true, groundSpeedKt: 0 }));
    session.process(sample({ timestamp: 420000, onGround: true, groundSpeedKt: 0 }));

    const result = session.finalize();
    expect(result.landingRateFpm).toBe(-700);
    expect(result.cheatFlags.distanceMismatchFlag).toBe(true);
  });
});
