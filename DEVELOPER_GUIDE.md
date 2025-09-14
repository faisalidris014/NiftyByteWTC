# Windows AI Troubleshooter - Developer Guide

## Quick Start

### Prerequisites
- Node.js 18.x or later
- npm 8.x or later
- Git
- Windows Build Tools (for native modules)

### Installation
```bash
# Clone the repository
git clone <repository-url>
cd windows-troubleshooting-companion

# Install dependencies
npm install

# Verify installation
npm run type-check
```

### Development Workflow
```bash
# Start development with hot reload
npm run start:dev

# Build for production
npm run build

# Create distribution packages
npm run dist
```

## Development Environment Setup

### Recommended IDE Setup
- **VS Code** with extensions:
  - TypeScript
  - ESLint
  - Prettier
  - GitLens
  - Electron

### Environment Variables
```bash
# Development mode
NODE_ENV=development
ELECTRON_IS_DEV=true

# Debug logging
DEBUG=electron:*

# Custom port for dev server
PORT=3000
```

## Code Structure

### Project Layout
```
src/
├── main/                 # Main Electron process (TypeScript)
│   └── index.ts         # Main entry point
├── renderer/            # Renderer process (React)
│   ├── index.tsx        # React entry point
│   ├── App.tsx          # Main React component
│   └── App.css          # Application styles
├── tray-app/            # Tray-specific implementation
│   ├── main.ts          # Tray main process
│   ├── renderer.tsx     # Tray React component
│   ├── preload.ts       # Tray preload script
│   └── index.html       # Tray HTML template
├── ipc/                 # Inter-process communication
│   ├── mainHandlers.ts  # Main process IPC handlers
│   ├── rendererUtilities.ts # Renderer IPC utilities
│   ├── errorHandling.ts # Error handling utilities
│   ├── connectionManager.ts # Connection management
│   └── usageExamples.ts # IPC usage examples
├── skills-engine/       # Skills execution engine
│   ├── sandbox.ts       # Generic sandbox implementation
│   ├── powershell-sandbox.ts # PowerShell-specific sandbox
│   ├── resilience-manager.ts # Fault tolerance system
│   ├── logging/         # Comprehensive logging system
│   └── types.ts         # Type definitions
└── types/               # Shared TypeScript definitions
    └── ipc.ts          # IPC type definitions
```

### Key Configuration Files
- `package.json` - Dependencies and build scripts
- `tsconfig.json` - TypeScript configuration
- `webpack.main.config.js` - Main process webpack config
- `webpack.renderer.config.js` - Renderer process webpack config
- `webpack.dev.js` - Development webpack config
- `build/installer-config.js` - Electron builder configuration

## Coding Standards

### TypeScript Guidelines
- Use strict TypeScript mode
- Prefer interfaces over types for object shapes
- Use descriptive type and interface names
- Avoid `any` type; use `unknown` or specific types
- Use JSDoc comments for public APIs

### Example TypeScript Usage
```typescript
// Good: Properly typed interface
interface UserPreferences {
  theme: 'light' | 'dark' | 'auto';
  notifications: boolean;
  autoStart: boolean;
}

// Bad: Using any
const preferences: any = {};

// Good: Using unknown with validation
function validatePreferences(obj: unknown): obj is UserPreferences {
  return typeof obj === 'object' && obj !== null &&
         'theme' in obj && 'notifications' in obj && 'autoStart' in obj;
}
```

### React Component Guidelines
- Use functional components with hooks
- Implement proper error boundaries
- Use React.memo for performance optimization
- Follow React best practices for state management

### Example React Component
```tsx
import React, { useState, useEffect } from 'react';

interface TroubleshooterProps {
  initialMessage?: string;
  onMessageSent: (message: string) => void;
}

const Troubleshooter: React.FC<TroubleshooterProps> = ({
  initialMessage = '',
  onMessageSent
}) => {
  const [message, setMessage] = useState(initialMessage);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onMessageSent(message);
    setMessage('');
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Describe your issue..."
      />
      <button type="submit">Send</button>
    </form>
  );
};

export default React.memo(Troubleshooter);
```

## Development Workflow

