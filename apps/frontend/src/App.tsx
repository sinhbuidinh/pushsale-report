import React from 'react';
import {
  Navigate,
  RouterProvider,
  createBrowserRouter,
  type RouteObject,
} from 'react-router-dom';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import LandingPage from './features/landing/pages/LandingPage';
import LoginPage from './features/auth/pages/LoginPage';
import Dashboard from './features/dashboard/pages/Dashboard';
import UsersPage from './features/users/pages/UsersPage';
import ChangePasswordPage from './features/users/pages/ChangePasswordPage';
import ProductsPage from './features/products/pages/ProductsPage';
import OrdersPage from './features/orders/pages/OrdersPage';
import FacebookAdsSyncPage from './features/facebook-ads/pages/FacebookAdsSyncPage';
import MarketingSummaryPage from './features/marketing-summary/pages/MarketingSummaryPage';
import ProfitSegmentsPage from './features/profit-segments/pages/ProfitSegmentsPage';
import NotFoundPage from './features/errors/pages/NotFoundPage';
import AdminLayout from './shared/components/layout/AdminLayout';
import {
  getDefaultLandingPath,
  getStoredUser,
  hasValidSession,
  PANEL_PREFIX,
} from './shared/auth/authStorage';

const appTheme = createTheme();

const ProtectedRoute = ({ children }: { children: React.ReactElement }) => {
  if (!hasValidSession()) return <Navigate to={`/${PANEL_PREFIX}`} replace />;
  return children;
};

const PublicRoute = ({ children }: { children: React.ReactElement }) => {
  if (hasValidSession()) {
    return <Navigate to={getDefaultLandingPath(getStoredUser()?.type)} replace />;
  }
  return children;
};

/**
 * Restricts a route to a set of user roles. Anyone else is sent to their
 * default landing page (e.g. a marketing user hitting `/dashboard` lands on
 * `/marketing-summary`).
 */
const RoleRoute = ({
  allow,
  children,
}: {
  allow: ReadonlyArray<string>;
  children: React.ReactElement;
}) => {
  const userType = getStoredUser()?.type;
  if (userType && !allow.includes(userType)) {
    return <Navigate to={getDefaultLandingPath(userType)} replace />;
  }
  return children;
};

/** Same route tree as production; used by tests with `createMemoryRouter`. */
export function createAppRouteObjects(): RouteObject[] {
  const panelBase = `/${PANEL_PREFIX}`;
  return [
    { path: '/', element: <LandingPage /> },
    { path: panelBase, element: <PublicRoute><LoginPage /></PublicRoute> },
    {
      path: `${panelBase}/dashboard`,
      element: (
        <ProtectedRoute>
          <RoleRoute allow={['admin', 'sale']}>
            <AdminLayout>
              <Dashboard />
            </AdminLayout>
          </RoleRoute>
        </ProtectedRoute>
      ),
    },
    {
      path: `${panelBase}/users`,
      element: (
        <ProtectedRoute>
          <AdminLayout>
            <UsersPage />
          </AdminLayout>
        </ProtectedRoute>
      ),
    },
    {
      path: `${panelBase}/change-password`,
      element: (
        <ProtectedRoute>
          <AdminLayout>
            <ChangePasswordPage />
          </AdminLayout>
        </ProtectedRoute>
      ),
    },
    {
      path: `${panelBase}/products`,
      element: (
        <ProtectedRoute>
          <RoleRoute allow={['admin']}>
            <AdminLayout>
              <ProductsPage />
            </AdminLayout>
          </RoleRoute>
        </ProtectedRoute>
      ),
    },
    {
      path: `${panelBase}/orders`,
      element: (
        <ProtectedRoute>
          <RoleRoute allow={['admin']}>
            <AdminLayout>
              <OrdersPage />
            </AdminLayout>
          </RoleRoute>
        </ProtectedRoute>
      ),
    },
    {
      path: `${panelBase}/facebook-ads`,
      element: (
        <ProtectedRoute>
          <RoleRoute allow={['admin']}>
            <AdminLayout>
              <FacebookAdsSyncPage />
            </AdminLayout>
          </RoleRoute>
        </ProtectedRoute>
      ),
    },
    {
      path: `${panelBase}/marketing-summary`,
      element: (
        <ProtectedRoute>
          <RoleRoute allow={['admin', 'marketing']}>
            <AdminLayout>
              <MarketingSummaryPage />
            </AdminLayout>
          </RoleRoute>
        </ProtectedRoute>
      ),
    },
    {
      path: `${panelBase}/profit-segments`,
      element: (
        <ProtectedRoute>
          <RoleRoute allow={['admin']}>
            <AdminLayout>
              <ProfitSegmentsPage />
            </AdminLayout>
          </RoleRoute>
        </ProtectedRoute>
      ),
    },
    { path: '*', element: <NotFoundPage /> },
  ];
}

const router = createBrowserRouter(createAppRouteObjects());

function App() {
  return (
    <ThemeProvider theme={appTheme}>
      <CssBaseline />
      <RouterProvider router={router} />
    </ThemeProvider>
  );
}

export default App;
