import React from 'react';
import { Routes, Route, Navigate } from './i18n/navigation.jsx';
import { useAuth } from './context/AuthContext.jsx';
import { useLocalization } from './i18n/LocalizationContext.jsx';
import LanguageSelector from './components/LanguageSelector.jsx';
import Layout from './components/Layout.jsx';
import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import RegisterSuccessPage from './pages/RegisterSuccessPage.jsx';
import ForgotPasswordPage from './pages/ForgotPasswordPage.jsx';
import ForgotPasswordCodePage from './pages/ForgotPasswordCodePage.jsx';
import ForgotPasswordResetPage from './pages/ForgotPasswordResetPage.jsx';
import AuthCallbackPage from './pages/AuthCallbackPage.jsx';
import BoardPage from './pages/BoardPage.jsx';
import BoardArchivePage from './pages/BoardArchivePage.jsx';
import BacklogPage from './pages/BacklogPage.jsx';
import ProjectReportsPage from './pages/ProjectReportsPage.jsx';
import HomePage from './pages/HomePage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import UsersPage from './pages/UsersPage.jsx';
import IssueNavigatorPage from './pages/IssueNavigatorPage.jsx';
import RoadmapPage from './pages/RoadmapPage.jsx';
import ProjectSettingsPage from './pages/ProjectSettingsPage.jsx';
import OperationsPage from './pages/OperationsPage.jsx';
import DashboardsPage from './pages/DashboardsPage.jsx';
import ForYouPage from './pages/ForYouPage.jsx';
import NotificationSettingsPage from './pages/NotificationSettingsPage.jsx';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const { t } = useLocalization();
  if (loading) return <div className="page">{t('Загрузка...')}</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const { user } = useAuth();
  return (
    <div className="app">
      {!user && <LanguageSelector className="language-selector-public" />}
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/register/success" element={<RegisterSuccessPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/forgot-password/code" element={<ForgotPasswordCodePage />} />
        <Route path="/forgot-password/reset" element={<ForgotPasswordResetPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<ForYouPage />} />
          <Route path="spaces" element={<HomePage />} />
          <Route path="notifications-settings" element={<NotificationSettingsPage />} />
          <Route path="board/:boardId" element={<BoardPage />} />
          <Route path="board/:boardId/issue/:questId" element={<BoardPage />} />
          <Route path="board/:boardId/backlog" element={<BacklogPage />} />
          <Route path="board/:boardId/backlog/issue/:questId" element={<BacklogPage />} />
          <Route path="board/:boardId/reports" element={<ProjectReportsPage />} />
          <Route path="board/:boardId/roadmap" element={<RoadmapPage />} />
          <Route path="board/:boardId/components" element={<ProjectSettingsPage mode="components" />} />
          <Route path="board/:boardId/releases" element={<ProjectSettingsPage mode="releases" />} />
          <Route path="board/:boardId/workflow" element={<ProjectSettingsPage mode="workflow" />} />
          <Route path="board/:boardId/permissions" element={<ProjectSettingsPage mode="permissions" />} />
          <Route path="board/:boardId/automations" element={<ProjectSettingsPage mode="automations" />} />
          <Route path="board/:boardId/integrations" element={<ProjectSettingsPage mode="integrations" />} />
          <Route path="board/:boardId/operations" element={<OperationsPage />} />
          <Route path="board/:boardId/archive" element={<BoardArchivePage />} />
          <Route path="issues" element={<IssueNavigatorPage />} />
          <Route path="dashboards" element={<DashboardsPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="profile/:userId" element={<ProfilePage />} />
          <Route path="users" element={<UsersPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
