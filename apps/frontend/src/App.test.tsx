import React from 'react';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { createAppRouteObjects } from './App';
import { PANEL_PREFIX } from './shared/auth/authStorage';

const appTheme = createTheme();

describe('App panel login route', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders the login form when visiting /{REACT_APP_PANEL_PREFIX}', () => {
    const router = createMemoryRouter(createAppRouteObjects(), {
      initialEntries: [`/${PANEL_PREFIX}`],
    });
    render(
      <ThemeProvider theme={appTheme}>
        <CssBaseline />
        <RouterProvider router={router} />
      </ThemeProvider>,
    );

    expect(
      screen.getByRole('heading', { name: /HungViet Ads Control Panel/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /username/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /sign in/i }),
    ).toBeInTheDocument();
  });
});
