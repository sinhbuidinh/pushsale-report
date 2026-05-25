import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Switch,
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
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import apiClient from '../../../shared/api/apiClient';
import {
  BAND_THEME,
  classifyProfitPct,
  findSegmentForPrice,
  type ProfitBand,
  type ProfitSegment,
} from '../../profit-segments/profitSegments';

interface OrderFilterUser {
  id: number;
  display_name: string;
}

interface OrderFilterUsersResponse {
  marketing: OrderFilterUser[];
  sale: OrderFilterUser[];
}

interface MarketingSummaryRow {
  product_id: number;
  item_code: string;
  item_name: string;
  total_quantity: number;
  selling_price: number;
  cost_price: number;
  delivery_fee_per_unit: number;
  tax_value_pct: number;
  ads_spend: number;
  tax_ads: number;
  revenue: number;
  revenue_estimate: number;
  revenue_tax: number;
  total_cost: number;
  risk_fee: number;
  total_delivery_fee: number;
  ads_per_revenue_pct: number | null;
  profit: number;
  profit_per_revenue_pct: number | null;
}

interface MarketingSummaryUnmatched {
  ads_spend: number;
  tax_ads: number;
}

interface MarketingSummaryTotals {
  total_quantity: number;
  ads_spend: number;
  tax_ads: number;
  revenue: number;
  revenue_estimate: number;
  revenue_tax: number;
  total_cost: number;
  risk_fee: number;
  total_delivery_fee: number;
  profit: number;
  ads_per_revenue_pct: number | null;
  profit_per_revenue_pct: number | null;
}

interface MarketingSummaryResponse {
  marketing_user_id: number;
  marketing_user_display_name: string;
  start_date: string;
  end_date: string;
  ads_account_ids: string[];
  total_orders: number;
  rows: MarketingSummaryRow[];
  unmatched: MarketingSummaryUnmatched;
  totals: MarketingSummaryTotals;
}

const fmtNum = (n: number): string =>
  Number(n || 0).toLocaleString('vi-VN', { maximumFractionDigits: 0 });

const fmtPct = (n: number | null): string =>
  n == null ? '—' : `${n.toFixed(2)}%`;

const todayYmd = (): string => new Date().toISOString().slice(0, 10);

const profitColor = (n: number): string => {
  if (n > 0) return 'success.main';
  if (n < 0) return 'error.main';
  return 'text.primary';
};

/**
 * Themed colour for the `% Profit / Revenue` value of a single product row,
 * based on the configured profit-segment thresholds. Falls back to the
 * positive/negative `profitColor` when no segment matches (e.g. settings not
 * loaded, or selling price outside every configured window).
 */
function bandForRow(
  segments: ProfitSegment[],
  sellingPrice: number,
  profitPct: number | null,
): ProfitBand | null {
  if (segments.length === 0) return null;
  const segment = findSegmentForPrice(segments, sellingPrice);
  if (!segment) return null;
  return classifyProfitPct(segment, profitPct);
}

/**
 * One displayed metric row in the transposed table.
 * - `format` controls how each value renders.
 * - `value(row)` returns the per-product value, `unmatched(u)` the value for
 *   the Unmatched ads bucket (use `null` to render an em-dash), and
 *   `total(t)` the value of the combined TOTAL column.
 */
type MetricFormat = 'number' | 'percent';

interface MetricDef {
  key: string;
  label: string;
  format: MetricFormat;
  emphasize?: boolean;
  tooltip?: string;
  value: (row: MarketingSummaryRow) => number | null;
  unmatched: (u: MarketingSummaryUnmatched) => number | null;
  total: (t: MarketingSummaryTotals) => number | null;
}

