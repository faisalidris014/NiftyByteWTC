import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as fs from 'fs';
import * as path from 'path';
import { initializeIPCHandlers, registerSkill } from '../ipc/mainHandlers';
import { initializeAuthHandlers, cleanupAuthHandlers } from '../ipc/adminAuthHandlers';
import { initializeSecurityIntegration, shutdownSecurityIntegration } from '../security/integration';

const isDev = process.env.NODE_ENV === 'development' || process.env.ELECTRON_IS_DEV === 'true';

// Keep a global reference of the window and tray objects
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let updateCheckInterval: NodeJS.Timeout | null = null;

// Application version
const APP_VERSION = '1.0.0';

interface UpdateChannelConfig {
  description?: string;
  allowPrerelease?: boolean;
}

interface UpdateConfig {
  feedURL?: string;
  defaultChannel?: string;
  channels?: Record<string, UpdateChannelConfig>;
  autoDownload?: boolean;
  checkOnStartup?: boolean;
  retryIntervalMinutes?: number;
}

function loadUpdateConfig(): UpdateConfig | null {
  const appPath = app.getAppPath();
  const candidatePaths = [
    path.join(appPath, 'config', 'update-config.json'),
    path.join(process.cwd(), 'config', 'update-config.json')
  ];

  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate)) {
      try {
        const raw = fs.readFileSync(candidate, 'utf-8');
        return JSON.parse(raw) as UpdateConfig;
      } catch (error) {
        console.error('Failed to parse update configuration:', error);
      }
    }
  }

  console.warn('Update configuration not found; skipping auto-update initialization');
  return null;
}

function initializeAutoUpdater(): void {
  if (isDev || process.platform !== 'win32') {
    return;
  }

  const config = loadUpdateConfig();
  if (!config) {
    return;
  }

  const channel = process.env.UPDATE_CHANNEL || config.defaultChannel || 'stable';
  const feedURL = process.env.UPDATE_FEED_URL || config.feedURL;
  const channelConfig = config.channels?.[channel];

  autoUpdater.autoDownload = config.autoDownload !== false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = channelConfig?.allowPrerelease ?? false;

  if (feedURL) {
    const channelUrl = `${feedURL.replace(/\/$/, '')}/${channel}`;
    autoUpdater.setFeedURL({ url: channelUrl, channel });
  }

  autoUpdater.on('checking-for-update', () => {
    console.log(`[updater] Checking for updates on channel "${channel}"`);
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[updater] Update available:', info.version);
  });

  autoUpdater.on('update-not-available', () => {
    console.log('[updater] No updates available');
  });

  autoUpdater.on('error', (error) => {
    console.error('[updater] Error during update process:', error);
  });

  autoUpdater.on('update-downloaded', () => {
    console.log('[updater] Update downloaded; will install on quit');
  });

  const scheduleCheck = () => {
    autoUpdater.checkForUpdates().catch((error) => {
      console.error('[updater] Failed to check for updates:', error);
    });
  };

  if (config.checkOnStartup !== false) {
    scheduleCheck();
  }

  const retryMinutes = Math.max(5, config.retryIntervalMinutes ?? 30);
  updateCheckInterval = setInterval(scheduleCheck, retryMinutes * 60 * 1000);
}

function createWindow(): void {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 400,
    height: 600,
    show: false, // Don't show until ready
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    icon: path.join(__dirname, '../../assets/icon.png'),
    title: 'Windows Troubleshooting Companion',
    resizable: true,
    minimizable: true,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true, // Don't show in taskbar, only in system tray
  });

  // Load the chat interface
  mainWindow.loadFile('src/chat.html');

  // Hide the window when closed instead of quitting
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    // Window will be shown when user clicks tray icon
  });

  // Handle window focus events
  mainWindow.on('blur', () => {
    // Optionally hide window when it loses focus
    // mainWindow?.hide();
  });
}

