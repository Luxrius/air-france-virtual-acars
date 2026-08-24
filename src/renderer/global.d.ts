import type { TelemetryApi, LaunchApi } from "../preload";

declare global {
  interface Window {
    telemetry: TelemetryApi;
    launch: LaunchApi;
  }
}

export {};
