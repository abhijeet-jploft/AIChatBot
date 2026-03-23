import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import 'bootstrap/dist/js/bootstrap.bundle.min.js';
import App from './App';
import { AuthProvider } from './admin/context/AuthContext';
import AdminApp from './admin/AdminApp';
import { SuperAuthProvider } from './super_admin/context/AuthContext';
import { SaThemeProvider } from './super_admin/context/ThemeContext';
import SuperAdminApp from './super_admin/SuperAdminApp';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/super-admin/*" element={
          <div style={{ minHeight: '100dvh' }}>
            <SuperAuthProvider>
              <SaThemeProvider>
                <SuperAdminApp />
              </SaThemeProvider>
            </SuperAuthProvider>
          </div>
        } />
        <Route path="/admin/*" element={
          <div data-theme="light" style={{ minHeight: '100dvh' }}>
            <AuthProvider>
              <AdminApp />
            </AuthProvider>
          </div>
        } />
        <Route path="/*" element={<App />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
