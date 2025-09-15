import React, { useState } from 'react';
import './App.css';
import AdminConsole from './AdminConsole';
import Login from './Login';
import { SecurityProvider, useSecurity, WithPermission, PERMISSIONS } from './SecurityContext';

const AppContent: React.FC = () => {
  const [showAdmin, setShowAdmin] = useState(false);
  const { auth } = useSecurity();

  if (!auth.isAuthenticated) {
    return <Login />;
  }

  if (showAdmin) {
    return <AdminConsole />;
  }

  return (
    <div className="container">
      <h1>Windows AI Troubleshooter</h1>
      <p>Welcome to the Windows AI Troubleshooter application!</p>
      <p>This application provides AI-powered troubleshooting capabilities for Windows systems.</p>

      <WithPermission permission={PERMISSIONS.VIEW_HEALTH}>
        <div className="admin-access">
          <h2>Administrator Access</h2>
          <p>Access the admin console to manage skills, ITSM integrations, and system settings.</p>
          <button
            className="admin-button"
            onClick={() => setShowAdmin(true)}
          >
            Open Admin Console
          </button>
        </div>

        <div className="quick-stats">
          <div className="stat">
            <h3>3</h3>
            <p>Available Skills</p>
          </div>
          <div className="stat">
            <h3>2</h3>
            <p>ITSM Connections</p>
          </div>
          <div className="stat">
            <h3>100%</h3>
            <p>System Health</p>
          </div>
        </div>
      </WithPermission>

      <WithPermission permission={PERMISSIONS.VIEW_HEALTH} fallback={
        <div className="access-denied">
          <h2>Access Denied</h2>
          <p>You don't have permission to access the admin console.</p>
        </div>
      }>
      </WithPermission>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <SecurityProvider>
      <AppContent />
    </SecurityProvider>
  );
};

export default App;