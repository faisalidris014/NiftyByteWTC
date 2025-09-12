# Development Setup - Hot Reload Configuration

This Electron application is configured with comprehensive hot reload functionality for both the main and renderer processes.

## Quick Start

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start development with hot reload:
   ```bash
   npm run start:dev
   ```

## Available Scripts

- `npm run start:dev` - Start both webpack dev server and Electron with hot reload
- `npm run dev` - Start only webpack dev server for renderer process
- `npm run start` - Start Electron app (production build)
- `npm run build` - Build both main and renderer processes
- `npm run build:main` - Build only main process
- `npm run build:renderer` - Build only renderer process
- `npm run clean` - Clean dist directory
- `npm run type-check` - Run TypeScript type checking

## Hot Reload Features

### Renderer Process (React Components)
- **Instant updates**: Changes to React components update immediately without full page reload
- **State preservation**: Component state is preserved during hot reload
- **CSS hot reload**: CSS changes are applied instantly
- **Source maps**: Full source maps for debugging in DevTools

### Main Process (Electron)
- **Process restart**: Main process restarts automatically on file changes
- **Window preservation**: Electron windows are preserved during restart
- **Error recovery**: Automatic recovery from compilation errors

## Development Workflow

1. Make changes to React components in `src/renderer/`
2. Changes appear instantly in the running Electron app
3. Make changes to main process in `src/main/`
4. Main process restarts automatically, windows remain open
5. Use DevTools (F12) for debugging with full source maps

## Configuration Files

- `webpack.main.js` - Main process Webpack config
- `webpack.renderer.js` - Renderer process Webpack config (production)
- `webpack.dev.js` - Renderer process Webpack config (development with HMR)
- `tsconfig.json` - TypeScript configuration
- `.env.development` - Development environment variables
- `.env.production` - Production environment variables

## Troubleshooting

- If hot reload stops working, restart with `npm run start:dev`
- Check console for compilation errors
- Ensure all dependencies are installed correctly