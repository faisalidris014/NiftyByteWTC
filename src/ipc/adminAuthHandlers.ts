// Admin Authentication IPC Handlers
// Secure authentication and session management for Admin Console

import { ipcMain, session } from 'electron';
import { scryptSync, randomBytes, timingSafeEqual } from 'crypto';
import * as path from 'path';
import * as fs from 'fs/promises';

// Types for authentication
interface AdminUser {
  id: string;
  username: string;
  role: 'admin' | 'operator' | 'viewer';
  permissions: readonly string[];
  passwordHash?: string;
}

interface AuthResult {
  success: boolean;
  user?: AdminUser;
  error?: string;
  sessionToken?: string;
}

interface SessionData {
  userId: string;
  username: string;
  role: 'admin' | 'operator' | 'viewer';
  permissions: readonly string[];
  createdAt: number;
  expiresAt: number;
  lastActivity: number;
}

// Authentication configuration interface
interface AuthConfig {
  users: AdminUser[];
}

// Permission definitions
const PERMISSIONS = {
  MANAGE_SKILLS: 'manage_skills',
  MANAGE_CONNECTIONS: 'manage_connections',
  VIEW_HEALTH: 'view_health',
  MANAGE_THEME: 'manage_theme',
  EXPORT_CONFIG: 'export_config',
  IMPORT_CONFIG: 'import_config',
  VIEW_AUDIT_LOGS: 'view_audit_logs'
} as const;

// Role definitions with permissions
const ROLES = {
  admin: [
    PERMISSIONS.MANAGE_SKILLS,
    PERMISSIONS.MANAGE_CONNECTIONS,
    PERMISSIONS.VIEW_HEALTH,
    PERMISSIONS.MANAGE_THEME,
    PERMISSIONS.EXPORT_CONFIG,
    PERMISSIONS.IMPORT_CONFIG,
    PERMISSIONS.VIEW_AUDIT_LOGS
  ],
  operator: [
    PERMISSIONS.MANAGE_SKILLS,
    PERMISSIONS.VIEW_HEALTH,
    PERMISSIONS.VIEW_AUDIT_LOGS
  ],
  viewer: [
    PERMISSIONS.VIEW_HEALTH
  ]
} as const;

// Admin user storage (in production, this should be in secure database)
const ADMIN_USERS: AdminUser[] = [
  {
    id: '1',
    username: 'admin',
    role: 'admin',
    permissions: ROLES.admin
  },
  {
    id: '2',
    username: 'operator',
    role: 'operator',
    permissions: ROLES.operator
  },
  {
    id: '3',
    username: 'viewer',
    role: 'viewer',
    permissions: ROLES.viewer
  }
];

// Secure session storage
const activeSessions = new Map<string, SessionData>();
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const SESSION_CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes

// Configuration paths
const CONFIG_DIR = path.join(process.cwd(), 'config');
const AUTH_CONFIG_FILE = path.join(CONFIG_DIR, 'admin-auth.json');

/**
 * Initialize authentication system
 */
export async function initializeAuthHandlers(): Promise<void> {
  // Load or create authentication configuration
  await ensureAuthConfig();

  // Setup session cleanup interval
  setInterval(cleanupExpiredSessions, SESSION_CLEANUP_INTERVAL);

  // Register IPC handlers
  registerAuthHandlers();
}

/**
 * Ensure authentication configuration exists
 */
async function ensureAuthConfig(): Promise<void> {
  try {
    await fs.access(CONFIG_DIR);
  } catch {
    await fs.mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
    await fs.chmod(CONFIG_DIR, 0o700); // Restrictive permissions
  }

  try {
    await fs.access(AUTH_CONFIG_FILE);
  } catch {
    // Create default auth config with hashed default password
    const defaultConfig = {
      users: ADMIN_USERS.map(user => ({
        ...user,
        // Default password hash for 'ChangeMe123!' (should be changed immediately)
        passwordHash: hashPassword('ChangeMe123!')
      }))
    };

    await fs.writeFile(AUTH_CONFIG_FILE, JSON.stringify(defaultConfig, null, 2), {
      encoding: 'utf8',
      mode: 0o600 // Read/write for owner only
    });
    console.warn('Default admin authentication configuration created. Please change default passwords!');
  }
}

/**
 * Register authentication IPC handlers
 */
