import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);

// Register service worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker
      .register('/service-worker.js')
      .then(function(reg) {
        console.log('SW registered:', reg.scope);
      })
      .catch(function(err) {
        console.log('SW registration failed:', err);
      });
  });
}