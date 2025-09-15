import { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage } from 'electron';
import * as path from 'path';

// Keep a global reference of the window and tray objects
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

// IPC channel handlers
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('minimize-to-tray', () => {
  if (mainWindow) {
    mainWindow.hide();
  }
});

ipcMain.handle('restore-from-tray', () => {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
});

function createWindow(): void {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 400,
    height: 600,
    show: false, // Don't show until ready
    resizable: true,
    minimizable: true,
    maximizable: false,
    fullscreenable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    titleBarStyle: 'hiddenInset',
    frame: true,
    skipTaskbar: true // Don't show in taskbar, only in system tray
  });

  // Load the app
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Hide the window when closed instead of quitting
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    // Don't show immediately on startup - only when user clicks tray
  });

  // Handle window focus
  mainWindow.on('blur', () => {
    // Optionally hide window when it loses focus
    // mainWindow?.hide();
  });
}

function createTray(): void {
  // Create a simple tray icon (in production, use a proper icon file)
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  let trayIcon: Electron.NativeImage;
  
  try {
    trayIcon = nativeImage.createFromPath(iconPath);
  } catch {
    // Fallback to a simple colored icon if file doesn't exist
    trayIcon = nativeImage.createFromBuffer(Buffer.from(
      '<svg width="16" height="16" xmlns="http://www.w3.org/2000/svg"><rect width="16" height="16" fill="#0078d4"/><text x="8" y="12" text-anchor="middle" fill="white" font-size="12">WTC</text></svg>',
      'utf8'
    ));
  }

  tray = new Tray(trayIcon.resize({ width: 16, height: 16 }));
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Troubleshooter',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    {
      label: 'About',
      click: () => {
        // Show about dialog
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  tray.setToolTip('Windows Troubleshooting Companion');

  // Handle tray click (show/hide window)
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });

  // Handle double click
  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  createWindow();
  createTray();

  app.on('activate', () => {
    // On macOS, re-create window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle app quitting
app.on('before-quit', () => {
  isQuitting = true;
});

// Security: Prevent navigation to external URLs
app.on('web-contents-created', (event, contents) => {
  contents.on('will-navigate', (navigationEvent, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    
    if (parsedUrl.origin !== 'file://') {
      navigationEvent.preventDefault();
    }
  });
});