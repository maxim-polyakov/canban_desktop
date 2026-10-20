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
import BrowseIssuePage from './pages/BrowseIssuePage.jsx';
import BoardArchivePage from './pages/BoardArchivePage.jsx';
import BacklogPage from './pages/BacklogPage.jsx';
import ProjectReportsPage from './pages/ProjectReportsPage.jsx';
import HomePage from './pages/HomePage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import UsersPage from './pages/UsersPage.jsx';
import IssueNavigatorPage from './pages/IssueNavigatorPage.jsx';
import FiltersPage from './pages/FiltersPage.jsx';
import RoadmapPage from './pages/RoadmapPage.jsx';
import ProjectSettingsPage from './pages/ProjectSettingsPage.jsx';
import OperationsPage from './pages/OperationsPage.jsx';
import { DashboardPage, DashboardsListPage } from './pages/dashboards/DashboardsPages.jsx';
import ForYouPage from './pages/ForYouPage.jsx';
import SpacesPage from './pages/SpacesPage.jsx';
import SpaceTemplatesPage from './pages/spaces/SpaceTemplatesPage.jsx';
import { CreatePlanPage, PlanPage, PlansListPage } from './pages/plans/PlansPages.jsx';
import { SpaceCalendarPage, SpaceFeaturesPage, SpaceListPage, SpaceSummaryPage } from './pages/spaces/SpaceViews.jsx';
import SpaceDocsPage from './pages/spaces/SpaceDocsPage.jsx';
import SpaceDevelopmentPage from './pages/spaces/SpaceDevelopmentPage.jsx';
import { SpaceFormEditPage, SpaceFormSubmitPage, SpaceFormsListPage } from './pages/spaces/SpaceFormsPage.jsx';
import { KudosPage, PeoplePage, TeamPage, TeamsHomePage, TeamsListPage } from './pages/teams/TeamsPages.jsx';
import { HomeDirectoryPage, HomeUpdatesPage } from './pages/home/HomePages.jsx';
import { HomeItemPage } from './pages/home/HomeItemPage.jsx';
import { AssetObjectPage, AssetSchemaPage, AssetSearchPage, AssetsHomePage } from './pages/assets/AssetsPages.jsx';
import PersonalGeneralPage from './pages/settings/PersonalGeneralPage.jsx';
import PersonalSecurityPage from './pages/settings/PersonalSecurityPage.jsx';
import PersonalNotificationsPage from './pages/settings/PersonalNotificationsPage.jsx';
import IssueTypesPage from './pages/settings/IssueTypesPage.jsx';
import { CustomFieldsPage } from './pages/settings/IssueConfigPages.jsx';
import AuditLogPage from './pages/settings/AuditLogPage.jsx';
import GroupsPage from './pages/settings/GroupsPage.jsx';
import SpaceSettingsPage, { SpaceFieldsPage } from './pages/settings/SpaceSettingsPage.jsx';
import { FieldConfigurationsPage, ScreensPage } from './pages/settings/IssueLayoutPages.jsx';
import { WorkflowDesignerPage, WorkflowsPage } from './pages/settings/WorkflowPages.jsx';
import { AdminAppsPage, AdminOverviewPage, AdminSystemPage, AdminUsersPage } from './pages/settings/AdminPages.jsx';
import { AdminBillingChangePage, AdminBillingPage, AdminBillingPlansPage } from './pages/settings/BillingPages.jsx';
import { useApplyTheme, usePrefs } from './utils/preferences.js';

const HOME_REDIRECTS = { spaces: '/spaces', issues: '/issues' };

