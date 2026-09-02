import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Toaster } from '@/components/ui/toaster';
import Layout from '@/components/layout/Layout';
import LoginPage from '@/pages/LoginPage';
import DashboardPage from '@/pages/DashboardPage';
import CompaniesPage from '@/pages/CompaniesPage';
import CompanyDetailPage from '@/pages/CompanyDetailPage';
import CompanyFormPage from '@/pages/CompanyFormPage';
import GroupsPage from '@/pages/GroupsPage';
import TemplatesPage from '@/pages/TemplatesPage';
import CampaignsPage from '@/pages/CampaignsPage';
import CampaignDetailPage from '@/pages/CampaignDetailPage';
import SmtpConfigPage from '@/pages/SmtpConfigPage';
import UsersPage from '@/pages/UsersPage';
import AuditLogPage from '@/pages/AuditLogPage';
import ImportPage from '@/pages/ImportPage';

function PrivateRoute({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { user, isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (adminOnly && user?.role !== 'ADMIN') return <Navigate to="/" replace />;
  return <Layout>{children}</Layout>;
}

function App() {
  const { fetchMe, logout } = useAuth();
  const location = useLocation();
  const isLoginPage = location.pathname === '/login';

  useEffect(() => {
    const handleLogout = () => { logout(); };
    window.addEventListener('auth:logout', handleLogout);
    return () => window.removeEventListener('auth:logout', handleLogout);
  }, [logout]);

  useEffect(() => {
    if (!isLoginPage && localStorage.getItem('token')) fetchMe();
  }, [isLoginPage]);

  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<PrivateRoute><DashboardPage /></PrivateRoute>} />
        <Route path="/companies" element={<PrivateRoute><CompaniesPage /></PrivateRoute>} />
        <Route path="/companies/new" element={<PrivateRoute><CompanyFormPage /></PrivateRoute>} />
        <Route path="/companies/:id" element={<PrivateRoute><CompanyDetailPage /></PrivateRoute>} />
        <Route path="/groups" element={<PrivateRoute><GroupsPage /></PrivateRoute>} />
        <Route path="/templates" element={<PrivateRoute><TemplatesPage /></PrivateRoute>} />
        <Route path="/campaigns" element={<PrivateRoute><CampaignsPage /></PrivateRoute>} />
        <Route path="/campaigns/:id" element={<PrivateRoute><CampaignDetailPage /></PrivateRoute>} />
        <Route path="/smtp" element={<PrivateRoute adminOnly><SmtpConfigPage /></PrivateRoute>} />
        <Route path="/users" element={<PrivateRoute adminOnly><UsersPage /></PrivateRoute>} />
        <Route path="/audit" element={<PrivateRoute adminOnly><AuditLogPage /></PrivateRoute>} />
        <Route path="/import" element={<PrivateRoute><ImportPage /></PrivateRoute>} />
      </Routes>
      <Toaster />
    </>
  );
}

export default App;
