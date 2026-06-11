import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Typography,
  Box,
  TextField,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Pagination,
  Chip,
  CircularProgress,
  Alert,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import { SyncStatus, SyncTriggerSource } from '@sync-project/shared';
import apiClient from '../../../shared/api/apiClient';

interface SyncLog {
  id: number;
  created_at: string;
  sync_date: string;
  trigger_source?: SyncTriggerSource;
  status: SyncStatus;
  synced_count: number;
  error_details: string | null;
  page_no: number | null;
  has_response?: boolean;
  data?: object | null;
}

interface SyncLogsResponse {
  data: SyncLog[];
  total: number;
  page: number;
  limit: number;
}

function canReplayLog(log: SyncLog): boolean {
  return log.page_no != null && log.has_response === true;
}

function getDetailsRaw(log: SyncLog): string | null {
  if (log.status === SyncStatus.Failed) {
    const d = log.error_details?.trim();
    return d ? log.error_details : null;
  }
  if (log.data != null) {
    return JSON.stringify(log.data);
  }
  return null;
}

/** Pretty-print if value is JSON object/array; otherwise return as-is. */
function formatDetailsDisplay(raw: string): { text: string; isJson: boolean } {
  const t = raw.trim();
  const looksJson =
    (t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'));
  if (looksJson) {
    try {
      return {
        text: JSON.stringify(JSON.parse(raw), null, 2),
        isJson: true,
      };
    } catch {
      return { text: raw, isJson: false };
    }
  }
  return { text: raw, isJson: false };
}

const detailsPreSx = {
  m: 0,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  fontSize: 12,
  lineHeight: 1.45,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word' as const,
};

function SyncDetailsCell({ log }: { log: SyncLog }) {
  const raw = getDetailsRaw(log);
  const preview =
    raw == null
      ? '-'
      : raw.length > 72
        ? `${raw.slice(0, 72)}…`
        : raw;

  const [dialogOpen, setDialogOpen] = useState(false);
  const formatted = raw != null ? formatDetailsDisplay(raw) : null;

  if (raw == null) {
    return (
      <TableCell sx={{ maxWidth: 220, color: 'text.secondary' }}>{preview}</TableCell>
    );
  }

  const tooltipTitle = (
    <Box
      component="pre"
      sx={{
        ...detailsPreSx,
        maxHeight: 240,
        overflow: 'auto',
        maxWidth: 440,
      }}
    >
      {formatted!.text}
    </Box>
  );

  return (
    <TableCell
      sx={{
        maxWidth: 220,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        cursor: 'pointer',
        verticalAlign: 'middle',
      }}
    >
      <Tooltip
        title={tooltipTitle}
        placement="left-start"
        enterDelay={400}
        slotProps={{
          tooltip: {
            sx: {
              bgcolor: 'grey.900',
              maxWidth: 480,
              border: 1,
              borderColor: 'divider',
            },
          },
        }}
      >
        <Box
          component="span"
          onClick={() => setDialogOpen(true)}
          sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}
        >
          {preview}
        </Box>
      </Tooltip>
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        maxWidth="md"
        fullWidth
        scroll="paper"
      >
        <DialogTitle>
          Sync details
          {formatted?.isJson ? (
            <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
              (JSON)
            </Typography>
          ) : null}
        </DialogTitle>
        <DialogContent dividers>
          <Box component="pre" sx={{ ...detailsPreSx, fontSize: 13 }}>
            {formatted!.text}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </TableCell>
  );
}

