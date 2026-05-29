import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import KeyIcon from '@mui/icons-material/Key';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../../shared/api/apiClient';
import {
  getStoredUser,
  PANEL_PREFIX,
} from '../../../shared/auth/authStorage';

interface OrganizationUser {
  id: number;
  username: string;
  display_name: string;
  type: string;
  created_at: string | null;
  updated_at: string | null;
}

const MIN_PASSWORD_LENGTH = 6;

const ROLE_COLORS: Record<
  string,
  'default' | 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'error'
> = {
  admin: 'error',
  marketing: 'primary',
  sale: 'success',
};

const formatTimestamp = (iso: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
};

const UsersPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const currentUser = getStoredUser();
  const isAdmin = currentUser?.type === 'admin';

  const [resetTarget, setResetTarget] = useState<OrganizationUser | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);

  const usersQuery = useQuery<OrganizationUser[]>({
    queryKey: ['users', 'all'],
    queryFn: async () => {
      const response = await apiClient.get('/users');
      if (response.data.status) return response.data.data as OrganizationUser[];
      throw new Error(response.data.error || 'Failed to load users');
    },
    enabled: isAdmin,
  });

  const resetMutation = useMutation({
    mutationFn: async (payload: { id: number; newPassword: string }) => {
      const response = await apiClient.post(
        `/users/${payload.id}/reset-password`,
        { newPassword: payload.newPassword },
      );
      if (response.data.status) return response.data.data as OrganizationUser;
      throw new Error(response.data.error || 'Failed to reset password');
    },
    onSuccess: (user) => {
      queryClient.invalidateQueries({ queryKey: ['users', 'all'] });
      setResetSuccess(
        `Temporary password set for ${user.display_name} (${user.username}).`,
      );
      setResetTarget(null);
      setResetPassword('');
      setShowResetPassword(false);
    },
  });

  const openResetDialog = (user: OrganizationUser) => {
    setResetTarget(user);
    setResetPassword('');
    setShowResetPassword(false);
    setResetSuccess(null);
    resetMutation.reset();
  };

  const closeResetDialog = () => {
    if (resetMutation.isPending) return;
    setResetTarget(null);
    setResetPassword('');
    setShowResetPassword(false);
    resetMutation.reset();
  };

  const handleSubmitReset = () => {
    if (!resetTarget) return;
    if (resetPassword.length < MIN_PASSWORD_LENGTH) return;
    resetMutation.mutate({
      id: resetTarget.id,
      newPassword: resetPassword,
    });
  };

  const passwordTooShort =
    resetPassword.length > 0 && resetPassword.length < MIN_PASSWORD_LENGTH;

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3 }}>
        Users
      </Typography>

      <Paper sx={{ p: 3, mb: 4 }}>
        <Typography variant="body1" sx={{ mb: 2 }}>
          Manage your account settings and security.
        </Typography>
        <Button
          variant="outlined"
          onClick={() => navigate(`/${PANEL_PREFIX}/change-password`)}
        >
          Change Password
        </Button>
      </Paper>

      {isAdmin && (
        <>
          <Typography variant="h5" sx={{ mb: 2 }}>
            Organization Users
          </Typography>

          {resetSuccess && (
            <Alert
              severity="success"
              sx={{ mb: 2 }}
              onClose={() => setResetSuccess(null)}
            >
              {resetSuccess}
            </Alert>
          )}

          {usersQuery.isLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress />
            </Box>
          )}

          {usersQuery.error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {(usersQuery.error as Error).message}
            </Alert>
          )}

          {usersQuery.data && (
            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Username</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Display name</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Role</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Created</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Updated</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                      Actions
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {usersQuery.data.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        align="center"
                        sx={{ color: 'text.secondary', py: 3 }}
                      >
                        No users found.
                      </TableCell>
                    </TableRow>
                  )}
                  {usersQuery.data.map((u) => {
                    const isSelf = u.id === currentUser?.id;
                    return (
                      <TableRow key={u.id} hover>
                        <TableCell>{u.username}</TableCell>
                        <TableCell>{u.display_name}</TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={u.type}
                            color={ROLE_COLORS[u.type] ?? 'default'}
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell>{formatTimestamp(u.created_at)}</TableCell>
                        <TableCell>{formatTimestamp(u.updated_at)}</TableCell>
                        <TableCell align="right">
                          <Tooltip
                            title={
                              isSelf
                                ? 'Use "Change Password" above to update your own password.'
                                : 'Set a temporary password for this user.'
                            }
                          >
                            <span>
                              <Button
                                size="small"
                                variant="outlined"
                                startIcon={<KeyIcon />}
                                disabled={isSelf}
                                onClick={() => openResetDialog(u)}
                              >
                                Reset password
                              </Button>
                            </span>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </>
      )}

      <Dialog
        open={resetTarget !== null}
        onClose={closeResetDialog}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Set temporary password</DialogTitle>
        <DialogContent dividers>
          {resetTarget && (
            <Stack spacing={2}>
              <Box>
                <Typography variant="body2" color="text.secondary">
                  User
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 600 }}>
                  {resetTarget.display_name}{' '}
                  <Typography
                    component="span"
                    variant="body2"
                    color="text.secondary"
                  >
                    ({resetTarget.username} · {resetTarget.type})
                  </Typography>
                </Typography>
              </Box>

              {resetMutation.isError && (
                <Alert severity="error">
                  {(resetMutation.error as Error).message}
                </Alert>
              )}

              <TextField
                label="New temporary password"
                type={showResetPassword ? 'text' : 'password'}
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                autoFocus
                fullWidth
                error={passwordTooShort}
                helperText={
                  passwordTooShort
                    ? `Must be at least ${MIN_PASSWORD_LENGTH} characters.`
                    : `Minimum ${MIN_PASSWORD_LENGTH} characters. Share this with the user — they should change it after signing in.`
                }
                slotProps={{
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          aria-label="toggle password visibility"
                          edge="end"
                          onClick={() => setShowResetPassword((v) => !v)}
                        >
                          {showResetPassword ? (
                            <VisibilityOffIcon />
                          ) : (
                            <VisibilityIcon />
                          )}
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                }}
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeResetDialog} disabled={resetMutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSubmitReset}
            disabled={
              resetMutation.isPending ||
              resetPassword.length < MIN_PASSWORD_LENGTH
            }
          >
            {resetMutation.isPending ? (
              <CircularProgress size={20} />
            ) : (
              'Set password'
            )}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default UsersPage;
