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