const METRICS: MetricDef[] = [
  {
    key: 'ads_spend',
    label: 'Ads',
    format: 'number',
    value: (r) => r.ads_spend,
    unmatched: (u) => u.ads_spend,
    total: (t) => t.ads_spend,
  },
  {
    key: 'tax_ads',
    label: 'Tax ads (10%)',
    format: 'number',
    value: (r) => r.tax_ads,
    unmatched: (u) => u.tax_ads,
    total: (t) => t.tax_ads,
  },
  {
    key: 'revenue',
    label: 'Revenue',
    format: 'number',
    value: (r) => r.revenue,
    unmatched: () => null,
    total: (t) => t.revenue,
  },
  {
    key: 'revenue_estimate',
    label: 'Revenue est. (×0.8)',
    format: 'number',
    value: (r) => r.revenue_estimate,
    unmatched: () => null,
    total: (t) => t.revenue_estimate,
  },
  {
    key: 'revenue_tax',
    label: 'Revenue tax (VAT)',
    format: 'number',
    tooltip: 'Revenue est. × product VAT % (per row).',
    value: (r) => r.revenue_tax,
    unmatched: () => null,
    total: (t) => t.revenue_tax,
  },
  {
    key: 'cost_price',
    label: 'Unit cost (1 product)',
    format: 'number',
    tooltip:
      'Cost price for one unit of this product (from the active product adaptation).',
    value: (r) => r.cost_price,
    unmatched: () => null,
    total: () => null,
  },
  {
    key: 'total_cost',
    label: 'Cost of goods',
    format: 'number',
    value: (r) => r.total_cost,
    unmatched: () => null,
    total: (t) => t.total_cost,
  },
  {
    key: 'risk_fee',
    label: 'Risk fee (10%)',
    format: 'number',
    value: (r) => r.risk_fee,
    unmatched: () => null,
    total: (t) => t.risk_fee,
  },
  {
    key: 'total_delivery_fee',
    label: 'Delivery fee',
    format: 'number',
    value: (r) => r.total_delivery_fee,
    unmatched: () => null,
    total: (t) => t.total_delivery_fee,
  },
  {
    key: 'ads_per_revenue_pct',
    label: '% Ads / Revenue',
    format: 'percent',
    value: (r) => r.ads_per_revenue_pct,
    unmatched: () => null,
    total: (t) => t.ads_per_revenue_pct,
  },
  {
    key: 'profit',
    label: 'Profit',
    format: 'number',
    emphasize: true,
    tooltip: 'Unmatched ads are not charged against profit.',
    value: (r) => r.profit,
    unmatched: () => null,
    total: (t) => t.profit,
  },
  {
    key: 'profit_per_revenue_pct',
    label: '% Profit / Revenue',
    format: 'percent',
    emphasize: true,
    value: (r) => r.profit_per_revenue_pct,
    unmatched: () => null,
    total: (t) => t.profit_per_revenue_pct,
  },
];

const renderValue = (
  v: number | null,
  format: MetricFormat,
): string => {
  if (v == null) return '—';
  return format === 'percent' ? fmtPct(v) : fmtNum(v);
};

const STICKY_COL_WIDTH = 220;

