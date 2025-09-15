// Security Context for Admin Console Authentication and Authorization

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface User {
  id: string;
  username: string;
  role: 'admin' | 'operator' | 'viewer';
  permissions: readonly string[];
}

interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  isLoading: boolean;
  error: string | null;
}

interface SecurityContextType {
  auth: AuthState;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  hasPermission: (permission: string) => boolean;
  hasRole: (role: string) => boolean;
}

const SecurityContext = createContext<SecurityContextType | undefined>(undefined);

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

// Mock users for demonstration - in real app, this would come from secure storage
const MOCK_USERS: User[] = [
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

interface SecurityProviderProps {
  children: ReactNode;
}

export const SecurityProvider: React.FC<SecurityProviderProps> = ({ children }) => {
  const [auth, setAuth] = useState<AuthState>({
    isAuthenticated: false,
    user: null,
    isLoading: false,
    error: null
  });

  // Check for existing session on mount
  useEffect(() => {
    const checkExistingSession = async () => {
      setAuth(prev => ({ ...prev, isLoading: true }));

      try {
        // Check with main process for valid session
        const session = await window.electronAPI.checkAdminSession();
        if (session.valid && session.user) {
          setAuth({
            isAuthenticated: true,
            user: session.user,
            isLoading: false,
            error: null
          });
        } else {
          setAuth(prev => ({ ...prev, isLoading: false }));
        }
      } catch (error) {
        setAuth(prev => ({ ...prev, isLoading: false }));
      }
    };

    checkExistingSession();
  }, []);

  const login = async (username: string, password: string): Promise<boolean> => {
    setAuth(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // Call main process for secure authentication
      const result = await window.electronAPI.authenticateAdmin(username, password);

      if (result.success && result.user) {
        setAuth({
          isAuthenticated: true,
          user: result.user,
          isLoading: false,
          error: null
        });
        return true;
      } else {
        setAuth({
          isAuthenticated: false,
          user: null,
          isLoading: false,
          error: result.error || 'Authentication failed'
        });
        return false;
      }
    } catch (error) {
      setAuth({
        isAuthenticated: false,
        user: null,
        isLoading: false,
        error: 'Authentication service unavailable'
      });
      return false;
    }
  };

  const logout = () => {
    setAuth({
      isAuthenticated: false,
      user: null,
      isLoading: false,
      error: null
    });
    // Notify main process to clear session
    window.electronAPI.logoutAdmin().catch(console.error);
  };

  const hasPermission = (permission: string): boolean => {
    if (!auth.isAuthenticated || !auth.user) return false;
    return auth.user.permissions.includes(permission);
  };

  const hasRole = (role: string): boolean => {
    if (!auth.isAuthenticated || !auth.user) return false;
    return auth.user.role === role;
  };

  const value: SecurityContextType = {
    auth,
    login,
    logout,
    hasPermission,
    hasRole
  };

  return (
    <SecurityContext.Provider value={value}>
      {children}
    </SecurityContext.Provider>
  );
};

export const useSecurity = (): SecurityContextType => {
  const context = useContext(SecurityContext);
  if (context === undefined) {
    throw new Error('useSecurity must be used within a SecurityProvider');
  }
  return context;
};

// Permission-based component wrapper
export const WithPermission: React.FC<{
  permission: string;
  children: ReactNode;
  fallback?: ReactNode;
}> = ({ permission, children, fallback = null }) => {
  const { hasPermission } = useSecurity();
  return hasPermission(permission) ? <>{children}</> : <>{fallback}</>;
};

// Role-based component wrapper
export const WithRole: React.FC<{
  role: string;
  children: ReactNode;
  fallback?: ReactNode;
}> = ({ role, children, fallback = null }) => {
  const { hasRole } = useSecurity();
  return hasRole(role) ? <>{children}</> : <>{fallback}</>;
};

export { PERMISSIONS };