function registerAuthHandlers(): void {
  // Admin authentication
  ipcMain.handle('authenticate-admin', async (event, username: string, password: string): Promise<AuthResult> => {
    try {
      return await authenticateUser(username, password);
    } catch (error) {
      console.error('Authentication error:', error);
      return {
        success: false,
        error: 'Internal authentication error'
      };
    }
  });

  // Session validation
  ipcMain.handle('check-admin-session', async (event): Promise<{ valid: boolean; user?: AdminUser }> => {
    try {
      const sessionToken = event.sender.id.toString();
      const sessionData = activeSessions.get(sessionToken);

      if (!sessionData || sessionData.expiresAt < Date.now()) {
        return { valid: false };
      }

      // Update last activity
      sessionData.lastActivity = Date.now();
      sessionData.expiresAt = Date.now() + SESSION_TIMEOUT;

      return {
        valid: true,
        user: {
          id: sessionData.userId,
          username: sessionData.username,
          role: sessionData.role,
          permissions: sessionData.permissions
        }
      };
    } catch (error) {
      console.error('Session check error:', error);
      return { valid: false };
    }
  });

  // Logout
  ipcMain.handle('logout-admin', async (event): Promise<void> => {
    try {
      const sessionToken = event.sender.id.toString();
      activeSessions.delete(sessionToken);
    } catch (error) {
      console.error('Logout error:', error);
    }
  });

  // Change password
  ipcMain.handle('change-admin-password', async (event, username: string, currentPassword: string, newPassword: string): Promise<AuthResult> => {
    try {
      // First authenticate with current password
      const authResult = await authenticateUser(username, currentPassword);
      if (!authResult.success) {
        return authResult;
      }

      // Update password in config
      await updateUserPassword(username, newPassword);

      return {
        success: true,
        user: authResult.user
      };
    } catch (error) {
      console.error('Password change error:', error);
      return {
        success: false,
        error: 'Failed to change password'
      };
    }
  });
}

/**
 * Authenticate user with username and password
 */
async function authenticateUser(username: string, password: string): Promise<AuthResult> {
  try {
    const config = await loadAuthConfig();
    const userConfig = config.users.find((u: AdminUser) => u.username === username);

    if (!userConfig) {
      // Simulate constant-time response to prevent username enumeration
      await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 100));
      return {
        success: false,
        error: 'Invalid credentials'
      };
    }

    // Verify password with constant-time comparison
    const isPasswordValid = verifyPassword(password, userConfig.passwordHash!);

    if (!isPasswordValid) {
      return {
        success: false,
        error: 'Invalid credentials'
      };
    }

    // Create session
    const sessionToken = crypto.randomUUID();
    const sessionData: SessionData = {
      userId: userConfig.id,
      username: userConfig.username,
      role: userConfig.role,
      permissions: userConfig.permissions,
      createdAt: Date.now(),
      expiresAt: Date.now() + SESSION_TIMEOUT,
      lastActivity: Date.now()
    };

    activeSessions.set(sessionToken, sessionData);

    return {
      success: true,
      user: {
        id: userConfig.id,
        username: userConfig.username,
        role: userConfig.role,
        permissions: userConfig.permissions
      },
      sessionToken
    };
  } catch (error) {
    console.error('Authentication failed:', error);
    return {
      success: false,
      error: 'Authentication service unavailable'
    };
  }
}

/**
 * Load authentication configuration
 */
async function loadAuthConfig(): Promise<AuthConfig> {
  try {
    const configData = await fs.readFile(AUTH_CONFIG_FILE, 'utf8');
    return JSON.parse(configData);
  } catch (error) {
    console.error('Failed to load auth config:', error);
    throw new Error('Authentication configuration unavailable');
  }
}

/**
 * Update user password
 */
async function updateUserPassword(username: string, newPassword: string): Promise<void> {
  const config = await loadAuthConfig();
  const userIndex = config.users.findIndex((u: AdminUser) => u.username === username);

  if (userIndex === -1) {
    throw new Error('User not found');
  }

  // Use type assertion to allow setting passwordHash
  (config.users[userIndex] as any).passwordHash = hashPassword(newPassword);

  await fs.writeFile(AUTH_CONFIG_FILE, JSON.stringify(config, null, 2), {
    encoding: 'utf8',
    mode: 0o600 // Read/write for owner only
  });
}

/**
 * Hash password using scrypt
 */
function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

/**
 * Verify password against stored hash
 */
function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const [saltHex, hashHex] = storedHash.split(':');
    const salt = Buffer.from(saltHex, 'hex');
    const hash = Buffer.from(hashHex, 'hex');

    const testHash = scryptSync(password, salt, 64);
    return timingSafeEqual(hash, testHash);
  } catch {
    return false;
  }
}

/**
 * Clean up expired sessions
 */
function cleanupExpiredSessions(): void {
  const now = Date.now();
  for (const [token, session] of activeSessions.entries()) {
    if (session.expiresAt < now) {
      activeSessions.delete(token);
    }
  }
}

/**
 * Cleanup authentication handlers
 */
export function cleanupAuthHandlers(): void {
  ipcMain.removeHandler('authenticate-admin');
  ipcMain.removeHandler('check-admin-session');
  ipcMain.removeHandler('logout-admin');
  ipcMain.removeHandler('change-admin-password');

  activeSessions.clear();
}