import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

// Main App Component
const TroubleshooterApp: React.FC = () => {
  const [messages, setMessages] = useState<Array<{text: string, sender: 'user' | 'ai', timestamp: Date}>>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [appVersion, setAppVersion] = useState('');

  // Get app version on component mount
  useEffect(() => {
    const getVersion = async () => {
      try {
        const version = await window.electronAPI.getAppVersion();
        setAppVersion(version);
      } catch (error) {
        console.error('Failed to get app version:', error);
        setAppVersion('1.0.0');
      }
    };

    getVersion();

    // Add welcome message
    setMessages([
      {
        text: "Hello! I'm your Windows Troubleshooting Companion. How can I help you today?",
        sender: 'ai',
        timestamp: new Date()
      }
    ]);
  }, []);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!inputText.trim() || isLoading) return;

    // Add user message
    const userMessage = {
      text: inputText,
      sender: 'user' as const,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsLoading(true);

    // Simulate AI response (will be replaced with actual skill execution)
    setTimeout(() => {
      const aiResponse = {
        text: "I understand you're having an issue. Let me help you troubleshoot this. What specific problem are you experiencing?",
        sender: 'ai' as const,
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, aiResponse]);
      setIsLoading(false);
    }, 1000);
  };

  const handleMinimize = async () => {
    try {
      await window.electronAPI.minimizeToTray();
    } catch (error) {
      console.error('Failed to minimize:', error);
    }
  };

  return (
    <div className="troubleshooter-app">
      {/* Header */}
      <header className="app-header">
        <div className="header-content">
          <h1>Troubleshooting Companion</h1>
          <button 
            className="minimize-btn"
            onClick={handleMinimize}
            title="Minimize to tray"
          >
            −
          </button>
        </div>
      </header>

      {/* Chat Messages */}
      <div className="chat-container">
        <div className="messages">
          {messages.map((message, index) => (
            <div key={index} className={`message ${message.sender}`}>
              <div className="message-bubble">
                <p>{message.text}</p>
                <span className="timestamp">
                  {message.timestamp.toLocaleTimeString()}
                </span>
              </div>
            </div>
          ))}
          
          {isLoading && (
            <div className="message ai">
              <div className="message-bubble">
                <div className="typing-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Input Area */}
      <form className="input-area" onSubmit={handleSendMessage}>
        <div className="input-container">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Describe your issue..."
            disabled={isLoading}
            className="message-input"
          />
          <button 
            type="submit" 
            disabled={!inputText.trim() || isLoading}
            className="send-button"
          >
            Send
          </button>
        </div>
      </form>

      {/* Footer */}
      <footer className="app-footer">
        <span className="version">v{appVersion}</span>
        <span className="status">● Connected</span>
      </footer>

      {/* Basic CSS styles */}
      <style>{`
        .troubleshooter-app {
          display: flex;
          flex-direction: column;
          height: 100vh;
          background: #f5f5f5;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }

        .app-header {
          background: #0078d4;
          color: white;
          padding: 12px 16px;
          -webkit-app-region: drag;
        }

        .header-content {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .header-content h1 {
          margin: 0;
          font-size: 14px;
          font-weight: 600;
        }

        .minimize-btn {
          background: none;
          border: none;
          color: white;
          font-size: 18px;
          cursor: pointer;
          padding: 4px 8px;
          border-radius: 3px;
          -webkit-app-region: no-drag;
        }

        .minimize-btn:hover {
          background: rgba(255, 255, 255, 0.1);
        }

        .chat-container {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
        }

        .messages {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .message {
          display: flex;
        }

        .message.user {
          justify-content: flex-end;
        }

        .message.ai {
          justify-content: flex-start;
        }

        .message-bubble {
          max-width: 70%;
          padding: 12px 16px;
          border-radius: 18px;
          position: relative;
        }

        .message.user .message-bubble {
          background: #0078d4;
          color: white;
          border-bottom-right-radius: 4px;
        }

        .message.ai .message-bubble {
          background: white;
          color: #333;
          border: 1px solid #ddd;
          border-bottom-left-radius: 4px;
        }

        .message-bubble p {
          margin: 0 0 8px 0;
          line-height: 1.4;
        }

        .timestamp {
          font-size: 11px;
          opacity: 0.7;
        }

        .typing-indicator {
          display: flex;
          gap: 4px;
          align-items: center;
        }

        .typing-indicator span {
          width: 6px;
          height: 6px;
          background: #999;
          border-radius: 50%;
          animation: typing 1.4s infinite ease-in-out;
        }

        .typing-indicator span:nth-child(1) { animation-delay: 0s; }
        .typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
        .typing-indicator span:nth-child(3) { animation-delay: 0.4s; }

        @keyframes typing {
          0%, 60%, 100% { transform: scale(1); opacity: 0.4; }
          30% { transform: scale(1.2); opacity: 1; }
        }

        .input-area {
          padding: 16px;
          background: white;
          border-top: 1px solid #ddd;
        }

        .input-container {
          display: flex;
          gap: 8px;
        }

        .message-input {
          flex: 1;
          padding: 12px 16px;
          border: 1px solid #ddd;
          border-radius: 20px;
          outline: none;
          font-size: 14px;
        }

        .message-input:focus {
          border-color: #0078d4;
        }

        .send-button {
          padding: 12px 20px;
          background: #0078d4;
          color: white;
          border: none;
          border-radius: 20px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 600;
        }

        .send-button:disabled {
          background: #ccc;
          cursor: not-allowed;
        }

        .send-button:not(:disabled):hover {
          background: #106ebe;
        }

        .app-footer {
          padding: 8px 16px;
          background: #f0f0f0;
          border-top: 1px solid #ddd;
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          color: #666;
        }

        .status {
          color: #4caf50;
        }
      `}</style>
    </div>
  );
};

// Render the app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('root');
  if (container) {
    const root = createRoot(container);
    root.render(<TroubleshooterApp />);
  }
});