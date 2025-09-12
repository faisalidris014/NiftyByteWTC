import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // App version
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('get-app-version'),
  
  // Window management
  minimizeToTray: (): Promise<void> => ipcRenderer.invoke('minimize-to-tray'),
  restoreFromTray: (): Promise<void> => ipcRenderer.invoke('restore-from-tray'),
  
  // Add more IPC methods as needed for your application
  // Example: runSkill, submitTicket, etc.
});

// Type definitions for the exposed API
declare global {
  interface Window {
    electronAPI: {
      getAppVersion: () => Promise<string>;
      minimizeToTray: () => Promise<void>;
      restoreFromTray: () => Promise<void>;
    };
  }
}