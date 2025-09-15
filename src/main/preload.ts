import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Example method that can be called from renderer
  sendMessage: (message: string) => ipcRenderer.invoke('send-message', message),

  // Admin authentication API
  authenticateAdmin: (username: string, password: string) =>
    ipcRenderer.invoke('authenticate-admin', username, password),

  checkAdminSession: () =>
    ipcRenderer.invoke('check-admin-session'),

  logoutAdmin: () =>
    ipcRenderer.invoke('logout-admin'),

  changeAdminPassword: (username: string, currentPassword: string, newPassword: string) =>
    ipcRenderer.invoke('change-admin-password', username, currentPassword, newPassword)
});

// Types for the exposed API
declare global {
  interface Window {
    electronAPI: {
      sendMessage: (message: string) => Promise<void>;

      // Admin authentication API
      authenticateAdmin: (username: string, password: string) => Promise<{
        success: boolean;
        user?: {
          id: string;
          username: string;
          role: string;
          permissions: string[];
        };
        error?: string;
        sessionToken?: string;
      }>;

      checkAdminSession: () => Promise<{
        valid: boolean;
        user?: {
          id: string;
          username: string;
          role: string;
          permissions: string[];
        };
      }>;

      logoutAdmin: () => Promise<void>;

      changeAdminPassword: (username: string, currentPassword: string, newPassword: string) => Promise<{
        success: boolean;
        user?: {
          id: string;
          username: string;
          role: string;
          permissions: string[];
        };
        error?: string;
      }>;
    };
  }
}