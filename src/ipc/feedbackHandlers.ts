import { ipcMain } from 'electron';
import { FeedbackService, FeedbackInput } from '../analytics/FeedbackService';

export function registerFeedbackHandlers(service: FeedbackService): void {
  ipcMain.handle('feedback:submit', async (_event, payload: FeedbackInput) => {
    return service.submitFeedback(payload);
  });

  ipcMain.handle('feedback:summary', async () => {
    return service.getSummary();
  });

  ipcMain.handle('feedback:export', async () => {
    return service.exportCsv();
  });
}
