import React, { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  Box, 
  Button, 
  TextField, 
  Typography, 
  Container, 
  Paper, 
  Avatar,
  Alert
} from '@mui/material';
import { LockOutlined as LockOutlinedIcon } from '@mui/icons-material';
import {
  getDefaultLandingPath,
  setAuthSession,
} from '../../../shared/auth/authStorage';

const LoginPage = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const sessionExpired = useMemo(
    () => new URLSearchParams(location.search).get('expired') === '1',
    [location.search],
  );

  const apiBase = process.env.REACT_APP_API_URL || 'http://localhost:3001';

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    try {
      const res = await fetch(`${apiBase}/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      
      if (res.ok) {
        const loginResponse = await res.json();

        if (!loginResponse.status) {
          setError(loginResponse?.error || 'Unexpected error');
          return;
        }

        const responseData = loginResponse.data;

        const accessToken = responseData?.access_token;
        const user = responseData?.user;
        if (typeof accessToken !== 'string' || !accessToken.trim() || !user) {
          setError('Unexpected response from server. Please try again.');
          return;
        }
        setAuthSession({ accessToken, user });
        navigate(getDefaultLandingPath(user?.type), { replace: true });
      } else {
        setError('Invalid username or password');
      }
    } catch {
      setError('Connection to backend failed');
    }
  };

  return (
    <Box 
      sx={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        backgroundColor: '#f5f5f5' 
      }}
    >
      <Container component="main" maxWidth="xs">
        <Paper 
          elevation={6} 
          sx={{ 
            padding: 4, 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center',
            borderRadius: 2
          }}
        >
          <Avatar sx={{ m: 1, bgcolor: 'primary.main' }}>
            <LockOutlinedIcon />
          </Avatar>
          <Typography component="h1" variant="h5" sx={{ mb: 3 }}>
            HungViet Ads Control Panel
          </Typography>
          
          {sessionExpired && (
            <Alert severity="warning" sx={{ width: '100%', mb: 2 }}>
              Your session ended. Please sign in again.
            </Alert>
          )}
          {error && (
            <Alert severity="error" sx={{ width: '100%', mb: 2 }}>
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleLogin} noValidate sx={{ mt: 1, width: '100%' }}>
            <TextField
              margin="normal"
              required
              fullWidth
              id="username"
              label="Username"
              name="username"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              name="password"
              label="Password"
              type="password"
              id="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button
              type="submit"
              fullWidth
              variant="contained"
              sx={{ mt: 3, mb: 2, py: 1.5 }}
            >
              Sign In
            </Button>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
};

export default LoginPage;
