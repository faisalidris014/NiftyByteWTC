# Developer QuickStart Guide

## 🚀 Getting Started

### Prerequisites
- Node.js 18.x+
- npm 8.x+
- Git

### Installation
```bash
git clone <repository-url>
cd windows-troubleshooting-companion
npm install
```

## 🎯 Development Commands

### Development
```bash
# Start with hot reload (recommended)
npm run start:dev

# Start only renderer dev server
npm run dev

# Start production build
npm run start
```

### Building
```bash
# Build both processes
npm run build

# Build main process only
npm run build:main

# Build renderer process only
npm run build:renderer
```

### Testing & Quality
```bash
# Type checking
npm run type-check

# Clean build artifacts
npm run clean
```

## 📁 Key Files & Locations

### Main Process
- `src/main.js` - Main entry point (JS)
- `src/main/index.ts` - Main entry point (TS)
- `src/tray-app/main.ts` - Tray-specific main process

### Renderer Process
- `src/renderer/App.tsx` - Main React component
- `src/tray-app/renderer.tsx` - Tray React component

### Configuration
- `webpack.main.js` - Main process webpack config
- `webpack.renderer.js` - Renderer production config
- `webpack.dev.js` - Renderer development config
- `package.json` - Dependencies and scripts

## 🔧 Hot Reload Features

### Renderer Process
- ✅ React component changes - Instant update
- ✅ CSS changes - Instant update
- ✅ State preservation - Maintains component state
- ✅ Source maps - Full debugging support

### Main Process
- ✅ File changes - Auto-restart process
- ✅ Window preservation - Keeps windows open
- ✅ Error recovery - Recovers from build errors

## 🎨 UI Development

### Adding Components
1. Create component in `src/renderer/components/`
2. Import and use in `App.tsx`
3. Changes appear instantly with hot reload

### Styling
- Use CSS modules or inline styles
- CSS changes hot reload instantly
- Consider CSS-in-JS for complex styling

## 🔌 IPC Communication

### Adding New IPC Methods

1. **Main Process Handler:**
```typescript
ipcMain.handle('new-method', async (event, ...args) => {
  return await someOperation(args);
});
```

2. **Preload Script:**
```typescript
contextBridge.exposeInMainWorld('electronAPI', {
  newMethod: () => ipcRenderer.invoke('new-method'),
});
```

3. **Type Definitions:**
```typescript
declare global {
  interface Window {
    electronAPI: {
      newMethod: () => Promise<any>;
    };
  }
}
```

4. **Renderer Usage:**
```typescript
const result = await window.electronAPI.newMethod();
```

## 🐛 Debugging

### Console Logging
```javascript
// Main process
console.log('Main process message');

// Renderer process  
console.log('Renderer message');
```

### Developer Tools
- **Main Window**: Press F12
- **Main Process**: Use `--inspect` flag
- **IPC Messages**: Monitor in console

### Common Issues

**Hot reload not working:**
- Restart dev server
- Check console for errors

**Build failures:**
- Run `npm run type-check`
- Check Node.js version

**Tray icon missing:**
- Verify `assets/tray-icon.png` exists
- Check system tray settings

## 📦 Deployment

### Production Build
```bash
npm run build
npm run dist
```

### Enterprise Deployment
```bash
# Silent MSI install
msiexec /i "package.msi" /quiet /norestart INSTALLDIR="C:\Path"
```

## 🚨 Security Notes

- Context isolation is ENABLED
- Node integration is DISABLED in renderer
- Remote module is DISABLED
- All IPC goes through preload scripts
- External navigation is BLOCKED

## 📚 Resources

- [Electron Docs](https://electronjs.org/docs)
- [React Docs](https://reactjs.org/docs)
- [TypeScript Docs](https://www.typescriptlang.org/docs)
- [Webpack Docs](https://webpack.js.org/)

---

**Need Help?** Check the full documentation in `TRAY_APPLICATION_DOCUMENTATION.md`