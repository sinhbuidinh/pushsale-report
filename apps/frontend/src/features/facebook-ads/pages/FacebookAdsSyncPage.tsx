import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Typography,
  Box,
  TextField,
  Button,
  Paper,
  CircularProgress,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  List,
  ListItem,
  ListItemText,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
} from '@mui/material';
import SyncIcon from '@mui/icons-material/Sync';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import apiClient from '../../../shared/api/apiClient';

interface MarketingUser {
  user_id: number;
  display_name: string;
  ads_account_count: number;
}

interface AdsAccountSyncStatus {
  ad_account_id: string;
  ad_account_name: string | null;
  synced: boolean;
  synced_at: string | null;
}

interface FacebookAdsSyncStatus {
  marketing_user_id: number;
  display_name: string;
  sync_date: string;
  ads_accounts: AdsAccountSyncStatus[];
  synced: boolean;
  synced_accounts_count: number;
  total_accounts_count: number;
}

interface FacebookAdsDailyCostRow {
  id: number;
  sync_date: string;
  ad_account_id: string;
  ad_account_name: string | null;
  product_id: number | null;
  product_code: string | null;
  spend: number;
  currency: string;
  matched_ads_count: number;
  unmatched_ads_count: number;
  notes: string | null;
  can_resync: boolean;
  can_normalize: boolean;
  updated_at: string | null;
}

interface FacebookAdsDailyCostsResponse {
  marketing_user_id: number;
  display_name: string;
  sync_date: string;
  rows: FacebookAdsDailyCostRow[];
}

interface FacebookAdsSyncResult {
  already_synced: boolean;
  message: string;
  marketing_user_id: number;
  display_name: string;
  sync_date: string;
  accounts_synced?: number;
  accounts_skipped?: number;
  total_accounts_count?: number;
  total_spend?: number;
  currency?: string;
  fetched_ads_count?: number;
  mapped_products_count?: number;
}

