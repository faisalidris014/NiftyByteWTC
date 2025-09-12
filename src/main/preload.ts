import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Example method that can be called from renderer
  sendMessage: (message: string) => ipcRenderer.invoke('send-message', message),
});

// Types for the exposed API
declare global {
  interface Window {
    electronAPI: {
      sendMessage: (message: string) => Promise<void>;
    };
  }
}