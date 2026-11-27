import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ConfigProvider } from './context/ConfigContext';
import { CssBaseline, Typography } from '@mui/material';

import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import AcademicsPage from './pages/AcademicsPage';
import UsersPage from './pages/UsersPage';
import AttendancePage from './pages/AttendancePage';
import AssessmentsPage from './pages/AssessmentsPage';
import FeesPage from './pages/FeesPage';
import NoticesPage from './pages/NoticesPage';
import SettingsPage from './pages/SettingsPage';
import IamPage from './pages/IamPage';

import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';

export default function App() {
  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <AuthProvider>
        <ConfigProvider>
          <CssBaseline />
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <DashboardPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/unauthorized"
                element={<Typography sx={{ p: 4 }}>403 — You do not have permission to view this page.</Typography>}
              />
              <Route
                path="/academics"
                element={
                  <ProtectedRoute allowedRoles={['admin']} moduleKey="academics">
                    <AcademicsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/users"
                element={
                  <ProtectedRoute allowedRoles={['admin']} moduleKey="users">
                    <UsersPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/attendance"
                element={
                  <ProtectedRoute allowedRoles={['admin', 'teacher', 'student']} moduleKey="attendance">
                    <AttendancePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/assessments"
                element={
                  <ProtectedRoute allowedRoles={['admin', 'teacher', 'student']} moduleKey="assessments">
                    <AssessmentsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/fees"
                element={
                  <ProtectedRoute allowedRoles={['admin', 'accountant', 'auditor', 'student']} moduleKey="fees">
                    <FeesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/notices"
                element={
                  <ProtectedRoute moduleKey="notices">
                    <NoticesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings"
                element={
                  <ProtectedRoute allowedRoles={['admin', 'principal']} requireMfa>
                    <SettingsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/iam"
                element={
                  <ProtectedRoute allowedRoles={['admin', 'principal', 'auditor']} requireMfa>
                    <IamPage />
                  </ProtectedRoute>
                }
              />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </BrowserRouter>
        </ConfigProvider>
      </AuthProvider>
    </LocalizationProvider>
  );
}
