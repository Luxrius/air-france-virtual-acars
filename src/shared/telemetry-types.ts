export interface TelemetrySample {
  timestamp: number;
  lat: number;
  lon: number;
  altMslFt: number;
  altAglFt: number;
  groundSpeedKt: number;
  verticalSpeedFpm: number;
  headingDeg: number;
  onGround: boolean;
  fuelTotalKg: number;
  simRate: number;
  paused: boolean;
  engine1Combustion: boolean;
  engine2Combustion: boolean;
  atcId: string | null;
}

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export interface TelemetrySource {
  connect(): Promise<void>;
  onSample(cb: (sample: TelemetrySample) => void): void;
  onDisconnect(cb: () => void): void;
  disconnect(): void;
}
