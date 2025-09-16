# Windows Troubleshooting Companion - Build Guide

## Overview
This document provides comprehensive instructions for building, packaging, and distributing the Windows Troubleshooting Companion application.

## Prerequisites

### Development Environment
- Node.js 18.x or later
- npm 8.x or later
- Windows 10/11 SDK (for native modules)
- Visual Studio Build Tools (for node-gyp)

### Production Build Requirements
- Code signing certificate (for production releases)
- Azure Key Vault access (for secure certificate storage)
- GitHub repository with Actions enabled

## Build Commands

### Development Build
```bash
# Install dependencies
npm install

# Run in development mode
npm run dev
```

### Production Build
```bash
# Build the application
npm run build

# Create distribution packages
npm run dist           # All platforms
npm run dist:win       # Windows NSIS + MSI bundles (x64)
npm run dist:win-msi   # Windows MSI only

# Create unpacked directory (for testing)
npm run pack
```

## Package Outputs

Build artifacts are created in the `release/` directory:

- `Windows Troubleshooting Companion Setup 1.0.0.exe` - NSIS installer
- `Windows Troubleshooting Companion 1.0.0.msi` - MSI installer
- `latest.yml` - Update metadata
- `*.blockmap` - Differential update blocks

## Enterprise Deployment

### Silent Installation
```bash
# MSI silent install
msiexec /i "Windows Troubleshooting Companion 1.0.0.msi" /quiet /norestart

# With custom installation directory
msiexec /i "Windows Troubleshooting Companion 1.0.0.msi" /quiet /norestart INSTALLDIR="C:\\Custom\\Path"

# Disable desktop shortcut
msiexec /i "Windows Troubleshooting Companion 1.0.0.msi" /quiet /norestart CREATEDESKTOPSHORTCUT=0
```

### Configuration Options
Available MSI properties for silent installation:

- `INSTALLDIR` - Installation directory
- `CREATEDESKTOPSHORTCUT` - Create desktop shortcut (1/0)
- `CREATESTARTMENUSHORTCUT` - Create start menu shortcut (1/0)
- `AUTOSTART` - Auto-start with Windows (1/0)
- `WTC_UPDATE_CHANNEL` - Override the update channel (`stable` or `pilot`)

### SCCM/Intune Deployment

1. **MSI Deployment**: Use the MSI package with silent install parameters
2. **Detection Method**: Use MSI product code for detection
3. **Dependencies**: Ensure .NET Framework and VC++ redistributables are installed

## Code Signing

### Development (Unsigned)
For development and testing, builds are unsigned. Set in package.json:

```json
{
  "build": {
    "win": {
      "verifyUpdateCodeSignature": false,
      "sign": false
    }
  }
}
```

### Production (Signed)
For production releases, configure code signing:

1. Obtain code signing certificate
2. Store certificate in Azure Key Vault
3. Configure GitHub Secrets:
   - `SIGNING_CERT` - Base64 encoded PFX
   - `SIGNING_CERT_PASSWORD` - Certificate password
   - `SIGNING_TIMESTAMP_URL` - Time-stamping service URL

## CI/CD Pipeline

The GitHub Actions workflow automatically:

1. Builds the application on tag pushes
2. Runs tests and linting
3. Creates signed MSI/EXE packages
4. Uploads artifacts to GitHub Releases

### Manual Trigger
```bash
# Create a release tag
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0
```

## Auto-Update Channels

Auto-update behavior is managed through `config/update-config.json` and the environment variables `UPDATE_CHANNEL` / `UPDATE_FEED_URL`.

- **Channels**: `stable` (default) for production, `pilot` for prerelease testing.
- **Feed URL**: Defaults to `https://updates.niftybyte.com/wtc/<channel>`; override for staging by setting `UPDATE_FEED_URL`.
- **Intervals**: Updates are checked on startup and every 30 minutes. Differential `*.blockmap` files are generated automatically.

## Rollback Mechanism

Use `build/rollback.ps1` to reinstall a previously archived MSI if an update must be reverted:

```powershell
powershell.exe -ExecutionPolicy Bypass -File build/rollback.ps1 -PreviousInstallerPath "C:\\ProgramData\\NiftyByte\\WTC\\Packages\\wtc-1.0.0.msi"
```

Archives of prior installers should be stored in `C:\ProgramData\NiftyByte\WTC\Packages` (configurable via `WTC_PACKAGE_BACKUP`). Logs are written to `%LOCALAPPDATA%\NiftyByte\WTC\Logs`.

## Performance Optimization

The build process includes:

- **Tree Shaking**: Removes unused code
- **Minification**: Reduces bundle size
- **Code Splitting**: Separates vendor code
- **Asset Optimization**: Compresses images and resources

## Troubleshooting

### Common Issues

1. **Native Module Build Failures**
   - Install Windows Build Tools: `npm install --global windows-build-tools`
   - Ensure Python 3.x is available

2. **Code Signing Errors**
   - Verify certificate validity and chain
   - Check time-stamping service availability

3. **MSI Installation Issues**
   - Check administrator privileges
   - Verify no conflicting installations exist

### Logs and Debugging

- Build logs: Check console output during `npm run build`
- Installer logs: Use `msiexec /i package.msi /l*v install.log`
- Application logs: Located in `%APPDATA%\Windows Troubleshooting Companion\logs`

## Security Considerations

- Never commit certificate files to version control
- Use environment variables for sensitive configuration
- Validate third-party dependencies regularly
- Keep build tools and dependencies updated

## Support

For build and deployment issues, check:

1. Electron Builder documentation
2. Windows Installer documentation
3. GitHub Actions workflows
4. Application logs and error messages
