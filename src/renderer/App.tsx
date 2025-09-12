import React, { useState, useEffect } from 'react';
import './App.css';

const App: React.FC = () => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCount((c) => c + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="container">
      <h1>Windows AI Troubleshooter</h1>
      <p>Welcome to the Windows AI Troubleshooter application!</p>
      <p>Hot reload is working! Try changing this text or the CSS to see instant updates.</p>
      <div className="count-display">Count: {count}</div>
      <button onClick={() => setCount(count + 1)}>
        Increment Count
      </button>
    </div>
  );
};

export default App;