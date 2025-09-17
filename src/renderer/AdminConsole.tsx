import React, { useState, useEffect } from 'react';
import './AdminConsole.css';
import { useSecurity } from './SecurityContext';
import { validateColor, validateNumber, validateThemeConfig } from '../utils/validation';
import type { FeedbackAnalyticsSummary } from '../types/feedback';

// Types for Admin Console
interface Skill {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  riskLevel: 'low' | 'medium' | 'high';
  requiresAdmin: boolean;
  version: string;
}

interface ITSMConnection {
  id: string;
  name: string;
  type: 'servicenow' | 'jira' | 'zendesk' | 'salesforce';
  baseUrl: string;
  enabled: boolean;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'offline';
  lastTested: number;
  responseTimeMs?: number;
}

interface ThemeConfig {
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  textColor: string;
  fontFamily: string;
  borderRadius: number;
}

const AdminConsole: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'skills' | 'itsm' | 'health' | 'branding' | 'analytics'>('skills');
  const [skills, setSkills] = useState<Skill[]>([]);
  const [connections, setConnections] = useState<ITSMConnection[]>([]);
  const [theme, setTheme] = useState<ThemeConfig>({
    primaryColor: '#2563eb',
    secondaryColor: '#64748b',
    backgroundColor: '#f8fafc',
    textColor: '#1e293b',
    fontFamily: 'system-ui, sans-serif',
    borderRadius: 8
  });
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [feedbackSummary, setFeedbackSummary] = useState<FeedbackAnalyticsSummary | null>(null);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const { logout, auth } = useSecurity();

  // Mock data for demonstration - in real app, this would come from API
  useEffect(() => {
    // Load mock skills
    setSkills([
      {
        id: 'system-info',
        name: 'System Information',
        description: 'Gathers basic system information for troubleshooting',
        enabled: true,
        riskLevel: 'low',
        requiresAdmin: false,
        version: '1.0.0'
      },
      {
        id: 'disk-space',
        name: 'Disk Space Analysis',
        description: 'Analyzes disk space usage and identifies large files',
        enabled: true,
        riskLevel: 'low',
        requiresAdmin: false,
        version: '1.0.0'
      },
      {
        id: 'wifi-reset',
        name: 'WiFi Reset',
        description: 'Resets WiFi adapter and clears network cache',
        enabled: false,
        riskLevel: 'medium',
        requiresAdmin: true,
        version: '1.0.0'
      }
    ]);

    // Load mock connections
    setConnections([
      {
        id: 'servicenow-prod',
        name: 'ServiceNow Production',
        type: 'servicenow',
        baseUrl: 'https://company.service-now.com',
        enabled: true,
        status: 'healthy',
        lastTested: Date.now() - 300000,
        responseTimeMs: 250
      },
      {
        id: 'jira-dev',
        name: 'Jira Development',
        type: 'jira',
        baseUrl: 'https://company.atlassian.net',
        enabled: false,
        status: 'offline',
        lastTested: Date.now() - 86400000
      }
    ]);
  }, []);

  useEffect(() => {
    if (activeTab !== 'analytics') {
      return;
    }

    let cancelled = false;
    window.electronAPI.getFeedbackSummary()
      .then((summary) => {
        if (!cancelled) {
          setFeedbackSummary(summary);
          setAnalyticsError(null);
        }
      })
      .catch((error) => {
        console.error('Failed to load feedback summary', error);
        if (!cancelled) {
          setAnalyticsError('Unable to load analytics at this time.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  const toggleSkill = (skillId: string) => {
    setSkills(prev => prev.map(skill =>
      skill.id === skillId ? { ...skill, enabled: !skill.enabled } : skill
    ));
  };

  const toggleConnection = (connectionId: string) => {
    setConnections(prev => prev.map(conn =>
      conn.id === connectionId ? { ...conn, enabled: !conn.enabled } : conn
    ));
  };

  const testConnection = (connectionId: string) => {
    // In real app, this would call the ITSM integration API
    console.log(`Testing connection: ${connectionId}`);
  };

  const updateTheme = (field: keyof ThemeConfig, value: any) => {
    let validatedValue = value;
    const errors = { ...validationErrors };

    // Validate based on field type
    switch (field) {
      case 'primaryColor':
      case 'secondaryColor':
      case 'backgroundColor':
      case 'textColor':
        const colorValidation = validateColor(value);
        if (colorValidation.isValid) {
          validatedValue = colorValidation.sanitized;
          delete errors[field];
        } else {
          errors[field] = colorValidation.errors[0];
        }
        break;

      case 'borderRadius':
        const numberValidation = validateNumber(parseInt(value), 0, 20);
        if (numberValidation.isValid) {
          validatedValue = numberValidation.sanitized;
          delete errors[field];
        } else {
          errors[field] = numberValidation.errors[0];
        }
        break;

      case 'fontFamily':
        // Basic sanitization for font family
        validatedValue = value.trim();
        if (!validatedValue) {
          errors[field] = 'Font family is required';
        } else {
          delete errors[field];
        }
        break;

      default:
        validatedValue = value;
    }

    setValidationErrors(errors);
    setTheme(prev => ({ ...prev, [field]: validatedValue }));
  };

  const validateAllThemeFields = (): boolean => {
    const validation = validateThemeConfig(theme);
    setValidationErrors(
      validation.errors.reduce((acc, error) => {
        const [field] = error.split(':');
        acc[field.trim()] = error;
        return acc;
      }, {} as Record<string, string>)
    );
    return validation.isValid;
  };

  const handleExportAnalytics = async () => {
    setIsExporting(true);
    setAnalyticsError(null);
    try {
      const csv = await window.electronAPI.exportFeedbackCsv();
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `wtc-feedback-${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export analytics', error);
      setAnalyticsError('Export failed. Please try again later.');
    } finally {
      setIsExporting(false);
    }
  };

  const refreshAnalytics = async () => {
    try {
      const summary = await window.electronAPI.getFeedbackSummary();
      setFeedbackSummary(summary);
      setAnalyticsError(null);
    } catch (error) {
      console.error('Failed to refresh analytics', error);
      setAnalyticsError('Unable to refresh analytics right now.');
    }
  };

  const renderSkillsTab = () => (
    <div className="admin-section">
      <h2>Skill Management</h2>
      <div className="skills-grid">
        {skills.map(skill => (
          <div key={skill.id} className="skill-card">
            <div className="skill-header">
              <h3>{skill.name}</h3>
              <div className={`risk-badge risk-${skill.riskLevel}`}>
                {skill.riskLevel.toUpperCase()}
              </div>
            </div>
            <p className="skill-description">{skill.description}</p>
            <div className="skill-meta">
              <span>v{skill.version}</span>
              {skill.requiresAdmin && <span className="admin-badge">Admin</span>}
            </div>
            <div className="skill-actions">
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={skill.enabled}
                  onChange={() => toggleSkill(skill.id)}
                />
                <span className="toggle-slider"></span>
              </label>
              <span className="toggle-label">
                {skill.enabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderITSMTab = () => (
    <div className="admin-section">
      <h2>ITSM Configuration</h2>
      <div className="connections-grid">
        {connections.map(connection => (
          <div key={connection.id} className="connection-card">
            <div className="connection-header">
              <h3>{connection.name}</h3>
              <div className={`status-badge status-${connection.status}`}>
                {connection.status.toUpperCase()}
              </div>
            </div>
            <div className="connection-details">
              <p><strong>Type:</strong> {connection.type}</p>
              <p><strong>URL:</strong> {connection.baseUrl}</p>
              {connection.responseTimeMs && (
                <p><strong>Response Time:</strong> {connection.responseTimeMs}ms</p>
              )}
              <p><strong>Last Tested:</strong> {new Date(connection.lastTested).toLocaleString()}</p>
            </div>
            <div className="connection-actions">
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={connection.enabled}
                  onChange={() => toggleConnection(connection.id)}
                />
                <span className="toggle-slider"></span>
              </label>
              <span className="toggle-label">
                {connection.enabled ? 'Enabled' : 'Disabled'}
              </span>
              <button
                className="test-button"
                onClick={() => testConnection(connection.id)}
              >
                Test Connection
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="add-connection-section">
        <h3>Add New Connection</h3>
        <button className="add-button">+ Add ITSM Connection</button>
      </div>
    </div>
  );

  const renderHealthTab = () => (
    <div className="admin-section">
      <h2>Endpoint Health Monitoring</h2>
      <div className="health-dashboard">
        <div className="health-card">
          <h3>System Health</h3>
          <div className="health-status">
            <div className="status-indicator healthy"></div>
            <span>All systems operational</span>
          </div>
          <div className="health-metrics">
            <div className="metric">
              <span className="metric-label">Uptime</span>
              <span className="metric-value">99.8%</span>
            </div>
            <div className="metric">
              <span className="metric-label">Response Time</span>
              <span className="metric-value">45ms</span>
            </div>
            <div className="metric">
              <span className="metric-label">Errors</span>
              <span className="metric-value">0.2%</span>
            </div>
          </div>
        </div>

        <div className="health-card">
          <h3>Skill Execution Stats</h3>
          <div className="stats-grid">
            <div className="stat">
              <span className="stat-value">1,234</span>
              <span className="stat-label">Total Executions</span>
            </div>
            <div className="stat">
              <span className="stat-value">98%</span>
              <span className="stat-label">Success Rate</span>
            </div>
            <div className="stat">
              <span className="stat-value">12</span>
              <span className="stat-label">Active Skills</span>
            </div>
          </div>
        </div>

        <div className="health-card">
          <h3>Recent Activity</h3>
          <div className="activity-list">
            <div className="activity-item">
              <span className="activity-time">2 min ago</span>
              <span className="activity-text">System Info skill executed successfully</span>
            </div>
            <div className="activity-item">
              <span className="activity-time">5 min ago</span>
              <span className="activity-text">ServiceNow connection tested</span>
            </div>
            <div className="activity-item">
              <span className="activity-time">10 min ago</span>
              <span className="activity-text">WiFi Reset skill disabled</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderBrandingTab = () => (
    <div className="admin-section">
      <h2>Branding & Theme Customization</h2>
      <div className="theme-editor">
        <div className="theme-preview">
          <div className="preview-header" style={{ backgroundColor: theme.primaryColor }}>
            <h3 style={{ color: '#fff' }}>Preview Header</h3>
          </div>
          <div className="preview-content" style={{ backgroundColor: theme.backgroundColor, color: theme.textColor }}>
            <p>This is a preview of your theme settings.</p>
            <button style={{
              backgroundColor: theme.primaryColor,
              color: '#fff',
              borderRadius: `${theme.borderRadius}px`
            }}>
              Sample Button
            </button>
          </div>
        </div>

        <div className="theme-controls">
          <div className="control-group">
            <label>Primary Color</label>
            <input
              type="color"
              value={theme.primaryColor}
              onChange={(e) => updateTheme('primaryColor', e.target.value)}
            />
            {validationErrors.primaryColor && (
              <span className="validation-error">{validationErrors.primaryColor}</span>
            )}
          </div>
          <div className="control-group">
            <label>Background Color</label>
            <input
              type="color"
              value={theme.backgroundColor}
              onChange={(e) => updateTheme('backgroundColor', e.target.value)}
            />
            {validationErrors.backgroundColor && (
              <span className="validation-error">{validationErrors.backgroundColor}</span>
            )}
          </div>
          <div className="control-group">
            <label>Text Color</label>
            <input
              type="color"
              value={theme.textColor}
              onChange={(e) => updateTheme('textColor', e.target.value)}
            />
            {validationErrors.textColor && (
              <span className="validation-error">{validationErrors.textColor}</span>
            )}
          </div>
          <div className="control-group">
            <label>Border Radius</label>
            <input
              type="range"
              min="0"
              max="20"
              value={theme.borderRadius}
              onChange={(e) => updateTheme('borderRadius', parseInt(e.target.value))}
            />
            <span>{theme.borderRadius}px</span>
            {validationErrors.borderRadius && (
              <span className="validation-error">{validationErrors.borderRadius}</span>
            )}
          </div>
          <div className="control-group">
            <label>Font Family</label>
            <select
              value={theme.fontFamily}
              onChange={(e) => updateTheme('fontFamily', e.target.value)}
            >
              <option value="system-ui, sans-serif">System UI</option>
              <option value="Arial, sans-serif">Arial</option>
              <option value="Georgia, serif">Georgia</option>
              <option value="'Courier New', monospace">Courier New</option>
            </select>
            {validationErrors.fontFamily && (
              <span className="validation-error">{validationErrors.fontFamily}</span>
            )}
          </div>
        </div>
      </div>

      <div className="branding-actions">
        <button
          className="save-button"
          onClick={() => {
            if (validateAllThemeFields()) {
              // Save theme logic here
              console.log('Theme saved:', theme);
            }
          }}
        >
          Save Theme
        </button>
        <button className="reset-button">Reset to Default</button>
      </div>
    </div>
  );

  const renderAnalyticsTab = () => (
    <div className="admin-section analytics-section">
      <div className="analytics-header">
        <h2>Feedback & Analytics</h2>
        <div className="analytics-actions">
          <button className="refresh-button" onClick={refreshAnalytics}>
            Refresh
          </button>
          <button className="export-button" onClick={handleExportAnalytics} disabled={isExporting}>
            {isExporting ? 'Exporting…' : 'Export CSV'}
          </button>
        </div>
      </div>

      {analyticsError && <div className="analytics-error">{analyticsError}</div>}

      <div className="analytics-grid">
        <div className="analytics-card">
          <h3>Satisfaction Score</h3>
          <p className="analytics-value">{feedbackSummary ? `${feedbackSummary.satisfactionScore}%` : '--'}</p>
          <span className="analytics-detail">Thumbs up: {feedbackSummary?.thumbsUp ?? 0}</span>
          <span className="analytics-detail">Thumbs down: {feedbackSummary?.thumbsDown ?? 0}</span>
        </div>
        <div className="analytics-card">
          <h3>Resolution Rate</h3>
          <p className="analytics-value">{feedbackSummary ? `${feedbackSummary.resolutionRate}%` : '--'}</p>
          <span className="analytics-detail">Average resolution time: {feedbackSummary ? `${Math.round(feedbackSummary.averageResolutionTimeMs)} ms` : '--'}</span>
        </div>
        <div className="analytics-card">
          <h3>MTTR</h3>
          <p className="analytics-value">{feedbackSummary?.mttrMs ? `${feedbackSummary.mttrMs} ms` : 'n/a'}</p>
          <span className="analytics-detail">Updated: {feedbackSummary ? new Date(feedbackSummary.updatedAt).toLocaleString() : '--'}</span>
        </div>
      </div>

      {feedbackSummary?.queueBacklog && (
        <div className="queue-summary">
          <h4>Offline Queue Status</h4>
          <div className="queue-metrics">
            <div><strong>Pending:</strong> {feedbackSummary.queueBacklog.pending}</div>
            <div><strong>Failed:</strong> {feedbackSummary.queueBacklog.failed}</div>
            <div><strong>Retrying:</strong> {feedbackSummary.queueBacklog.retrying}</div>
            <div><strong>Oldest Item:</strong> {feedbackSummary.queueBacklog.oldestMinutes} min</div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="admin-console">
      <header className="admin-header">
        <div className="header-content">
          <div>
            <h1>Admin Console</h1>
            <p>Windows AI Troubleshooter Administration Panel</p>
          </div>
          <div className="user-info">
            <span>Welcome, {auth.user?.username}</span>
            <button onClick={logout} className="logout-button">
              Logout
            </button>
          </div>
        </div>
      </header>

      <nav className="admin-nav">
        <button
          className={activeTab === 'skills' ? 'nav-button active' : 'nav-button'}
          onClick={() => setActiveTab('skills')}
        >
          Skills
        </button>
        <button
          className={activeTab === 'itsm' ? 'nav-button active' : 'nav-button'}
          onClick={() => setActiveTab('itsm')}
        >
          ITSM
        </button>
        <button
          className={activeTab === 'health' ? 'nav-button active' : 'nav-button'}
          onClick={() => setActiveTab('health')}
        >
          Health
        </button>
        <button
          className={activeTab === 'analytics' ? 'nav-button active' : 'nav-button'}
          onClick={() => setActiveTab('analytics')}
        >
          Analytics
        </button>
        <button
          className={activeTab === 'branding' ? 'nav-button active' : 'nav-button'}
          onClick={() => setActiveTab('branding')}
        >
          Branding
        </button>
      </nav>

      <main className="admin-main">
        {activeTab === 'skills' && renderSkillsTab()}
        {activeTab === 'itsm' && renderITSMTab()}
        {activeTab === 'health' && renderHealthTab()}
        {activeTab === 'analytics' && renderAnalyticsTab()}
        {activeTab === 'branding' && renderBrandingTab()}
      </main>
    </div>
  );
};

export default AdminConsole;
