import { contextBridge, ipcRenderer } from 'electron';
import type { FeedbackInput, FeedbackAnalyticsSummary } from '../types/feedback';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // App version
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('get-app-version'),
  
  // Window management
  minimizeToTray: (): Promise<void> => ipcRenderer.invoke('minimize-to-tray'),
  restoreFromTray: (): Promise<void> => ipcRenderer.invoke('restore-from-tray'),

  // Feedback analytics
  submitFeedback: (payload: FeedbackInput): Promise<FeedbackAnalyticsSummary> => ipcRenderer.invoke('feedback:submit', payload),
  getFeedbackSummary: (): Promise<FeedbackAnalyticsSummary> => ipcRenderer.invoke('feedback:summary'),
  exportFeedbackCsv: (): Promise<string> => ipcRenderer.invoke('feedback:export'),
});

// Type definitions for the exposed API
declare global {
interface Window {
  electronAPI: {
      getAppVersion: () => Promise<string>;
      minimizeToTray: () => Promise<void>;
      restoreFromTray: () => Promise<void>;
      submitFeedback: (payload: FeedbackInput) => Promise<FeedbackAnalyticsSummary>;
      getFeedbackSummary: () => Promise<FeedbackAnalyticsSummary>;
      exportFeedbackCsv: () => Promise<string>;
    };
  }
}

export type FeedbackPayload = FeedbackInput;
export type FeedbackSummary = FeedbackAnalyticsSummary;
