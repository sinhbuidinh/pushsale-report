import React from 'react';
import { Typography, Paper, Button, Box } from '@mui/material';
import { useNavigate } from 'react-router-dom';

const UsersPage = () => {
  const navigate = useNavigate();

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3 }}>Users</Typography>
      <Paper sx={{ p: 3, mb: 4 }}>
        <Typography variant="body1" sx={{ mb: 2 }}>
          Manage your account settings and security.
        </Typography>
        <Button 
          variant="outlined" 
          onClick={() => navigate('/x-panel-5661/change-password')}
        >
          Change Password
        </Button>
      </Paper>

      <Typography variant="h5" sx={{ mb: 2 }}>Organization Users</Typography>
      <Paper sx={{ p: 3 }}>
        <Typography color="text.secondary">
          DataTable for all users will be integrated here using @mui/x-data-grid.
        </Typography>
      </Paper>
    </Box>
  );
};

export default UsersPage;
