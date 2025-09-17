import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { v4 as uuidv4 } from 'uuid';
import type { FeedbackSummary } from './preload';

// Main App Component
const TroubleshooterApp: React.FC = () => {
  const [messages, setMessages] = useState<Array<{text: string, sender: 'user' | 'ai', timestamp: Date}>>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [appVersion, setAppVersion] = useState('');
  const [feedbackComment, setFeedbackComment] = useState('');
  const [feedbackState, setFeedbackState] = useState<{ submitted: boolean; rating?: 'up' | 'down'; error?: string }>({ submitted: false });
  const [sessionId] = useState(() => uuidv4());
  const [summary, setSummary] = useState<FeedbackSummary | null>(null);

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

    window.electronAPI.getFeedbackSummary().then(setSummary).catch(() => {
      // ignore initial failures; summary will populate after first submission
    });

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

  const handleFeedback = async (rating: 'up' | 'down') => {
    if (feedbackState.submitted && feedbackState.rating === rating && !feedbackState.error) {
      return;
    }

    try {
      const result = await window.electronAPI.submitFeedback({
        rating,
        comment: feedbackComment,
        sessionId,
        resolved: rating === 'up',
        executionTimeMs: Math.floor(Math.random() * 2000) + 500
      });
      setFeedbackState({ submitted: true, rating });
      setSummary(result);
    } catch (error) {
      console.error('Failed to submit feedback', error);
      setFeedbackState({ submitted: true, rating, error: 'Unable to record feedback right now.' });
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

      <div className="feedback-panel">
        <div className="feedback-header">
          <span>Was this conversation helpful?</span>
          {feedbackState.submitted && !feedbackState.error && (
            <span className="feedback-status">Thanks for your feedback!</span>
          )}
        </div>
        <div className="feedback-actions">
          <button
            className={`feedback-button positive ${feedbackState.rating === 'up' ? 'selected' : ''}`}
            onClick={() => handleFeedback('up')}
            aria-label="Thumbs up"
          >
            👍
          </button>
          <button
            className={`feedback-button negative ${feedbackState.rating === 'down' ? 'selected' : ''}`}
            onClick={() => handleFeedback('down')}
            aria-label="Thumbs down"
          >
            👎
          </button>
        </div>
        <textarea
          className="feedback-comment"
          placeholder="Share additional details (optional)"
          value={feedbackComment}
          onChange={(event) => setFeedbackComment(event.target.value)}
          maxLength={500}
        />
        {feedbackState.error && (
          <div className="feedback-error">{feedbackState.error}</div>
        )}
        {summary && (
          <div className="feedback-summary">
            <div>
              <strong>Satisfaction:</strong> {summary.satisfactionScore}%
            </div>
            <div>
              <strong>MTTR:</strong> {summary.mttrMs ? `${summary.mttrMs} ms` : 'n/a'}
            </div>
          </div>
        )}
      </div>

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

        .feedback-panel {
          padding: 16px;
          background: #ffffff;
          border-top: 1px solid #e2e8f0;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .feedback-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 0.95rem;
          color: #1e293b;
        }

        .feedback-status {
          font-size: 0.85rem;
          color: #10b981;
        }

        .feedback-actions {
          display: flex;
          gap: 8px;
        }

        .feedback-button {
          flex: 1;
          padding: 10px;
          border-radius: 8px;
          border: 1px solid #cbd5f5;
          background: #f8fafc;
          font-size: 1.2rem;
          cursor: pointer;
          transition: transform 0.1s ease, background-color 0.2s ease;
        }

        .feedback-button:hover {
          transform: translateY(-1px);
          background: #e0e7ff;
        }

        .feedback-button.selected {
          border-color: #4f46e5;
          background: #eef2ff;
        }

        .feedback-button.positive.selected {
          color: #16a34a;
        }

        .feedback-button.negative.selected {
          color: #dc2626;
        }

        .feedback-comment {
          min-height: 60px;
          border-radius: 6px;
          border: 1px solid #e2e8f0;
          padding: 8px;
          resize: vertical;
          font-family: inherit;
        }

        .feedback-error {
          color: #dc2626;
          font-size: 0.85rem;
        }

        .feedback-summary {
          display: flex;
          gap: 16px;
          font-size: 0.85rem;
          color: #475569;
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
