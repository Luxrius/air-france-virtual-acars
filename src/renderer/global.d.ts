import type { TelemetryApi } from "../preload";

declare global {
  interface Window {
    telemetry: TelemetryApi;
  }
}

export {};
