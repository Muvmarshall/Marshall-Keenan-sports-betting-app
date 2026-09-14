import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.js';
import { SlipProvider } from './context/SlipContext.js';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <SlipProvider>
        <App />
      </SlipProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
