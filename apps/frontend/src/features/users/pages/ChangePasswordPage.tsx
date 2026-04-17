import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { 
  Typography, Box, TextField, Button, Paper, Alert, CircularProgress 
} from '@mui/material';
import apiClient from '../../../shared/api/apiClient';
import { getStoredUser } from '../../../shared/auth/authStorage';

const ChangePasswordPage = () => {
  const [newPassword, setNewPassword] = useState('');
  const [success, setSuccess] = useState(false);

  const mutation = useMutation({
    mutationFn: (password: string) => {
      return apiClient.post('/auth/change-password', { newPassword: password });
    },
    onSuccess: () => {
      setSuccess(true);
      setNewPassword('');
    },
  });

  const handleUpdate = () => {
    if (!newPassword) return;
    setSuccess(false);
    mutation.mutate(newPassword);
  };

  const user = getStoredUser();

  return (
    <Box sx={{ maxWidth: 500, mt: 4 }}>
      <Typography variant="h4" sx={{ mb: 3 }}>User Profile</Typography>
      
      <Paper sx={{ p: 3, mb: 4 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Account Information</Typography>
        {user && (
          <Box sx={{ mb: 3 }}>
            <Typography><strong>Username:</strong> {user.username}</Typography>
            <Typography><strong>Display Name:</strong> {user.display_name}</Typography>
            <Typography><strong>Role:</strong> {user.type}</Typography>
          </Box>
        )}

        <Typography variant="h6" sx={{ mb: 2 }}>Change Password</Typography>
        {success && (
          <Alert severity="success" sx={{ mb: 2 }}>Password updated successfully!</Alert>
        )}
        {mutation.isError && (
          <Alert severity="error" sx={{ mb: 2 }}>Failed to update password.</Alert>
        )}
        
        <TextField
          fullWidth
          label="New Password"
          type="password"
          variant="outlined"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          sx={{ mb: 2 }}
        />
        <Button 
          variant="contained" 
          onClick={handleUpdate}
          disabled={mutation.isPending || !newPassword}
        >
          {mutation.isPending ? <CircularProgress size={24} /> : 'UPDATE PASSWORD'}
        </Button>
      </Paper>
    </Box>
  );
};

export default ChangePasswordPage;