function createTray(): void {
  // Create tray icon
  const iconPath = path.join(__dirname, '../../assets/tray-icon.png');

  // Try to load the icon, fallback to empty image if not found
  let trayIcon;
  try {
    trayIcon = nativeImage.createFromPath(iconPath);
    if (trayIcon.isEmpty()) {
      throw new Error('Icon is empty');
    }
  } catch (error) {
    console.warn('Tray icon not found, using placeholder:', error instanceof Error ? error.message : String(error));
    // Create a simple placeholder icon
    trayIcon = nativeImage.createFromBuffer(Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAANCSURBVFiFtZdPaBNBFMafbDbZbJqmadrGtGmT1tTWWq1Wq1WrVfGgBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8ePHjw4MGDBw8e', 'base64'
    ), { width: 16, height: 16 });
  }

  // Create the tray
  tray = new Tray(trayIcon);
  tray.setToolTip('Windows Troubleshooting Companion');

  // Create context menu
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Chat',
      click: () => {
        showMainWindow();
      }
    },
    { type: 'separator' },
    {
      label: 'Settings',
      click: () => {
        openSettings();
      }
    },
    {
      label: 'About',
      click: () => {
        showAbout();
      }
    },
    { type: 'separator' },
    {
      label: 'Exit',
      click: () => {
        quitApp();
      }
    }
  ]);

  // Set context menu
  tray.setContextMenu(contextMenu);

  // Handle tray click (show/hide window)
  tray.on('click', () => {
    toggleMainWindow();
  });

  // Handle double click (same as single click)
  tray.on('double-click', () => {
    toggleMainWindow();
  });
}

function toggleMainWindow(): void {
  if (mainWindow && mainWindow.isVisible()) {
    mainWindow.hide();
  } else {
    showMainWindow();
  }
}

function showMainWindow(): void {
  if (!mainWindow) {
    createWindow();
  }

  // Show and focus the window
  mainWindow?.show();
  mainWindow?.focus();

  // Center the window on the screen
  mainWindow?.center();
}

function openSettings(): void {
  // TODO: Implement settings window
  console.log('Settings menu clicked');

  // For now, show a simple message
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.executeJavaScript(`
      alert('Settings functionality coming soon!');
    `);
  }
}

function showAbout(): void {
  // TODO: Implement about dialog
  console.log('About menu clicked');

  // Create a simple about dialog
  const aboutMenu = Menu.buildFromTemplate([
    {
      label: `Windows Troubleshooting Companion v${APP_VERSION}`,
      enabled: false
    },
    {
      label: 'Developed by NiftyByte',
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Close',
      click: () => {
        // Close the about dialog
      }
    }
  ]);

  // Show as popup menu near tray
  tray?.popUpContextMenu(aboutMenu);
}

function quitApp(): void {
  // Set quitting flag to prevent hiding on close
  isQuitting = true;

  // Clean up and quit
  if (mainWindow) {
    mainWindow.removeAllListeners('close');
    mainWindow.close();
  }

  // Remove tray
  if (tray) {
    tray.destroy();
  }

  app.quit();
}

// Register sample skills
function registerSampleSkills(): void {
  // Example skill: Get system information
  registerSkill('system-info', async () => {
    return JSON.stringify({
      platform: process.platform,
      arch: process.arch,
      version: process.version,
      uptime: process.uptime(),
      memory: process.memoryUsage()
    }, null, 2);
  });

  // Example skill: Echo test
  registerSkill('echo', async (params: Record<string, any>) => {
    return `Echo: ${JSON.stringify(params)}`;
  });
}

// App event handlers
app.whenReady().then(async () => {
  // Initialize security integration
  await initializeSecurityIntegration();

  // Initialize IPC handlers
  initializeIPCHandlers();

  // Initialize authentication handlers
  initializeAuthHandlers();

  // Register sample skills
  registerSampleSkills();

  // Configure auto-update channel handling
  initializeAutoUpdater();

  // Create tray and window
  createTray();
  createWindow();

  // On macOS, re-create window when dock icon is clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle app before-quit event
app.on('before-quit', (event) => {
  isQuitting = true;
});

// IPC handlers for communication with renderer process
ipcMain.handle('get-app-version', () => {
  return APP_VERSION;
});

// Clean up on exit
app.on('will-quit', async (event) => {
  // Cleanup security integration
  await shutdownSecurityIntegration();

  // Cleanup authentication handlers
  cleanupAuthHandlers();

  if (updateCheckInterval) {
    clearInterval(updateCheckInterval);
    updateCheckInterval = null;
  }
  console.log('Application quitting...');
});

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // Someone tried to run a second instance, focus our window instead
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// Hot reload for main process in development
if (isDev) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('electron-reload')(__dirname, {
    electron: require('electron') as unknown as string,
    hardResetMethod: 'exit',
  });
}
