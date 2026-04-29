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
import NotFoundPage from './features/errors/pages/NotFoundPage';
import AdminLayout from './shared/components/layout/AdminLayout';
import { hasValidSession, PANEL_PREFIX } from './shared/auth/authStorage';

const appTheme = createTheme();

const ProtectedRoute = ({ children }: { children: React.ReactElement }) => {
  if (!hasValidSession()) return <Navigate to={`/${PANEL_PREFIX}`} replace />;
  return children;
};

const PublicRoute = ({ children }: { children: React.ReactElement }) => {
  if (hasValidSession()) return <Navigate to={`/${PANEL_PREFIX}/dashboard`} replace />;
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
          <AdminLayout>
            <Dashboard />
          </AdminLayout>
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
          <AdminLayout>
            <ProductsPage />
          </AdminLayout>
        </ProtectedRoute>
      ),
    },
    {
      path: `${panelBase}/orders`,
      element: (
        <ProtectedRoute>
          <AdminLayout>
            <OrdersPage />
          </AdminLayout>
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
