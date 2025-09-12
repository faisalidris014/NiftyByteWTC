# Windows Troubleshooting Companion

AI-powered troubleshooting companion for Windows users. A lightweight, always-running tray application built with Electron and React.

## Project Structure

```
NB-WindowsAITroubleshooter/
├── src/
│   └── tray-app/
│       ├── main.ts          # Electron main process
│       ├── preload.ts       # Secure IPC bridge
│       ├── renderer.tsx     # React renderer component
│       ├── index.html       # HTML template
│       └── assets/          # Application assets
├── dist/                    # Compiled output
├── config/                  # Configuration files
├── package.json
├── tsconfig.json
└── README.md
```

## Setup Instructions

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Build the application:**
   ```bash
   npm run build
   ```

3. **Run in development mode:**
   ```bash
   npm run dev
   ```

4. **Run production build:**
   ```bash
   npm start
   ```

5. **Package for distribution:**
   ```bash
   npm run dist
   ```

## Key Features Implemented

- ✅ System tray integration with context menu
- ✅ Lightweight Electron application (<150MB target)
- ✅ React-based chat interface
- ✅ Secure IPC communication between main and renderer processes
- ✅ Window management (show/hide from tray)
- ✅ Basic chat functionality with message history
- ✅ TypeScript configuration with strict type checking
- ✅ Build and packaging configuration

## Next Steps

1. Add proper application icon
2. Implement skill execution engine
3. Add offline queue functionality
4. Integrate with ITSM systems
5. Build Admin Console
6. Add monitoring and health checks

## Development Notes

- The application runs in the system tray and doesn't appear in the taskbar
- Click the tray icon to show/hide the chat window
- Right-click the tray icon for context menu options
- IPC communication is secured using context isolation
- React components use modern hooks and functional patterns