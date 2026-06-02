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
import { getStoredUser } from '../../../shared/auth/authStorage';
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
  total_cost_est: number;
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
  total_cost_est: number;
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

const pad2 = (n: number): string => String(n).padStart(2, '0');

/**
 * Format a Date as a YYYY-MM-DD string in the **local** timezone. Using the
 * local date matches what `<input type="date">` shows and avoids the
 * UTC-shift bug `new Date().toISOString()` causes for users east of UTC
 * (e.g. Vietnam past midnight local time).
 */
const ymdLocal = (date: Date): string =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

const todayYmd = (): string => ymdLocal(new Date());

const addDays = (date: Date, days: number): Date => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

/** Monday of the ISO-style week containing `date` (Mon=start, Sun=end). */
const startOfWeek = (date: Date): Date => {
  const d = new Date(date);
  const diff = (d.getDay() + 6) % 7; // 0 if Mon, 6 if Sun
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

const startOfMonth = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), 1);

const endOfMonth = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth() + 1, 0);

interface PresetRange {
  start: string;
  end: string;
  isRange: boolean;
}

interface PresetOption {
  key: string;
  label: string;
  build: (now: Date) => PresetRange;
}

/**
 * Quick-select shortcuts for the date filter. Single-day presets collapse
 * the range toggle off; multi-day presets switch it on.
 */
const PRESETS: PresetOption[] = [
  {
    key: 'today',
    label: 'Hôm nay',
    build: (now) => ({
      start: ymdLocal(now),
      end: ymdLocal(now),
      isRange: false,
    }),
  },
  {
    key: 'yesterday',
    label: 'Hôm qua',
    build: (now) => {
      const y = addDays(now, -1);
      return { start: ymdLocal(y), end: ymdLocal(y), isRange: false };
    },
  },
  {
    key: 'last_7_days',
    label: '7 ngày qua',
    build: (now) => ({
      start: ymdLocal(addDays(now, -6)),
      end: ymdLocal(now),
      isRange: true,
    }),
  },
  {
    key: 'last_30_days',
    label: '30 ngày qua',
    build: (now) => ({
      start: ymdLocal(addDays(now, -29)),
      end: ymdLocal(now),
      isRange: true,
    }),
  },
  {
    key: 'this_week',
    label: 'Tuần này',
    build: (now) => ({
      start: ymdLocal(startOfWeek(now)),
      end: ymdLocal(now),
      isRange: true,
    }),
  },
  {
    key: 'last_week',
    label: 'Tuần trước',
    build: (now) => {
      const thisMon = startOfWeek(now);
      const lastSun = addDays(thisMon, -1);
      const lastMon = addDays(lastSun, -6);
      return {
        start: ymdLocal(lastMon),
        end: ymdLocal(lastSun),
        isRange: true,
      };
    },
  },
  {
    key: 'this_month',
    label: 'Tháng này',
    build: (now) => ({
      start: ymdLocal(startOfMonth(now)),
      end: ymdLocal(now),
      isRange: true,
    }),
  },
  {
    key: 'last_month',
    label: 'Tháng trước',
    build: (now) => {
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return {
        start: ymdLocal(startOfMonth(prev)),
        end: ymdLocal(endOfMonth(prev)),
        isRange: true,
      };
    },
  },
];

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
  /**
   * Optional tooltip shown when hovering the row label. Accepts plain text or
   * arbitrary JSX (e.g. multi-line formulas).
   */
  tooltip?: React.ReactNode;
  value: (row: MarketingSummaryRow) => number | null;
  unmatched: (u: MarketingSummaryUnmatched) => number | null;
  total: (t: MarketingSummaryTotals) => number | null;
  /**
   * Optional small annotation rendered next to each per-product cell value,
   * e.g. the VAT % used to compute the row. Returning `null` hides it.
   */
  cellAnnotation?: (row: MarketingSummaryRow) => string | null;
}

