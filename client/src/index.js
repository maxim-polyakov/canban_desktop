import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from './i18n/navigation.jsx';
import { LocalizationProvider } from './i18n/LocalizationContext.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import App from './App.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <LocalizationProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </LocalizationProvider>
    </BrowserRouter>
  </React.StrictMode>
);
