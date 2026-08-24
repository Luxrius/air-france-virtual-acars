import { contextBridge, ipcRenderer } from "electron";
import { TelemetrySample, ConnectionStatus } from "./shared/telemetry-types";

const telemetryApi = {
  connect: (mode: "simconnect" | "mock"): Promise<void> => ipcRenderer.invoke("telemetry:connect", mode),
  disconnect: (): Promise<void> => ipcRenderer.invoke("telemetry:disconnect"),
  getStatus: (): Promise<ConnectionStatus> => ipcRenderer.invoke("telemetry:status"),
  onTick: (cb: (sample: TelemetrySample) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, sample: TelemetrySample) => cb(sample);
    ipcRenderer.on("telemetry:tick", listener);
    return () => ipcRenderer.removeListener("telemetry:tick", listener);
  },
  onStatusChange: (cb: (status: ConnectionStatus) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, status: ConnectionStatus) => cb(status);
    ipcRenderer.on("telemetry:status-changed", listener);
    return () => ipcRenderer.removeListener("telemetry:status-changed", listener);
  },
};

contextBridge.exposeInMainWorld("telemetry", telemetryApi);

export type TelemetryApi = typeof telemetryApi;

// The AFV Installer launcher, when it launches this app on behalf of an
// already-signed-in pilot, passes their email as a plain launch argument so
// the login screen can be pre-filled — never a password or token, so there's
// nothing sensitive in this handoff. Falls back to null when run any other
// way (built .exe double-clicked directly, npm start, etc.).
const prefillEmailArg = process.argv.find((arg) => arg.startsWith("--prefill-email="));
const launchApi = {
  prefillEmail: prefillEmailArg ? decodeURIComponent(prefillEmailArg.slice("--prefill-email=".length)) : null,
};

contextBridge.exposeInMainWorld("launch", launchApi);

export type LaunchApi = typeof launchApi;