const MarketingSummaryPage: React.FC = () => {
  const [marketingUserInput, setMarketingUserInput] = useState('');
  const [isRange, setIsRange] = useState(false);
  const [startDateInput, setStartDateInput] = useState<string>(todayYmd());
  const [endDateInput, setEndDateInput] = useState<string>(todayYmd());

  /** Filters that have been "applied" (drives the API call). */
  const [submitted, setSubmitted] = useState<{
    marketingUserId: string;
    startDate: string;
    endDate: string;
  } | null>(null);

  const { data: filterUsers, isLoading: loadingUsers } =
    useQuery<OrderFilterUsersResponse>({
      queryKey: ['users', 'order-filters'],
      queryFn: async () => {
        const response = await apiClient.get('/users/order-filters');
        if (response.data.status) {
          return response.data.data;
        }
        throw new Error(response.data.error || 'Failed to load users');
      },
    });

  const { data: segments } = useQuery<ProfitSegment[]>({
    queryKey: ['profit-segments'],
    queryFn: async () => {
      const response = await apiClient.get('/profit-segments');
      if (response.data.status) return response.data.data as ProfitSegment[];
      throw new Error(
        response.data.error || 'Failed to load profit segments',
      );
    },
    staleTime: 60_000,
  });

  const segmentList = useMemo(() => segments ?? [], [segments]);

  const summaryQuery = useQuery<MarketingSummaryResponse>({
    queryKey: [
      'marketing-summary',
      submitted?.marketingUserId,
      submitted?.startDate,
      submitted?.endDate,
    ],
    queryFn: async () => {
      if (!submitted) throw new Error('No selection');
      const params = new URLSearchParams();
      params.set('marketing_user_id', submitted.marketingUserId);
      params.set('start_date', submitted.startDate);
      params.set('end_date', submitted.endDate);
      const response = await apiClient.get(
        `/marketing-summary?${params.toString()}`,
      );
      if (response.data.status) return response.data.data;
      throw new Error(response.data.error || 'Failed to load summary');
    },
    enabled: !!submitted,
  });

  const { data, isFetching, error } = summaryQuery;

  const handleSummarize = () => {
    if (!marketingUserInput) return;
    if (!startDateInput) return;
    setSubmitted({
      marketingUserId: marketingUserInput,
      startDate: startDateInput,
      endDate: isRange ? endDateInput || startDateInput : startDateInput,
    });
  };

  const handleClear = () => {
    setMarketingUserInput('');
    setIsRange(false);
    const t = todayYmd();
    setStartDateInput(t);
    setEndDateInput(t);
    setSubmitted(null);
  };

  const dateRangeLabel = useMemo(() => {
    if (!data) return null;
    return data.start_date === data.end_date
      ? data.start_date
      : `${data.start_date} → ${data.end_date}`;
  }, [data]);

  const canSubmit =
    marketingUserInput !== '' &&
    !!startDateInput &&
    (!isRange || (!!endDateInput && endDateInput >= startDateInput));

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 2,
        }}
      >
        <Typography variant="h4">Marketing Summary</Typography>
      </Box>

      <Paper
        sx={{
          p: 2,
          mb: 3,
          display: 'flex',
          gap: 2,
          alignItems: 'flex-end',
          flexWrap: 'wrap',
        }}
      >
        <FormControl size="small" sx={{ minWidth: 240 }} disabled={loadingUsers}>
          <InputLabel>Marketing user</InputLabel>
          <Select
            label="Marketing user"
            value={marketingUserInput}
            onChange={(e) => setMarketingUserInput(e.target.value as string)}
            sx={{ bgcolor: 'action.hover' }}
          >
            <MenuItem value="">
              <em>Select a marketing user</em>
            </MenuItem>
            {(filterUsers?.marketing ?? []).map((u) => (
              <MenuItem key={u.id} value={String(u.id)}>
                {u.display_name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControlLabel
          control={
            <Switch
              checked={isRange}
              onChange={(_, v) => {
                setIsRange(v);
                if (!v) {
                  setEndDateInput(startDateInput);
                }
              }}
            />
          }
          label="Date range"
          sx={{ ml: 0 }}
        />

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Typography
            variant="caption"
            sx={{ color: 'text.secondary', fontWeight: 'bold', ml: 1 }}
          >
            {isRange ? 'Start date' : 'Date'}
          </Typography>
          <TextField
            size="small"
            type="date"
            value={startDateInput}
            onChange={(e) => {
              setStartDateInput(e.target.value);
              if (!isRange) setEndDateInput(e.target.value);
            }}
            sx={{
              width: 180,
              '& .MuiInputBase-root': { bgcolor: 'action.hover' },
            }}
          />
        </Box>

        {isRange && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Typography
              variant="caption"
              sx={{ color: 'text.secondary', fontWeight: 'bold', ml: 1 }}
            >
              End date
            </Typography>
            <TextField
              size="small"
              type="date"
              value={endDateInput}
              onChange={(e) => setEndDateInput(e.target.value)}
              slotProps={{ htmlInput: { min: startDateInput } }}
              sx={{
                width: 180,
                '& .MuiInputBase-root': { bgcolor: 'action.hover' },
              }}
            />
          </Box>
        )}

        <Box sx={{ display: 'flex', gap: 1, pb: 0.2 }}>
          <Button
            variant="contained"
            startIcon={<SearchIcon />}
            onClick={handleSummarize}
            disabled={!canSubmit || isFetching}
            sx={{ height: 40 }}
          >
            Summary
          </Button>
          <Button
            variant="outlined"
            startIcon={<ClearIcon />}
            color="inherit"
            onClick={handleClear}
            sx={{ height: 40 }}
          >
            Clear
          </Button>
        </Box>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {(error as Error).message}
        </Alert>
      )}

      {!submitted && !error && (
        <Alert severity="info">
          Select a marketing user and one or more dates, then click{' '}
          <strong>Summary</strong>.
        </Alert>
      )}

      {submitted && isFetching && !data && (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {data && (
        <>
          <Box
            sx={{
              mb: 1.5,
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              flexWrap: 'wrap',
            }}
          >
            <Box
              sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}
            >
              <Typography
                variant="caption"
                sx={{
                  color: 'text.secondary',
                  fontWeight: 700,
                  letterSpacing: 0.4,
                }}
              >
                MARKETING USER
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                {data.marketing_user_display_name}
              </Typography>
            </Box>

            {segmentList.length > 0 && (
              <Box
                sx={{
                  display: 'flex',
                  gap: 0.75,
                  flexWrap: 'wrap',
                  alignItems: 'center',
                }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    color: 'text.secondary',
                    fontWeight: 700,
                    letterSpacing: 0.4,
                  }}
                >
                  % PROFIT/REVENUE
                </Typography>
                {(
                  ['danger', 'warning', 'good', 'excellent'] as ProfitBand[]
                ).map((band) => {
                  const theme = BAND_THEME[band];
                  return (
                    <Chip
                      key={band}
                      size="small"
                      label={`${theme.emoji} ${theme.label}`}
                      sx={{
                        bgcolor: theme.bg,
                        color: theme.fg,
                        fontWeight: 600,
                      }}
                    />
                  );
                })}
              </Box>
            )}
          </Box>

          <TableContainer component={Paper} sx={{ mb: 3, overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>Period</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    Confirmed orders
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Ads account</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    Unmatched ads
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    Profit
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    %Profit/Revenue
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell>{dateRangeLabel ?? '—'}</TableCell>
                  <TableCell align="right">
                    {fmtNum(data.total_orders)}
                  </TableCell>
                  <TableCell sx={{ wordBreak: 'break-all', maxWidth: 360 }}>
                    {data.ads_account_ids.length === 0 ? (
                      <Chip size="small" color="warning" label="None" />
                    ) : (
                      data.ads_account_ids.join(', ')
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="Sum of ads spend whose campaign name did not match any product. Not charged against profit.">
                      <Typography
                        component="span"
                        sx={{ fontWeight: 700, color: 'warning.dark' }}
                      >
                        {fmtNum(data.unmatched.ads_spend)}
                      </Typography>
                    </Tooltip>
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{
                      fontWeight: 700,
                      color: profitColor(data.totals.profit),
                    }}
                  >
                    {fmtNum(data.totals.profit)}
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{
                      fontWeight: 700,
                      color: profitColor(data.totals.profit),
                    }}
                  >
                    {fmtPct(data.totals.profit_per_revenue_pct)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>

          <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: 720 }}>
              <TableHead>
                <TableRow>
                  <StickyHeadCell>Metric</StickyHeadCell>
                  {data.rows.map((row) => (
                    <TableCell
                      key={row.product_id}
                      align="right"
                      sx={{
                        fontWeight: 700,
                        verticalAlign: 'top',
                        minWidth: 160,
                      }}
                    >
                      <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                        <Typography
                          variant="body2"
                          sx={{ fontWeight: 700, lineHeight: 1.2 }}
                          noWrap
                          title={row.item_name}
                        >
                          {row.item_name}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{
                            color: 'text.secondary',
                            fontWeight: 500,
                          }}
                        >
                          {row.item_code}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{ color: 'text.secondary' }}
                        >
                          Qty: <strong>{fmtNum(row.total_quantity)}</strong>
                        </Typography>
                      </Box>
                    </TableCell>
                  ))}
                  <TableCell
                    align="right"
                    sx={{
                      fontWeight: 700,
                      verticalAlign: 'top',
                      minWidth: 140,
                      bgcolor: 'warning.50',
                    }}
                  >
                    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 700, lineHeight: 1.2 }}
                      >
                        Unmatched
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{ color: 'text.secondary', fontWeight: 500 }}
                      >
                        product_id IS NULL
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{ color: 'text.secondary' }}
                      >
                        Qty: <strong>—</strong>
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{
                      fontWeight: 700,
                      verticalAlign: 'top',
                      minWidth: 140,
                      bgcolor: 'action.selected',
                    }}
                  >
                    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 700, lineHeight: 1.2 }}
                      >
                        TOTAL
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{ color: 'text.secondary', fontWeight: 500 }}
                      >
                        all products + unmatched
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{ color: 'text.secondary' }}
                      >
                        Qty:{' '}
                        <strong>{fmtNum(data.totals.total_quantity)}</strong>
                      </Typography>
                    </Box>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.rows.length === 0 && data.unmatched.ads_spend === 0 && (
                  <TableRow>
                    <StickyBodyCell>—</StickyBodyCell>
                    <TableCell
                      colSpan={2}
                      align="center"
                      sx={{ color: 'text.secondary' }}
                    >
                      No data for this selection.
                    </TableCell>
                  </TableRow>
                )}
                {METRICS.map((metric) => {
                  const totalValue = metric.total(data.totals);
                  return (
                    <TableRow key={metric.key} hover>
                      <StickyBodyCell
                        sx={{
                          fontWeight: metric.emphasize ? 700 : 500,
                        }}
                      >
                        {metric.tooltip ? (
                          <Tooltip title={metric.tooltip}>
                            <span>{metric.label}</span>
                          </Tooltip>
                        ) : (
                          metric.label
                        )}
                      </StickyBodyCell>
                      {data.rows.map((row) => {
                        const v = metric.value(row);
                        const isProfit = metric.key === 'profit';
                        const isProfitPct =
                          metric.key === 'profit_per_revenue_pct';
                        const band = bandForRow(
                          segmentList,
                          row.selling_price,
                          row.profit_per_revenue_pct,
                        );
                        let sx: React.ComponentProps<typeof TableCell>['sx'];
                        if (metric.emphasize && (isProfit || isProfitPct)) {
                          if (band) {
                            const theme = BAND_THEME[band];
                            sx = {
                              fontWeight: 700,
                              color: theme.fg,
                              bgcolor: theme.bg,
                            };
                          } else {
                            sx = {
                              fontWeight: 700,
                              color: profitColor(row.profit),
                            };
                          }
                        }
                        return (
                          <TableCell
                            key={row.product_id}
                            align="right"
                            sx={sx}
                          >
                            {renderValue(v, metric.format)}
                          </TableCell>
                        );
                      })}
                      <TableCell
                        align="right"
                        sx={{ bgcolor: 'warning.50' }}
                      >
                        {renderValue(
                          metric.unmatched(data.unmatched),
                          metric.format,
                        )}
                      </TableCell>
                      <TableCell
                        align="right"
                        sx={{
                          bgcolor: 'action.selected',
                          fontWeight: 700,
                          color:
                            metric.emphasize &&
                            (metric.key === 'profit' ||
                              metric.key === 'profit_per_revenue_pct')
                              ? profitColor(data.totals.profit)
                              : undefined,
                        }}
                      >
                        {renderValue(totalValue, metric.format)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}
    </Box>
  );
};

const StickyHeadCell: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <TableCell
    sx={{
      fontWeight: 700,
      position: 'sticky',
      left: 0,
      zIndex: 3,
      bgcolor: 'background.paper',
      minWidth: STICKY_COL_WIDTH,
      borderRight: 1,
      borderColor: 'divider',
    }}
  >
    {children}
  </TableCell>
);

const StickyBodyCell: React.FC<{
  children: React.ReactNode;
  sx?: React.ComponentProps<typeof TableCell>['sx'];
}> = ({ children, sx }) => (
  <TableCell
    sx={{
      position: 'sticky',
      left: 0,
      zIndex: 1,
      bgcolor: 'background.paper',
      minWidth: STICKY_COL_WIDTH,
      borderRight: 1,
      borderColor: 'divider',
      ...sx,
    }}
  >
    {children}
  </TableCell>
);

export default MarketingSummaryPage;