/**
 * Multi-line formula breakdown rendered inside a `<Tooltip>`. Each operand
 * sits on its own line with a leading `=` or `−` so the math is easy to read
 * at a glance.
 */
const FormulaTooltip: React.FC<{
  result: string;
  operands: { sign: '=' | '−' | '+' | '×' | '÷'; label: string }[];
  note?: string;
}> = ({ result, operands, note }) => (
  <Box sx={{ fontFamily: 'monospace', lineHeight: 1.6, p: 0.25 }}>
    <Box sx={{ fontWeight: 700, mb: 0.5 }}>{result}</Box>
    {operands.map((op, i) => (
      <Box key={i} sx={{ pl: 1 }}>
        <Box component="span" sx={{ display: 'inline-block', width: 14 }}>
          {op.sign}
        </Box>
        {op.label}
      </Box>
    ))}
    {note && (
      <Box
        sx={{
          mt: 0.75,
          fontFamily: 'inherit',
          fontStyle: 'italic',
          opacity: 0.85,
        }}
      >
        {note}
      </Box>
    )}
  </Box>
);

const METRICS: MetricDef[] = [
  {
    key: 'selling_price',
    label: 'Giá bán (1sp)',
    format: 'number',
    tooltip: 'Giá bán cho một đơn vị sản phẩm.',
    value: (r) => r.selling_price,
    unmatched: () => null,
    total: () => null,
  },
  {
    key: 'revenue',
    label: 'Doanh thu',
    format: 'number',
    value: (r) => r.revenue,
    unmatched: () => null,
    total: (t) => t.revenue,
  },
  {
    key: 'revenue_estimate',
    label: 'Doanh thu ước tính (×0.8)',
    tooltip:
      'Doanh thu × 0,8. Chỉ là ước tính vì đơn hàng có thể được hoàn/trả.',
    format: 'number',
    value: (r) => r.revenue_estimate,
    unmatched: () => null,
    total: (t) => t.revenue_estimate,
  },
  {
    key: 'revenue_tax',
    label: 'Thuế doanh thu (VAT)',
    format: 'number',
    tooltip: 'Doanh thu ước tính × % VAT của sản phẩm (theo từng dòng).',
    value: (r) => r.revenue_tax,
    unmatched: () => null,
    total: (t) => t.revenue_tax,
    cellAnnotation: (r) =>
      r.tax_value_pct > 0 ? `${r.tax_value_pct}%` : null,
  },
  {
    key: 'cost_price',
    label: 'Giá vốn (1 sp)',
    format: 'number',
    tooltip:
      'Giá vốn cho một sản phẩm (Giá có thể thay đổi theo tháng).',
    value: (r) => r.cost_price,
    unmatched: () => null,
    total: () => null,
  },
  {
    key: 'total_cost',
    label: 'Tổng giá vốn',
    format: 'number',
    value: (r) => r.total_cost,
    unmatched: () => null,
    total: (t) => t.total_cost,
  },
  {
    key: 'total_cost_est',
    label: 'Tổng giá vốn ước tính (×0.8)',
    format: 'number',
    tooltip:
      'Tổng giá vốn × 0,8. Chỉ là ước tính vì đơn hàng có thể được hoàn/trả.',
    value: (r) => r.total_cost_est,
    unmatched: () => null,
    total: (t) => t.total_cost_est,
  },
  {
    key: 'risk_fee',
    label: 'Phí rủi ro (10% tổng giá vốn ước tính)',
    format: 'number',
    value: (r) => r.risk_fee,
    unmatched: () => null,
    total: (t) => t.risk_fee,
  },
  {
    key: 'delivery_fee_per_unit',
    label: 'Phí vận chuyển (1 sp)',
    format: 'number',
    tooltip: 'Phí vận chuyển tính trên mỗi đơn vị sản phẩm.',
    value: (r) => r.delivery_fee_per_unit,
    unmatched: () => null,
    total: () => null,
  },
  {
    key: 'total_delivery_fee',
    label: 'Tổng phí vận chuyển',
    format: 'number',
    value: (r) => r.total_delivery_fee,
    unmatched: () => null,
    total: (t) => t.total_delivery_fee,
  },
  {
    key: 'ads_spend',
    label: 'Quảng cáo',
    format: 'number',
    value: (r) => r.ads_spend,
    unmatched: (u) => u.ads_spend,
    total: (t) => t.ads_spend,
  },
  {
    key: 'tax_ads',
    label: 'Thuế quảng cáo (10%)',
    format: 'number',
    value: (r) => r.tax_ads,
    unmatched: (u) => u.tax_ads,
    total: (t) => t.tax_ads,
  },
  {
    key: 'ads_per_revenue_pct',
    label: '% Quảng cáo / Doanh thu ước tính',
    format: 'percent',
    value: (r) => r.ads_per_revenue_pct,
    unmatched: () => null,
    total: (t) => t.ads_per_revenue_pct,
  },
  {
    key: 'profit',
    label: 'Lợi nhuận',
    format: 'number',
    emphasize: true,
    tooltip: (
      <FormulaTooltip
        result="Lợi nhuận"
        operands={[
          { sign: '=', label: 'Doanh thu ước tính' },
          { sign: '−', label: 'Thuế doanh thu (VAT)' },
          { sign: '−', label: 'Tổng giá vốn ước tính' },
          { sign: '−', label: 'Phí rủi ro' },
          { sign: '−', label: 'Tổng phí vận chuyển' },
          { sign: '−', label: 'Thuế quảng cáo (10%)' },
        ]}
        note="Quảng cáo không khớp không bị trừ vào lợi nhuận."
      />
    ),
    value: (r) => r.profit,
    unmatched: () => null,
    total: (t) => t.profit,
  },
  {
    key: 'profit_per_revenue_pct',
    label: '% Lợi nhuận / Doanh thu ước tính',
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
  /**
   * Marketing users can only summarise their own data. We fix the
   * `marketing_user_id` filter to the logged-in user's id and hide the
   * dropdown for them.
   */
  const storedUser = getStoredUser();
  const isMarketingUser = storedUser?.type === 'marketing';
  const fixedMarketingUserId =
    isMarketingUser && typeof storedUser?.id === 'number'
      ? String(storedUser.id)
      : '';

  const [marketingUserInput, setMarketingUserInput] = useState<string>(
    fixedMarketingUserId,
  );
  const [isRange, setIsRange] = useState(false);
  const [startDateInput, setStartDateInput] = useState<string>(todayYmd());
  const [endDateInput, setEndDateInput] = useState<string>(todayYmd());
  /**
   * Tracks which quick-select preset is currently active. Empty string means
   * "Custom" - either no preset has been picked yet or the user edited the
   * dates manually.
   */
  const [presetKey, setPresetKey] = useState<string>('today');

  const applyPreset = (key: string) => {
    const preset = PRESETS.find((p) => p.key === key);
    if (!preset) return;
    const r = preset.build(new Date());
    setStartDateInput(r.start);
    setEndDateInput(r.end);
    setIsRange(r.isRange);
    setPresetKey(key);
  };

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
      enabled: !isMarketingUser,
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
    setMarketingUserInput(fixedMarketingUserId);
    setIsRange(false);
    const t = todayYmd();
    setStartDateInput(t);
    setEndDateInput(t);
    setPresetKey('today');
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
        <Typography variant="h4">Báo cáo bán hàng</Typography>
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
        {!isMarketingUser && (
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
        )}

        <FormControl size="small" sx={{ minWidth: 170 }}>
          <InputLabel>Chọn nhanh ngày</InputLabel>
          <Select
            label="Chọn nhanh ngày"
            value={presetKey}
            onChange={(e) => {
              const k = e.target.value as string;
              if (k === '') {
                setPresetKey('');
                return;
              }
              applyPreset(k);
            }}
            sx={{ bgcolor: 'action.hover' }}
          >
            <MenuItem value="">
              <em>Tùy chọn</em>
            </MenuItem>
            {PRESETS.map((p) => (
              <MenuItem key={p.key} value={p.key}>
                {p.label}
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
                setPresetKey('');
              }}
            />
          }
          label="Khoảng ngày"
          sx={{ ml: 0 }}
        />

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Typography
            variant="caption"
            sx={{ color: 'text.secondary', fontWeight: 'bold', ml: 1 }}
          >
            {isRange ? 'Từ ngày' : 'Ngày'}
          </Typography>
          <TextField
            size="small"
            type="date"
            value={startDateInput}
            onChange={(e) => {
              setStartDateInput(e.target.value);
              if (!isRange) setEndDateInput(e.target.value);
              setPresetKey('');
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
              Đến ngày
            </Typography>
            <TextField
              size="small"
              type="date"
              value={endDateInput}
              onChange={(e) => {
                setEndDateInput(e.target.value);
                setPresetKey('');
              }}
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
            Xem báo cáo
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
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
            Bạn có thể xem báo cáo theo 2 cách:
          </Typography>
          <Box component="ol" sx={{ m: 0, pl: 2.5 }}>
            {isMarketingUser ? (
              <>
                <Box component="li" sx={{ mb: 0.75 }}>
                  Chọn <strong>Ngày</strong> muốn xem, xong nhấn{' '}
                  <strong>Xem báo cáo</strong>.
                </Box>
                <Box component="li">
                  Nhấn <strong>Khoảng ngày</strong>, chọn <strong>Từ ngày</strong>{' '}
                  và <strong>Đến ngày</strong> mong muốn, xong nhấn{' '}
                  <strong>Xem báo cáo</strong>.
                </Box>
              </>
            ) : (
              <>
                <Box component="li" sx={{ mb: 0.75 }}>
                  Chọn người dùng marketing và chọn ngày muốn xem, xong nhấn{' '}
                  <strong>Xem báo cáo</strong>.
                </Box>
                <Box component="li">
                  Chọn người dùng marketing và nhấn <strong>Khoảng ngày</strong>,
                  sau đó chọn <strong>Từ ngày</strong> và <strong>Đến ngày</strong>{' '}
                  mong muốn, xong nhấn <strong>Xem báo cáo</strong>.
                </Box>
              </>
            )}
          </Box>
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
                  <TableCell sx={{ fontWeight: 700 }}>Kỳ</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    Đơn đã xác nhận
                  </TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>Tài khoản quảng cáo</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    Quảng cáo không khớp
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    Lợi nhuận
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    % Lợi nhuận/Doanh thu
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
                    <Tooltip title="Tổng chi phí quảng cáo có tên chiến dịch không khớp sản phẩm nào. Không bị trừ vào lợi nhuận.">
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
                  <StickyHeadCell>Chỉ số</StickyHeadCell>
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
                          SL: <strong>{fmtNum(row.total_quantity)}</strong>
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
                        Không khớp
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
                        SL: <strong>—</strong>
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
                        TỔNG CỘNG
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{ color: 'text.secondary', fontWeight: 500 }}
                      >
                        tất cả sản phẩm + không khớp
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{ color: 'text.secondary' }}
                      >
                        SL:{' '}
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
                            {metric.cellAnnotation &&
                              (() => {
                                const note = metric.cellAnnotation!(row);
                                return note ? (
                                  <Typography
                                    component="span"
                                    sx={{
                                      ml: 0.5,
                                      color: 'text.secondary',
                                      fontSize: '0.75rem',
                                      fontWeight: 400,
                                    }}
                                  >
                                    ({note})
                                  </Typography>
                                ) : null;
                              })()}
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
