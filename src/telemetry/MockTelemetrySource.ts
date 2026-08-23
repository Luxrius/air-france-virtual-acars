import { TelemetrySample, TelemetrySource } from "../shared/telemetry-types";

interface MockWaypoint {
  atSeconds: number;
  lat: number;
  lon: number;
  altMslFt: number;
  altAglFt: number;
  groundSpeedKt: number;
  verticalSpeedFpm: number;
  headingDeg: number;
  onGround: boolean;
  fuelTotalKg: number;
  engineOn: boolean;
}

/**
 * Scripted synthetic flight (a short CDG -> LHR hop, sped up) driving the
 * exact same TelemetrySample shape the real SimConnect source produces.
 * Lets the whole app — phase detection, PIREP assembly, Firestore write —
 * be exercised end-to-end without a running MSFS instance.
 */
export class MockTelemetrySource implements TelemetrySource {
  private timer: ReturnType<typeof setInterval> | null = null;
  private sampleCbs: ((s: TelemetrySample) => void)[] = [];
  private disconnectCbs: (() => void)[] = [];
  private startedAt = 0;
  private tickHz: number;
  private speedMultiplier: number;
  private waypoints: MockWaypoint[];

  constructor(options?: { tickHz?: number; speedMultiplier?: number }) {
    this.tickHz = options?.tickHz ?? 1;
    this.speedMultiplier = options?.speedMultiplier ?? 60; // 1 sim-second per real-second * 60 = a ~15min flight plays out in ~15s
    this.waypoints = buildDefaultFlightScript();
  }

  async connect(): Promise<void> {
    this.startedAt = Date.now();
    this.timer = setInterval(() => this.tick(), 1000 / this.tickHz);
  }

  onSample(cb: (sample: TelemetrySample) => void): void {
    this.sampleCbs.push(cb);
  }

  onDisconnect(cb: () => void): void {
    this.disconnectCbs.push(cb);
  }

  disconnect(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.disconnectCbs.forEach((cb) => cb());
  }

  private tick() {
    const elapsedRealS = (Date.now() - this.startedAt) / 1000;
    const simSeconds = elapsedRealS * this.speedMultiplier;

    const sample = interpolate(this.waypoints, simSeconds);
    if (!sample) {
      this.disconnect();
      return;
    }

    this.sampleCbs.forEach((cb) => cb(sample));
  }
}

function interpolate(waypoints: MockWaypoint[], atSeconds: number): TelemetrySample | null {
  if (atSeconds > waypoints[waypoints.length - 1].atSeconds) return null;

  let i = 0;
  while (i < waypoints.length - 1 && waypoints[i + 1].atSeconds < atSeconds) i++;
  const a = waypoints[i];
  const b = waypoints[Math.min(i + 1, waypoints.length - 1)];
  const span = b.atSeconds - a.atSeconds;
  const t = span > 0 ? Math.max(0, Math.min(1, (atSeconds - a.atSeconds) / span)) : 0;

  const lerp = (x: number, y: number) => x + (y - x) * t;

  return {
    timestamp: Date.now(),
    lat: lerp(a.lat, b.lat),
    lon: lerp(a.lon, b.lon),
    altMslFt: lerp(a.altMslFt, b.altMslFt),
    altAglFt: lerp(a.altAglFt, b.altAglFt),
    groundSpeedKt: lerp(a.groundSpeedKt, b.groundSpeedKt),
    verticalSpeedFpm: lerp(a.verticalSpeedFpm, b.verticalSpeedFpm),
    headingDeg: lerp(a.headingDeg, b.headingDeg),
    onGround: t < 0.5 ? a.onGround : b.onGround,
    fuelTotalKg: lerp(a.fuelTotalKg, b.fuelTotalKg),
    simRate: 1,
    paused: false,
    engine1Combustion: t < 0.5 ? a.engineOn : b.engineOn,
    engine2Combustion: t < 0.5 ? a.engineOn : b.engineOn,
    atcId: "AFR1680",
  };
}