const Dashboard = () => {
  const [page, setPage] = useState(1);
  const [selectedDate, setSelectedDate] = useState();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<SyncLogsResponse>({
    queryKey: ['sync-logs', page],
    queryFn: async () => {
      const response = await apiClient.get(`/sync/logs?page=${page}&limit=10`);
      if (response.data.status) {
        return response.data.data;
      }
      throw new Error(response.data.error || 'Failed to fetch sync logs');
    },
  });

  const syncMutation = useMutation({
    mutationFn: async (date: string) => {
      const response = await apiClient.post('/sync/orders', { date });
      if (response.data.status) {
        return response.data.data;
      }
      throw new Error(response.data.error || 'Failed to trigger sync');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sync-logs'] });
    },
  });

  const resyncMutation = useMutation({
    mutationFn: async (logId: number) => {
      const response = await apiClient.post(`/sync/logs/${logId}/resync`);
      if (response.data.status) {
        return response.data.data;
      }
      throw new Error(response.data.error || 'Failed to re-sync page');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sync-logs'] });
    },
  });

  const replayMutation = useMutation({
    mutationFn: async (logId: number) => {
      const response = await apiClient.post(`/sync/logs/${logId}/replay`);
      if (response.data.status) {
        return response.data.data;
      }
      throw new Error(response.data.error || 'Failed to replay sync log');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sync-logs'] });
    },
  });

  const pageActionPending =
    resyncMutation.isPending || replayMutation.isPending;

  const handleSync = () => {
    if (!selectedDate) {
      return;
    }
    syncMutation.mutate(selectedDate as string);
  };

  const getStatusChip = (status: SyncStatus | string) => {
    switch (status) {
      case SyncStatus.Success:
        return <Chip label="Success" color="success" size="small" />;
      case SyncStatus.Failed:
        return <Chip label="Failed" color="error" size="small" />;
      case SyncStatus.Processing:
        return <Chip label="Processing" color="primary" size="small" variant="outlined" />;
      case SyncStatus.Initiated:
        return <Chip label="Initiated" color="info" size="small" variant="outlined" />;
      default:
        return <Chip label={String(status)} size="small" />;
    }
  };

  const getTriggerChip = (source: SyncLog['trigger_source'] | undefined) => {
    if (source === SyncTriggerSource.Cron) {
      return <Chip label="Cron" color="secondary" size="small" variant="outlined" />;
    }
    return <Chip label="API" color="default" size="small" variant="outlined" />;
  };

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3 }}>Sync Management</Typography>
      
      <Paper sx={{ p: 3, mb: 4 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Trigger Manual Sync</Typography>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <TextField
            type="date"
            label="Target Sync Date"
            value={selectedDate}
            onChange={(e: any) => setSelectedDate(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
            size="small"
          />
          <Button 
            variant="contained" 
            onClick={handleSync}
            disabled={syncMutation.isPending}
            startIcon={syncMutation.isPending ? <CircularProgress size={20} /> : null}
          >
            Start Sync
          </Button>
        </Box>
        {syncMutation.isSuccess && (
          <Alert severity="info" sx={{ mt: 2 }}>Sync process initiated for {selectedDate}.</Alert>
        )}
        {syncMutation.isError && (
          <Alert severity="error" sx={{ mt: 2 }}>{(syncMutation.error as any).message}</Alert>
        )}
        {resyncMutation.isError && (
          <Alert severity="error" sx={{ mt: 2 }}>{(resyncMutation.error as any).message}</Alert>
        )}
        {replayMutation.isError && (
          <Alert severity="error" sx={{ mt: 2 }}>{(replayMutation.error as any).message}</Alert>
        )}
        {(resyncMutation.isSuccess || replayMutation.isSuccess) && (
          <Alert severity="success" sx={{ mt: 2 }}>
            Page action completed successfully.
          </Alert>
        )}
      </Paper>

      <Typography variant="h5" sx={{ mb: 2 }}>Sync History</Typography>
      <TableContainer component={Paper}>
        {isLoading ? (
          <Box sx={{ p: 3, textAlign: 'center' }}><CircularProgress /></Box>
        ) : error ? (
          <Alert severity="error">{(error as any).message}</Alert>
        ) : (
          <>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Triggered At</TableCell>
                  <TableCell>Sync For Date</TableCell>
                  <TableCell align="right">Page</TableCell>
                  <TableCell>Trigger</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Count</TableCell>
                  <TableCell>Details</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data?.data.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>{new Date(log.created_at).toLocaleString()}</TableCell>
                    <TableCell>{log.sync_date}</TableCell>
                    <TableCell align="right">
                      {log.page_no ?? '—'}
                    </TableCell>
                    <TableCell>{getTriggerChip(log.trigger_source ?? SyncTriggerSource.Api)}</TableCell>
                    <TableCell>{getStatusChip(log.status)}</TableCell>
                    <TableCell align="right">{log.synced_count}</TableCell>
                    <SyncDetailsCell log={log} />
                    <TableCell>
                      {canReplayLog(log) ? (
                        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                          <Tooltip title="Re-fetch this page from PushSale and update orders">
                            <span>
                              <Button
                                size="small"
                                variant="outlined"
                                disabled={pageActionPending}
                                onClick={() => resyncMutation.mutate(log.id)}
                              >
                                Re-sync page
                              </Button>
                            </span>
                          </Tooltip>
                          <Tooltip title="Re-process orders from the saved API response">
                            <span>
                              <Button
                                size="small"
                                variant="contained"
                                disabled={pageActionPending}
                                onClick={() => replayMutation.mutate(log.id)}
                              >
                                Re-normalize
                              </Button>
                            </span>
                          </Tooltip>
                        </Box>
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          —
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {data?.data.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} align="center">No sync history found.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            <Box sx={{ p: 2, display: 'flex', justifyContent: 'center' }}>
              <Pagination 
                count={Math.ceil((data?.total || 0) / 10)} 
                page={page} 
                onChange={(_, v) => setPage(v)} 
              />
            </Box>
          </>
        )}
      </TableContainer>
    </Box>
  );
};

export default Dashboard;