function HomeRoute() {
  const [prefs] = usePrefs();
  const target = HOME_REDIRECTS[prefs.homePage];
  return target ? <Navigate to={target} replace /> : <ForYouPage />;
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const { t } = useLocalization();
  if (loading) return <div className="page">{t('Загрузка...')}</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const { user } = useAuth();
  useApplyTheme();
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
          <Route index element={<HomeRoute />} />
          <Route path="for-you" element={<ForYouPage />} />
          <Route path="spaces" element={<SpacesPage />} />
          <Route path="spaces/templates" element={<SpaceTemplatesPage />} />
          <Route path="plans" element={<PlansListPage />} />
          <Route path="plans/new" element={<CreatePlanPage />} />
          <Route path="plans/:planId" element={<PlanPage />} />
          <Route path="spaces/templates/:templateId" element={<SpaceTemplatesPage />} />
          <Route path="teams" element={<TeamsHomePage />} />
          <Route path="teams/list" element={<TeamsListPage />} />
          <Route path="teams/manage" element={<HomePage />} />
          <Route path="teams/:teamId" element={<TeamPage />} />
          <Route path="people" element={<PeoplePage />} />
          <Route path="people/:userId" element={<ProfilePage />} />
          <Route path="kudos" element={<KudosPage />} />
          <Route path="projects" element={<HomeDirectoryPage key="projects" kind="projects" />} />
          <Route path="projects/following" element={<HomeDirectoryPage key="projects-following" kind="projects" view="following" />} />
          <Route path="projects/archived" element={<HomeDirectoryPage key="projects-archived" kind="projects" view="archived" />} />
          <Route path="projects/updates" element={<HomeUpdatesPage key="projects-updates" kind="projects" />} />
          <Route path="projects/:itemId/:tab?" element={<HomeItemPage key="projects-item" kind="projects" />} />
          <Route path="goals" element={<HomeDirectoryPage key="goals" kind="goals" />} />
          <Route path="goals/following" element={<HomeDirectoryPage key="goals-following" kind="goals" view="following" />} />
          <Route path="goals/archived" element={<HomeDirectoryPage key="goals-archived" kind="goals" view="archived" />} />
          <Route path="goals/updates" element={<HomeUpdatesPage key="goals-updates" kind="goals" />} />
          <Route path="goals/:itemId/:tab?" element={<HomeItemPage key="goals-item" kind="goals" />} />
          <Route path="assets" element={<AssetsHomePage />} />
          <Route path="assets/search" element={<AssetSearchPage />} />
          <Route path="assets/schema/:schemaId" element={<AssetSchemaPage />} />
          <Route path="assets/object/:objectId" element={<AssetObjectPage />} />
          <Route path="settings/personal/general" element={<PersonalGeneralPage />} />
          <Route path="settings/personal/notifications" element={<PersonalNotificationsPage />} />
          <Route path="settings/personal/security" element={<PersonalSecurityPage />} />
          <Route path="settings/issues/issue-types" element={<IssueTypesPage />} />
          <Route path="settings/issues/fields" element={<CustomFieldsPage />} />
          <Route path="settings/issues/screens" element={<ScreensPage />} />
          <Route path="settings/issues/field-configurations" element={<FieldConfigurationsPage />} />
          <Route path="settings/issues/workflows" element={<WorkflowsPage />} />
          <Route path="settings/issues/workflows/:id" element={<WorkflowDesignerPage />} />
          <Route path="notifications-settings" element={<Navigate to="/settings/personal/notifications" replace />} />
          <Route path="admin" element={<AdminOverviewPage />} />
          <Route path="admin/system" element={<AdminSystemPage />} />
          <Route path="admin/audit" element={<AuditLogPage />} />
          <Route path="admin/groups" element={<GroupsPage />} />
          <Route path="admin/apps" element={<AdminAppsPage />} />
          <Route path="admin/users" element={<AdminUsersPage />} />
          <Route path="admin/billing" element={<AdminBillingPage />} />
          <Route path="admin/billing/plans" element={<AdminBillingPlansPage />} />
          <Route path="admin/billing/change" element={<AdminBillingChangePage />} />
          <Route path="board/:boardId/settings" element={<SpaceSettingsPage />} />
          <Route path="board/:boardId/fields" element={<SpaceFieldsPage />} />
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
          <Route path="board/:boardId/summary" element={<SpaceSummaryPage />} />
          <Route path="board/:boardId/docs" element={<SpaceDocsPage />} />
          <Route path="board/:boardId/docs/:docId" element={<SpaceDocsPage />} />
          <Route path="board/:boardId/forms" element={<SpaceFormsListPage />} />
          <Route path="board/:boardId/forms/:formId" element={<SpaceFormEditPage />} />
          <Route path="board/:boardId/forms/:formId/submit" element={<SpaceFormSubmitPage />} />
          <Route path="board/:boardId/development" element={<SpaceDevelopmentPage />} />
          <Route path="board/:boardId/list" element={<SpaceListPage />} />
          <Route path="board/:boardId/calendar" element={<SpaceCalendarPage />} />
          <Route path="board/:boardId/features" element={<SpaceFeaturesPage mode="features" />} />
          <Route path="board/:boardId/access" element={<SpaceFeaturesPage mode="access" />} />
          <Route path="issues" element={<IssueNavigatorPage />} />
          <Route path="browse/:issueKey" element={<BrowseIssuePage />} />
          <Route path="filters" element={<FiltersPage />} />
          <Route path="dashboards" element={<DashboardsListPage />} />
          <Route path="dashboards/:dashboardId" element={<DashboardPage />} />
          <Route path="dashboards/:dashboardId/edit" element={<DashboardPage editing />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="profile/:userId" element={<ProfilePage />} />
          <Route path="users" element={<UsersPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
