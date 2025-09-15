import React, { useState } from 'react';
import { useSecurity } from './SecurityContext';
import './Login.css';

const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login, auth } = useSecurity();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const success = await login(username, password);

    if (!success) {
      // Error is already handled in the security context
      setIsLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1>Admin Console</h1>
          <p>Windows AI Troubleshooter</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              required
              disabled={isLoading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              disabled={isLoading}
            />
          </div>

          {auth.error && (
            <div className="error-message">
              {auth.error}
            </div>
          )}

          <button
            type="submit"
            className="login-button"
            disabled={isLoading || !username || !password}
          >
            {isLoading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="login-footer">
          <p>Demo Credentials:</p>
          <div className="credential-list">
            <div className="credential">
              <strong>Admin:</strong> admin / password
            </div>
            <div className="credential">
              <strong>Operator:</strong> operator / password
            </div>
            <div className="credential">
              <strong>Viewer:</strong> viewer / password
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;