### Hot Reload Development
```bash
# Start development server with hot reload
npm run start:dev

# This starts:
# - Webpack dev server on port 3000
# - Electron main process with auto-restart
# - React hot module replacement
```

### Debugging

#### Main Process Debugging
```bash
# Start Electron with debug flags
electron . --inspect=9229 --remote-debugging-port=8315

# Then connect with Chrome DevTools
# chrome://inspect -> Configure -> localhost:9229
```

#### Renderer Process Debugging
- Press F12 in the Electron window
- Use Chrome DevTools for debugging
- Source maps are available for TypeScript

### Testing

#### Unit Tests
```bash
# Run all tests
npm test

# Run specific test file
npm test -- --testPathPattern="skills-engine"

# Run with coverage
npm test -- --coverage
```

#### Integration Tests
```bash
# Run integration tests
npm run test:integration

# Test IPC communication
npm run test:ipc
```

#### E2E Tests
```bash
# Run end-to-end tests
npm run test:e2e

# Test with specific browser
npm run test:e2e -- --browser=electron
```

## Skill Development

### Creating a New Skill

1. **Create Skill Metadata** (`skills/my-skill.json`):
```json
{
  "id": "my-skill",
  "name": "My Troubleshooting Skill",
  "description": "Description of what this skill does",
  "os": ["windows"],
  "riskLevel": "low",
  "requiresAdmin": false,
  "script": "my-skill.ps1",
  "version": "1.0.0",
  "parameters": [
    {
      "name": "param1",
      "type": "string",
      "description": "Parameter description",
      "required": true
    }
  ],
  "output": {
    "success": "Success message template",
    "failure": "Failure message template"
  }
}
```

2. **Create Skill Script** (`skills/my-skill.ps1`):
```powershell
# PowerShell script implementation
param(
  [string]$param1
)

try {
  # Skill logic here
  if (-not $param1) {
    Write-Output "ERROR: Parameter param1 is required"
    exit 1
  }

  # Perform troubleshooting task
  $result = Get-Service -Name $param1 -ErrorAction Stop

  if ($result.Status -eq 'Running') {
    Write-Output "SUCCESS: Service $param1 is running"
  } else {
    Write-Output "INFO: Service $param1 is not running"
  }
} catch {
  Write-Output "ERROR: $($_.Exception.Message)"
  exit 1
}
```

3. **Register Skill** (in main process):
```typescript
import { registerSkill } from '../ipc/mainHandlers';
import { PowerShellSandbox } from '../skills-engine/powershell-sandbox';

registerSkill('my-skill', async (params) => {
  const scriptPath = path.join(__dirname, 'skills', 'my-skill.ps1');
  const sandbox = new PowerShellSandbox(scriptPath, {
    executionPolicy: 'RemoteSigned',
    noProfile: true
  });

  const result = await sandbox.execute(params);

  if (result.exitCode === 0) {
    return result.stdout;
  } else {
    throw new Error(result.stderr);
  }
});
```

### Skill Best Practices

1. **Idempotency**: Skills should be safe to run multiple times
2. **Error Handling**: Provide clear, actionable error messages
3. **Security**: Never include sensitive data in scripts
4. **Performance**: Complete within 30 seconds maximum
5. **Logging**: Use structured logging format
6. **Validation**: Validate all input parameters

## IPC Development

### Message Structure
```typescript
// Request message
interface SkillExecutionRequest {
  type: 'skill_execution_request';
  messageId: string;
  timestamp: number;
  skillId: string;
  params: Record<string, any>;
  requiresAdmin?: boolean;
  timeoutMs?: number;
}

// Response message
interface SkillExecutionResponse {
  type: 'skill_execution_response';
  messageId: string;
  timestamp: number;
  correlationId: string;
  skillId: string;
  status: 'success' | 'error' | 'timeout' | 'cancelled';
  output?: string;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  executionTimeMs?: number;
}
```

### Adding New IPC Methods

1. **Define Message Types** (`src/types/ipc.ts`):
```typescript
export interface CustomRequest extends IPCMessageBase {
  type: 'custom_request';
  data: any;
}

export interface CustomResponse extends IPCMessageBase {
  type: 'custom_response';
  result: any;
}
```