const FacebookAdsSyncPage = () => {
  const queryClient = useQueryClient();
  const [marketingUserId, setMarketingUserId] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [resyncingAccountId, setResyncingAccountId] = useState<string | null>(
    null,
  );
  const [normalizingAccountId, setNormalizingAccountId] = useState<
    string | null
  >(null);

  const hasBothInputs =
    marketingUserId.trim() !== '' && selectedDate.trim() !== '';

  const invalidateFacebookAdsQueries = () => {
    queryClient.invalidateQueries({
      queryKey: ['facebook-ads', 'sync-status', marketingUserId, selectedDate],
    });
    queryClient.invalidateQueries({
      queryKey: ['facebook-ads', 'daily-costs', marketingUserId, selectedDate],
    });
  };

  const { data: marketingUsers, isLoading: usersLoading, error: usersError } =
    useQuery<MarketingUser[]>({
      queryKey: ['facebook-ads', 'marketing-users'],
      queryFn: async () => {
        const response = await apiClient.get('/sync/facebook-ads/marketing-users');
        if (response.data.status) {
          return response.data.data;
        }
        throw new Error(
          response.data.error || 'Failed to load marketing users',
        );
      },
    });

  const {
    data: syncStatus,
    isLoading: statusLoading,
    isFetching: statusFetching,
    error: statusError,
  } = useQuery<FacebookAdsSyncStatus>({
    queryKey: ['facebook-ads', 'sync-status', marketingUserId, selectedDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('marketing_user_id', marketingUserId);
      params.set('date', selectedDate);
      const response = await apiClient.get(
        `/sync/facebook-ads/sync-status?${params.toString()}`,
      );
      if (response.data.status) {
        return response.data.data;
      }
      throw new Error(
        response.data.error || 'Failed to check sync status',
      );
    },
    enabled: hasBothInputs,
  });

  const {
    data: dailyCosts,
    isLoading: dailyCostsLoading,
    isFetching: dailyCostsFetching,
    error: dailyCostsError,
  } = useQuery<FacebookAdsDailyCostsResponse>({
    queryKey: ['facebook-ads', 'daily-costs', marketingUserId, selectedDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('marketing_user_id', marketingUserId);
      params.set('date', selectedDate);
      const response = await apiClient.get(
        `/sync/facebook-ads/daily-costs?${params.toString()}`,
      );
      if (response.data.status) {
        return response.data.data;
      }
      throw new Error(
        response.data.error || 'Failed to load daily cost rows',
      );
    },
    enabled: hasBothInputs,
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.post('/sync/facebook-ads/marketing-user', {
        marketing_user_id: Number(marketingUserId),
        date: selectedDate,
      });
      if (response.data.status) {
        return response.data.data as FacebookAdsSyncResult;
      }
      throw new Error(response.data.error || 'Failed to sync Facebook ads');
    },
    onSuccess: () => {
      invalidateFacebookAdsQueries();
    },
  });

  const normalizeMutation = useMutation({
    mutationFn: async (adAccountId: string) => {
      const response = await apiClient.post('/sync/facebook-ads/normalize', {
        marketing_user_id: Number(marketingUserId),
        ad_account_id: adAccountId,
        date: selectedDate,
      });
      if (response.data.status) {
        return response.data.data;
      }
      throw new Error(
        response.data.error || 'Failed to normalize daily costs from snapshot',
      );
    },
    onMutate: (adAccountId) => {
      setNormalizingAccountId(adAccountId);
    },
    onSettled: () => {
      setNormalizingAccountId(null);
    },
    onSuccess: () => {
      invalidateFacebookAdsQueries();
    },
  });

  const resyncMutation = useMutation({
    mutationFn: async (adAccountId: string) => {
      const response = await apiClient.post('/sync/facebook-ads/resync', {
        marketing_user_id: Number(marketingUserId),
        ad_account_id: adAccountId,
        date: selectedDate,
      });
      if (response.data.status) {
        return response.data.data;
      }
      throw new Error(response.data.error || 'Failed to re-sync ad account');
    },
    onMutate: (adAccountId) => {
      setResyncingAccountId(adAccountId);
    },
    onSettled: () => {
      setResyncingAccountId(null);
    },
    onSuccess: () => {
      invalidateFacebookAdsQueries();
    },
  });

  const handleSync = () => {
    if (!hasBothInputs) {
      return;
    }
    syncMutation.mutate();
  };

  const handleResync = (adAccountId: string) => {
    resyncMutation.mutate(adAccountId);
  };

  const handleNormalize = (adAccountId: string) => {
    normalizeMutation.mutate(adAccountId);
  };

  const selectedUser = marketingUsers?.find(
    (u) => String(u.user_id) === marketingUserId,
  );

  const showAlreadySyncedFromStatus =
    hasBothInputs && syncStatus?.synced === true && !syncMutation.data;

  const showPartialSyncFromStatus =
    hasBothInputs &&
    syncStatus &&
    !syncStatus.synced &&
    syncStatus.synced_accounts_count > 0 &&
    !syncMutation.data;

  const showAlreadySyncedFromMutation = syncMutation.data?.already_synced === true;

  const showSyncSuccess =
    syncMutation.data?.already_synced === false && syncMutation.isSuccess;

  const formatAccountLabel = (account: AdsAccountSyncStatus) => {
    const name = account.ad_account_name?.trim();
    return name ? `${name} (act_${account.ad_account_id})` : `act_${account.ad_account_id}`;
  };

  const formatRowAccountLabel = (row: FacebookAdsDailyCostRow) => {
    const name = row.ad_account_name?.trim();
    return name ? `${name} (act_${row.ad_account_id})` : `act_${row.ad_account_id}`;
  };

  const formatSyncedAt = (iso: string | null | undefined) => {
    if (!iso) {
      return null;
    }
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? null : date.toLocaleString();
  };

  const formatAccountSyncStatus = (account: AdsAccountSyncStatus) => {
    const syncedAtLabel = formatSyncedAt(account.synced_at);
    if (account.synced) {
      return syncedAtLabel
        ? `Already synced · ${syncedAtLabel}`
        : 'Already synced';
    }
    return 'Pending sync';
  };

  const latestSyncedAt = syncStatus?.ads_accounts.reduce<string | null>(
    (latest, account) => {
      if (!account.synced_at) {
        return latest;
      }
      if (!latest || account.synced_at > latest) {
        return account.synced_at;
      }
      return latest;
    },
    null,
  );

  const dailyCostRows = dailyCosts?.rows ?? [];
  const isLoadingCosts = dailyCostsLoading || dailyCostsFetching;

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3 }}>
        Facebook Ads Sync
      </Typography>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Sync daily ad spend
        </Typography>

        {usersError ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {(usersError as Error).message}
          </Alert>
        ) : null}

        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 2,
            alignItems: 'flex-start',
          }}
        >
          <FormControl size="small" sx={{ minWidth: 260 }}>
            <InputLabel id="marketing-user-label">Marketing user</InputLabel>
            <Select
              labelId="marketing-user-label"
              label="Marketing user"
              value={marketingUserId}
              onChange={(e) => {
                setMarketingUserId(e.target.value);
                syncMutation.reset();
                resyncMutation.reset();
                normalizeMutation.reset();
              }}
              disabled={usersLoading}
            >
              <MenuItem value="">
                <em>Select marketing user</em>
              </MenuItem>
              {marketingUsers?.map((user) => (
                <MenuItem key={user.user_id} value={String(user.user_id)}>
                  {user.display_name}
                  {user.ads_account_count > 0
                    ? ` (${user.ads_account_count} ad account${user.ads_account_count > 1 ? 's' : ''})`
                    : ''}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            type="date"
            label="Sync date"
            value={selectedDate}
            onChange={(e) => {
              setSelectedDate(e.target.value);
              syncMutation.reset();
              resyncMutation.reset();
              normalizeMutation.reset();
            }}
            slotProps={{ inputLabel: { shrink: true } }}
            size="small"
          />

          <Button
            variant="contained"
            onClick={handleSync}
            disabled={
              !hasBothInputs ||
              syncMutation.isPending ||
              statusLoading ||
              statusFetching ||
              syncStatus?.synced === true ||
              selectedUser?.ads_account_count === 0
            }
            startIcon={
              syncMutation.isPending ? <CircularProgress size={20} /> : null
            }
          >
            Sync Facebook Ads
          </Button>
        </Box>

        {usersLoading ? (
          <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            <CircularProgress size={20} />
            <Typography variant="body2" color="text.secondary">
              Loading marketing users…
            </Typography>
          </Box>
        ) : null}

        {!usersLoading && marketingUsers?.length === 0 ? (
          <Alert severity="warning" sx={{ mt: 2 }}>
            No marketing users found.
          </Alert>
        ) : null}

        {selectedUser && selectedUser.ads_account_count === 0 ? (
          <Alert severity="warning" sx={{ mt: 2 }}>
            This marketing user has no linked Facebook ad accounts.
          </Alert>
        ) : null}

        {selectedUser && selectedUser.ads_account_count > 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            {selectedUser.ads_account_count} ad account
            {selectedUser.ads_account_count > 1 ? 's' : ''} will be synced for
            this user.
          </Typography>
        ) : null}

        {hasBothInputs && syncStatus?.ads_accounts.length ? (
          <Box sx={{ mt: 2 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Ad accounts for {syncStatus.display_name}:
            </Typography>
            <List dense disablePadding>
              {syncStatus.ads_accounts.map((account) => (
                <ListItem key={account.ad_account_id} disableGutters sx={{ py: 0.25 }}>
                  <ListItemText
                    primary={formatAccountLabel(account)}
                    secondary={formatAccountSyncStatus(account)}
                    slotProps={{
                      primary: { variant: 'body2' },
                      secondary: {
                        variant: 'caption',
                        color: account.synced ? 'success.main' : 'warning.main',
                      },
                    }}
                  />
                </ListItem>
              ))}
            </List>
          </Box>
        ) : null}

        {hasBothInputs && (statusLoading || statusFetching) ? (
          <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            <CircularProgress size={20} />
            <Typography variant="body2" color="text.secondary">
              Checking sync status…
            </Typography>
          </Box>
        ) : null}

        {statusError ? (
          <Alert severity="error" sx={{ mt: 2 }}>
            {(statusError as Error).message}
          </Alert>
        ) : null}

        {showAlreadySyncedFromStatus ? (
          <Alert severity="info" sx={{ mt: 2 }}>
            Facebook ads data for {syncStatus?.display_name} on{' '}
            {syncStatus?.sync_date} is already synced for all{' '}
            {syncStatus?.total_accounts_count} ad account(s).
            {formatSyncedAt(latestSyncedAt) ? (
              <> Last synced: {formatSyncedAt(latestSyncedAt)}.</>
            ) : null}
          </Alert>
        ) : null}

        {showPartialSyncFromStatus ? (
          <Alert severity="warning" sx={{ mt: 2 }}>
            {syncStatus.synced_accounts_count} of {syncStatus.total_accounts_count}{' '}
            ad account(s) already synced. Sync will fetch the remaining account(s)
            only.
          </Alert>
        ) : null}

        {hasBothInputs &&
        syncStatus?.synced === false &&
        syncStatus.synced_accounts_count === 0 &&
        !syncMutation.data &&
        !statusLoading &&
        !statusFetching ? (
          <Alert severity="success" sx={{ mt: 2 }}>
            No sync found for this date. You can run sync now.
          </Alert>
        ) : null}

        {showAlreadySyncedFromMutation ? (
          <Alert severity="info" sx={{ mt: 2 }}>
            {syncMutation.data?.message}
          </Alert>
        ) : null}

        {showSyncSuccess ? (
          <Alert severity="success" sx={{ mt: 2 }}>
            {syncMutation.data?.message}
            {syncMutation.data?.total_spend != null ? (
              <>
                {' '}
                Total spend: {syncMutation.data.total_spend}{' '}
                {syncMutation.data.currency ?? ''} across{' '}
                {syncMutation.data.accounts_synced ?? 0} account(s) (
                {syncMutation.data.fetched_ads_count ?? 0} ads,{' '}
                {syncMutation.data.mapped_products_count ?? 0} mapped products).
              </>
            ) : null}
          </Alert>
        ) : null}

        {syncMutation.isError ? (
          <Alert severity="error" sx={{ mt: 2 }}>
            {(syncMutation.error as Error).message}
          </Alert>
        ) : null}

        {resyncMutation.isSuccess ? (
          <Alert severity="success" sx={{ mt: 2 }}>
            {(resyncMutation.data as { message?: string })?.message ??
              'Ad account re-synced successfully.'}
          </Alert>
        ) : null}

        {resyncMutation.isError ? (
          <Alert severity="error" sx={{ mt: 2 }}>
            {(resyncMutation.error as Error).message}
          </Alert>
        ) : null}

        {normalizeMutation.isSuccess ? (
          <Alert severity="success" sx={{ mt: 2 }}>
            {(normalizeMutation.data as { message?: string })?.message ??
              'Daily costs normalized from snapshot successfully.'}
          </Alert>
        ) : null}

        {normalizeMutation.isError ? (
          <Alert severity="error" sx={{ mt: 2 }}>
            {(normalizeMutation.error as Error).message}
          </Alert>
        ) : null}
      </Paper>

      {hasBothInputs ? (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Daily cost rows
            {dailyCosts?.sync_date ? ` — ${dailyCosts.sync_date}` : ''}
          </Typography>

          {isLoadingCosts ? (
            <Box sx={{ py: 3, textAlign: 'center' }}>
              <CircularProgress />
            </Box>
          ) : dailyCostsError ? (
            <Alert severity="error">{(dailyCostsError as Error).message}</Alert>
          ) : dailyCostRows.length === 0 ? (
            <Alert severity="info">
              No daily cost data for this user and date. Run sync first.
            </Alert>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>ID</TableCell>
                    <TableCell>Ad account</TableCell>
                    <TableCell>Product code</TableCell>
                    <TableCell align="right">Spend</TableCell>
                    <TableCell align="right">Matched ads</TableCell>
                    <TableCell align="right">Unmatched ads</TableCell>
                    <TableCell>Notes</TableCell>
                    <TableCell>Last synced</TableCell>
                    <TableCell align="center">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(() => {
                    // For each ad account, choose ONE row to host the
                    // Normalize button:
                    //  - If any row has unmatched ads, the first such row.
                    //  - Otherwise, the first row of that account.
                    const normalizeAnchorByAccountId = new Map<
                      string,
                      FacebookAdsDailyCostRow
                    >();
                    for (const row of dailyCostRows) {
                      if (!row.can_normalize) continue;
                      const existing = normalizeAnchorByAccountId.get(
                        row.ad_account_id,
                      );
                      if (!existing) {
                        normalizeAnchorByAccountId.set(
                          row.ad_account_id,
                          row,
                        );
                        continue;
                      }
                      if (
                        existing.unmatched_ads_count === 0 &&
                        row.unmatched_ads_count > 0
                      ) {
                        normalizeAnchorByAccountId.set(
                          row.ad_account_id,
                          row,
                        );
                      }
                    }

                    const formatNormalizeAnchorLabel = (
                      anchor: FacebookAdsDailyCostRow,
                    ) => anchor.product_code ?? `#${anchor.id}`;

                    return dailyCostRows.map((row) => {
                      const anchor = normalizeAnchorByAccountId.get(
                        row.ad_account_id,
                      );
                      const showNormalize =
                        !!anchor && anchor.id === row.id;
                      const showNormalizeHint =
                        !!anchor &&
                        anchor.id !== row.id &&
                        row.can_normalize;
                      const normalizeAnchorLabel =
                        showNormalizeHint && anchor
                          ? formatNormalizeAnchorLabel(anchor)
                          : null;

                      return (
                    <TableRow
                      key={row.id}
                      sx={
                        row.unmatched_ads_count > 0
                          ? { bgcolor: 'warning.50' }
                          : undefined
                      }
                    >
                      <TableCell>
                        <Typography variant="caption" color="text.secondary">
                          #{row.id}
                        </Typography>
                      </TableCell>
                      <TableCell>{formatRowAccountLabel(row)}</TableCell>
                      <TableCell>
                        {row.product_code ?? (
                          <Chip label="Unmapped" size="small" color="warning" />
                        )}
                      </TableCell>
                      <TableCell align="right">
                        {row.spend.toLocaleString()} {row.currency}
                      </TableCell>
                      <TableCell align="right">{row.matched_ads_count}</TableCell>
                      <TableCell align="right">
                        {row.unmatched_ads_count > 0 ? (
                          <Chip
                            label={row.unmatched_ads_count}
                            size="small"
                            color="warning"
                          />
                        ) : (
                          row.unmatched_ads_count
                        )}
                      </TableCell>
                      <TableCell sx={{ maxWidth: 280 }}>
                        <Typography variant="caption" color="text.secondary">
                          {row.notes ?? '—'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" color="text.secondary">
                          {formatSyncedAt(row.updated_at) ?? '—'}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Box
                          sx={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 0.5,
                            alignItems: 'center',
                          }}
                        >
                          {row.can_resync ? (
                            <Button
                              size="small"
                              variant="outlined"
                              startIcon={
                                resyncingAccountId === row.ad_account_id ? (
                                  <CircularProgress size={14} />
                                ) : (
                                  <SyncIcon fontSize="small" />
                                )
                              }
                              disabled={
                                resyncMutation.isPending ||
                                syncMutation.isPending ||
                                normalizeMutation.isPending
                              }
                              onClick={() => handleResync(row.ad_account_id)}
                            >
                              Re-sync
                            </Button>
                          ) : null}
                          {showNormalize ? (
                            <Button
                              size="small"
                              variant="outlined"
                              color="secondary"
                              startIcon={
                                normalizingAccountId === row.ad_account_id ? (
                                  <CircularProgress size={14} />
                                ) : (
                                  <AutoFixHighIcon fontSize="small" />
                                )
                              }
                              disabled={
                                normalizeMutation.isPending ||
                                syncMutation.isPending ||
                                resyncMutation.isPending
                              }
                              onClick={() =>
                                handleNormalize(row.ad_account_id)
                              }
                            >
                              Normalize
                            </Button>
                          ) : null}
                          {normalizeAnchorLabel ? (
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ fontStyle: 'italic' }}
                            >
                              ↑ Use Normalize on {normalizeAnchorLabel} row
                            </Typography>
                          ) : null}
                          {!row.can_resync &&
                          !showNormalize &&
                          !normalizeAnchorLabel
                            ? '—'
                            : null}
                        </Box>
                      </TableCell>
                    </TableRow>
                      );
                    });
                  })()}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>
      ) : null}
    </Box>
  );
};

export default FacebookAdsSyncPage;
