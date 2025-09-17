export const app = {
  getPath: (_name: string) => process.cwd()
};

export const ipcMain = {
  handle: jest.fn(),
  on: jest.fn()
};

export const BrowserWindow = function BrowserWindow(): void {
  // noop mock
};

export default { app };