2. **Add Main Process Handler** (`src/ipc/mainHandlers.ts`):
```typescript
ipcMain.handle('custom-method', async (event, request: CustomRequest) => {
  // Validate request
  if (!validateIPCMessage(request)) {
    throw new Error('Invalid message format');
  }

  // Process request
  const result = await processCustomRequest(request.data);

  return {
    type: 'custom_response',
    messageId: crypto.randomUUID(),
    timestamp: Date.now(),
    correlationId: request.messageId,
    result
  };
});
```

3. **Update Preload Script** (`src/tray-app/preload.ts`):
```typescript
contextBridge.exposeInMainWorld('electronAPI', {
  customMethod: (data: any) => ipcRenderer.invoke('custom-method', data),
  // ... existing methods
});
```

4. **Update Type Definitions** (`src/types/ipc.ts`):
```typescript
declare global {
  interface Window {
    electronAPI: {
      customMethod: (data: any) => Promise<CustomResponse>;
      // ... existing methods
    };
  }
}
```

## Security Guidelines

### Secure Coding Practices

1. **Input Validation**: Always validate and sanitize inputs
2. **Error Handling**: Don't expose sensitive information in errors
3. **Environment Variables**: Use secure environment handling
4. **Process Isolation**: Run skills in isolated sandboxes
5. **Resource Limits**: Enforce strict resource constraints

### Security Checklist
- [ ] Validate all IPC messages
- [ ] Sanitize skill parameters
- [ ] Implement proper error handling
- [ ] Use secure environment isolation
- [ ] Enforce resource limits
- [ ] Log security events
- [ ] Regular security reviews

## Performance Optimization

### Memory Management
- Monitor memory usage in development
- Use React.memo for expensive components
- Clean up event listeners and intervals
- Avoid memory leaks in long-running processes

### CPU Optimization
- Profile CPU usage with Electron DevTools
- Optimize expensive operations
- Use web workers for CPU-intensive tasks
- Implement efficient algorithms

### Bundle Optimization
- Analyze bundle size with webpack-bundle-analyzer
- Code splitting for large applications
- Tree shaking to remove unused code
- Optimize asset loading

## Troubleshooting Development Issues

### Common Issues and Solutions

#### Hot Reload Not Working
```bash
# Check if webpack dev server is running
curl http://localhost:3000

# Restart development server
npm run start:dev

# Check for compilation errors
npm run type-check
```

#### IPC Connection Issues
- Verify preload script configuration
- Check context isolation settings
- Monitor connection state changes

#### Build Failures
```bash
# Clean and rebuild
npm run clean
npm run build

# Check TypeScript compilation
npm run type-check

# Install Windows Build Tools if needed
npm install --global windows-build-tools
```

## Contributing Guidelines

### Code Review Process
1. Create feature branch from `main`
2. Implement changes with tests
3. Update documentation
4. Submit pull request
5. Address review comments
6. Merge after approval

### Commit Message Format
```
feat: add new troubleshooting skill
fix: resolve tray icon visibility issue
docs: update developer guide
style: format code with prettier
refactor: improve IPC error handling
test: add unit tests for sandbox
chore: update dependencies
```

### Pull Request Checklist
- [ ] Code follows style guidelines
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] No breaking changes
- [ ] Security considerations addressed
- [ ] Performance impact assessed

## Additional Resources

### Documentation
- [Electron Documentation](https://www.electronjs.org/docs)
- [React Documentation](https://reactjs.org/docs)
- [TypeScript Documentation](https://www.typescriptlang.org/docs)
- [Webpack Documentation](https://webpack.js.org/)

### Community
- [Electron Discord](https://discord.gg/electron)
- [GitHub Issues](https://github.com/your-repo/issues)
- [Stack Overflow](https://stackoverflow.com/questions/tagged/electron)

### Monitoring
- Application logs: `%APPDATA%\Windows Troubleshooting Companion\logs`
- Performance monitoring: Electron DevTools
- Error tracking: Integrated error reporting

---

*This guide is continuously updated. Check the repository for the latest version.*