function buildDefaultFlightScript(): MockWaypoint[] {
  // CDG (49.0097, 2.5479) -> LHR (51.4700, -0.4543), a short hop.
  return [
    { atSeconds: 0, lat: 49.0097, lon: 2.5479, altMslFt: 400, altAglFt: 0, groundSpeedKt: 0, verticalSpeedFpm: 0, headingDeg: 270, onGround: true, fuelTotalKg: 4200, engineOn: false },
    { atSeconds: 60, lat: 49.0097, lon: 2.5479, altMslFt: 400, altAglFt: 0, groundSpeedKt: 0, verticalSpeedFpm: 0, headingDeg: 270, onGround: true, fuelTotalKg: 4200, engineOn: true },
    { atSeconds: 300, lat: 49.011, lon: 2.545, altMslFt: 400, altAglFt: 0, groundSpeedKt: 18, verticalSpeedFpm: 0, headingDeg: 270, onGround: true, fuelTotalKg: 4100, engineOn: true },
    { atSeconds: 360, lat: 49.02, lon: 2.5, altMslFt: 600, altAglFt: 200, groundSpeedKt: 140, verticalSpeedFpm: 1800, headingDeg: 270, onGround: false, fuelTotalKg: 4050, engineOn: true },
    { atSeconds: 480, lat: 49.2, lon: 1.8, altMslFt: 15000, altAglFt: 14600, groundSpeedKt: 280, verticalSpeedFpm: 2200, headingDeg: 280, onGround: false, fuelTotalKg: 3800, engineOn: true },
    { atSeconds: 720, lat: 49.9, lon: 0.3, altMslFt: 34000, altAglFt: 33600, groundSpeedKt: 420, verticalSpeedFpm: 0, headingDeg: 290, onGround: false, fuelTotalKg: 3200, engineOn: true },
    { atSeconds: 1200, lat: 50.9, lon: -0.6, altMslFt: 34000, altAglFt: 33600, groundSpeedKt: 420, verticalSpeedFpm: 0, headingDeg: 300, onGround: false, fuelTotalKg: 2600, engineOn: true },
    { atSeconds: 1500, lat: 51.2, lon: -0.55, altMslFt: 18000, altAglFt: 17600, groundSpeedKt: 320, verticalSpeedFpm: -1800, headingDeg: 300, onGround: false, fuelTotalKg: 2300, engineOn: true },
    { atSeconds: 1680, lat: 51.35, lon: -0.5, altMslFt: 2500, altAglFt: 2100, groundSpeedKt: 210, verticalSpeedFpm: -700, headingDeg: 300, onGround: false, fuelTotalKg: 2150, engineOn: true },
    { atSeconds: 1740, lat: 51.42, lon: -0.48, altMslFt: 700, altAglFt: 300, groundSpeedKt: 160, verticalSpeedFpm: -650, headingDeg: 300, onGround: false, fuelTotalKg: 2100, engineOn: true },
    { atSeconds: 1770, lat: 51.4700, lon: -0.4543, altMslFt: 80, altAglFt: 0, groundSpeedKt: 135, verticalSpeedFpm: -180, headingDeg: 300, onGround: true, fuelTotalKg: 2080, engineOn: true },
    { atSeconds: 1830, lat: 51.4700, lon: -0.4543, altMslFt: 80, altAglFt: 0, groundSpeedKt: 15, verticalSpeedFpm: 0, headingDeg: 300, onGround: true, fuelTotalKg: 2050, engineOn: true },
    { atSeconds: 1920, lat: 51.4700, lon: -0.4543, altMslFt: 80, altAglFt: 0, groundSpeedKt: 0, verticalSpeedFpm: 0, headingDeg: 300, onGround: true, fuelTotalKg: 2020, engineOn: false },
    // A few extra stationary, engines-off waypoints so real-time ticks
    // (spaced `speedMultiplier` sim-seconds apart) have enough samples to
    // satisfy SHUTDOWN's consecutive-stationary-tick threshold before the
    // script runs out and the source disconnects.
    { atSeconds: 2040, lat: 51.4700, lon: -0.4543, altMslFt: 80, altAglFt: 0, groundSpeedKt: 0, verticalSpeedFpm: 0, headingDeg: 300, onGround: true, fuelTotalKg: 2020, engineOn: false },
    { atSeconds: 2160, lat: 51.4700, lon: -0.4543, altMslFt: 80, altAglFt: 0, groundSpeedKt: 0, verticalSpeedFpm: 0, headingDeg: 300, onGround: true, fuelTotalKg: 2020, engineOn: false },
    { atSeconds: 2280, lat: 51.4700, lon: -0.4543, altMslFt: 80, altAglFt: 0, groundSpeedKt: 0, verticalSpeedFpm: 0, headingDeg: 300, onGround: true, fuelTotalKg: 2020, engineOn: false },
    { atSeconds: 2400, lat: 51.4700, lon: -0.4543, altMslFt: 80, altAglFt: 0, groundSpeedKt: 0, verticalSpeedFpm: 0, headingDeg: 300, onGround: true, fuelTotalKg: 2020, engineOn: false },
  ];
}
