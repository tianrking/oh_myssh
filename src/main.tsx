import { Buffer } from 'buffer';
// @microsoft/dev-tunnels-ssh expects Buffer in the browser
(globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
