import React, { useEffect, useMemo, useState } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  CircularProgress,
  Divider,
  InputAdornment,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import SaveIcon from '@mui/icons-material/Save';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import apiClient from '../../../shared/api/apiClient';
import {
  BAND_THEME,
  type ProfitBand,
  type ProfitSegment,
  formatPct,
  formatVnd,
} from '../profitSegments';

interface SegmentForm {
  name: string;
  min_price_vnd: string;
  max_price_vnd: string;
  danger_max_pct: string;
  warning_max_pct: string;
  good_max_pct: string;
}

interface UpdatePayload {
  id: number;
  name: string;
  min_price_vnd: number;
  max_price_vnd: number | null;
  danger_max_pct: number;
  warning_max_pct: number;
  good_max_pct: number;
}

const BAND_ORDER: ProfitBand[] = ['danger', 'warning', 'good', 'excellent'];

const toForm = (s: ProfitSegment): SegmentForm => ({
  name: s.name,
  min_price_vnd: String(s.min_price_vnd),
  max_price_vnd: s.max_price_vnd == null ? '' : String(s.max_price_vnd),
  danger_max_pct: String(s.danger_max_pct),
  warning_max_pct: String(s.warning_max_pct),
  good_max_pct: String(s.good_max_pct),
});

interface ValidatedForm {
  payload: UpdatePayload;
  warnings: string[];
}

function validateForm(id: number, form: SegmentForm): ValidatedForm | string {
  const name = form.name.trim();
  if (!name) return 'Tên phân khúc không được để trống.';

  const minPrice = Number(form.min_price_vnd);
  if (!Number.isFinite(minPrice) || minPrice < 0) {
    return 'Giá tối thiểu phải là số ≥ 0.';
  }
  const maxRaw = form.max_price_vnd.trim();
  const maxPrice = maxRaw === '' ? null : Number(maxRaw);
  if (maxPrice != null && (!Number.isFinite(maxPrice) || maxPrice < 0)) {
    return 'Giá tối đa phải là số ≥ 0 (hoặc để trống nếu không giới hạn).';
  }
  if (maxPrice != null && minPrice > maxPrice) {
    return 'Giá tối thiểu phải ≤ giá tối đa.';
  }

  const danger = Number(form.danger_max_pct);
  const warning = Number(form.warning_max_pct);
  const good = Number(form.good_max_pct);
  for (const [label, v] of [
    ['Ngưỡng Đỏ', danger],
    ['Ngưỡng Cam', warning],
    ['Ngưỡng Xanh dương', good],
  ] as const) {
    if (!Number.isFinite(v) || v < -100 || v > 100) {
      return `${label} phải là số trong khoảng -100 .. 100.`;
    }
  }
  if (!(danger <= warning && warning <= good)) {
    return 'Cần thoả mãn Đỏ ≤ Cam ≤ Xanh dương.';
  }

  return {
    payload: {
      id,
      name,
      min_price_vnd: minPrice,
      max_price_vnd: maxPrice,
      danger_max_pct: danger,
      warning_max_pct: warning,
      good_max_pct: good,
    },
    warnings: [],
  };
}

const BandLegend: React.FC = () => (
  <Stack
    direction={{ xs: 'column', sm: 'row' }}
    spacing={1.5}
    sx={{ flexWrap: 'wrap', gap: 1.5 }}
  >
    {BAND_ORDER.map((band) => {
      const theme = BAND_THEME[band];
      return (
        <Chip
          key={band}
          label={`${theme.emoji} ${theme.label}`}
          sx={{
            bgcolor: theme.bg,
            color: theme.fg,
            fontWeight: 600,
            '& .MuiChip-label': { px: 1.2 },
          }}
        />
      );
    })}
  </Stack>
);

interface SegmentCardProps {
  segment: ProfitSegment;
  onSaved: () => void;
}

const SegmentCard: React.FC<SegmentCardProps> = ({ segment, onSaved }) => {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<SegmentForm>(() => toForm(segment));
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setForm(toForm(segment));
    setLocalError(null);
  }, [segment]);

  const updateMutation = useMutation({
    mutationFn: async (payload: UpdatePayload) => {
      const response = await apiClient.put(
        `/profit-segments/${payload.id}`,
        {
          name: payload.name,
          min_price_vnd: payload.min_price_vnd,
          max_price_vnd: payload.max_price_vnd,
          danger_max_pct: payload.danger_max_pct,
          warning_max_pct: payload.warning_max_pct,
          good_max_pct: payload.good_max_pct,
        },
      );
      if (response.data.status) return response.data.data as ProfitSegment;
      throw new Error(response.data.error || 'Cập nhật thất bại');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profit-segments'] });
      onSaved();
    },
  });

  const handleSave = () => {
    setLocalError(null);
    const result = validateForm(segment.id, form);
    if (typeof result === 'string') {
      setLocalError(result);
      return;
    }
    updateMutation.mutate(result.payload);
  };

  const previewBands = useMemo(() => {
    const danger = Number(form.danger_max_pct);
    const warning = Number(form.warning_max_pct);
    const good = Number(form.good_max_pct);
    return [
      {
        band: 'danger' as const,
        range: `< ${formatPct(Number.isFinite(danger) ? danger : 0)}`,
      },
      {
        band: 'warning' as const,
        range: `${formatPct(
          Number.isFinite(danger) ? danger : 0,
        )} – ${formatPct(Number.isFinite(warning) ? warning : 0)}`,
      },
      {
        band: 'good' as const,
        range: `${formatPct(
          Number.isFinite(warning) ? warning : 0,
        )} – ${formatPct(Number.isFinite(good) ? good : 0)}`,
      },
      {
        band: 'excellent' as const,
        range: `> ${formatPct(Number.isFinite(good) ? good : 0)}`,
      },
    ];
  }, [form.danger_max_pct, form.warning_max_pct, form.good_max_pct]);

  const priceRangeLabel = useMemo(() => {
    const min = Number(form.min_price_vnd);
    const maxRaw = form.max_price_vnd.trim();
    const max = maxRaw === '' ? null : Number(maxRaw);
    return `${formatVnd(Number.isFinite(min) ? min : 0)} – ${formatVnd(max)} VND`;
  }, [form.min_price_vnd, form.max_price_vnd]);

  const dirty = useMemo(() => {
    const original = toForm(segment);
    return (
      original.name !== form.name ||
      original.min_price_vnd !== form.min_price_vnd ||
      original.max_price_vnd !== form.max_price_vnd ||
      original.danger_max_pct !== form.danger_max_pct ||
      original.warning_max_pct !== form.warning_max_pct ||
      original.good_max_pct !== form.good_max_pct
    );
  }, [segment, form]);

  const handleReset = () => {
    setForm(toForm(segment));
    setLocalError(null);
    updateMutation.reset();
  };

  const mutationError = (updateMutation.error as Error | undefined)?.message;

  return (
    <Card variant="outlined">
      <CardHeader
        title={
          <Stack
            direction="row"
            spacing={1}
            sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 1 }}
          >
            <Chip
              size="small"
              label={segment.code.toUpperCase()}
              color="primary"
              variant="outlined"
              sx={{ fontWeight: 700, letterSpacing: 0.5 }}
            />
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {segment.name}
            </Typography>
          </Stack>
        }
        subheader={
          <Typography variant="body2" color="text.secondary">
            Khoảng giá hiện tại: <strong>{priceRangeLabel}</strong>
          </Typography>
        }
      />
      <Divider />
      <CardContent>
        <Stack spacing={2.5}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            sx={{ gap: 2 }}
          >
            <TextField
              label="Tên phân khúc"
              value={form.name}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, name: e.target.value }))
              }
              fullWidth
              size="small"
            />
          </Stack>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="Giá tối thiểu"
              type="number"
              value={form.min_price_vnd}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, min_price_vnd: e.target.value }))
              }
              size="small"
              fullWidth
              slotProps={{
                htmlInput: { min: 0, step: 1000 },
                input: {
                  endAdornment: (
                    <InputAdornment position="end">VND</InputAdornment>
                  ),
                },
              }}
              helperText="Bao gồm giá trị này"
            />
            <TextField
              label="Giá tối đa"
              type="number"
              value={form.max_price_vnd}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, max_price_vnd: e.target.value }))
              }
              size="small"
              fullWidth
              slotProps={{
                htmlInput: { min: 0, step: 1000 },
                input: {
                  endAdornment: (
                    <InputAdornment position="end">VND</InputAdornment>
                  ),
                },
              }}
              helperText="Không bao gồm giá trị này. Để trống = không giới hạn."
            />
          </Stack>

          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700 }}>
              Ngưỡng % Profit / Revenue
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <Tooltip title="🔴 Dưới mức này được coi là Nguy hiểm">
                <TextField
                  label={`${BAND_THEME.danger.emoji} Dưới (Đỏ)`}
                  type="number"
                  value={form.danger_max_pct}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      danger_max_pct: e.target.value,
                    }))
                  }
                  size="small"
                  fullWidth
                  slotProps={{
                    htmlInput: { step: 0.5, min: -100, max: 100 },
                    input: {
                      endAdornment: (
                        <InputAdornment position="end">%</InputAdornment>
                      ),
                    },
                  }}
                />
              </Tooltip>
              <Tooltip title="🟡 Từ ngưỡng Đỏ tới ngưỡng này → Cảnh báo">
                <TextField
                  label={`${BAND_THEME.warning.emoji} Tới (Cam)`}
                  type="number"
                  value={form.warning_max_pct}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      warning_max_pct: e.target.value,
                    }))
                  }
                  size="small"
                  fullWidth
                  slotProps={{
                    htmlInput: { step: 0.5, min: -100, max: 100 },
                    input: {
                      endAdornment: (
                        <InputAdornment position="end">%</InputAdornment>
                      ),
                    },
                  }}
                />
              </Tooltip>
              <Tooltip title="🔵 Từ ngưỡng Cam tới ngưỡng này → Tốt. Trên ngưỡng này → Xuất sắc.">
                <TextField
                  label={`${BAND_THEME.good.emoji} Tới (Xanh dương)`}
                  type="number"
                  value={form.good_max_pct}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      good_max_pct: e.target.value,
                    }))
                  }
                  size="small"
                  fullWidth
                  slotProps={{
                    htmlInput: { step: 0.5, min: -100, max: 100 },
                    input: {
                      endAdornment: (
                        <InputAdornment position="end">%</InputAdornment>
                      ),
                    },
                  }}
                />
              </Tooltip>
            </Stack>
          </Box>

          <Box>
            <Typography
              variant="caption"
              sx={{ color: 'text.secondary', fontWeight: 700 }}
            >
              XEM TRƯỚC DẢI MÀU
            </Typography>
            <Box
              sx={{
                mt: 1,
                display: 'grid',
                gridTemplateColumns: {
                  xs: '1fr',
                  sm: 'repeat(2, 1fr)',
                  md: 'repeat(4, 1fr)',
                },
                gap: 1,
              }}
            >
              {previewBands.map(({ band, range }) => {
                const themeBand = BAND_THEME[band];
                return (
                  <Box
                    key={band}
                    sx={{
                      p: 1.5,
                      borderRadius: 1.5,
                      bgcolor: themeBand.bg,
                      color: themeBand.fg,
                      border: '1px solid',
                      borderColor: 'divider',
                    }}
                  >
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {themeBand.emoji} {themeBand.label}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{ display: 'block', fontWeight: 600 }}
                    >
                      {range}
                    </Typography>
                  </Box>
                );
              })}
            </Box>
          </Box>

          {localError ? (
            <Alert severity="warning">{localError}</Alert>
          ) : mutationError ? (
            <Alert severity="error">{mutationError}</Alert>
          ) : null}

          <Stack
            direction="row"
            spacing={1.5}
            sx={{ justifyContent: 'flex-end', alignItems: 'center' }}
          >
            {updateMutation.isSuccess && !dirty ? (
              <Typography variant="caption" color="success.main">
                Đã lưu thay đổi.
              </Typography>
            ) : null}
            <Button
              color="inherit"
              startIcon={<RefreshIcon />}
              onClick={handleReset}
              disabled={!dirty || updateMutation.isPending}
            >
              Huỷ thay đổi
            </Button>
            <Button
              variant="contained"
              startIcon={<SaveIcon />}
              onClick={handleSave}
              disabled={!dirty || updateMutation.isPending}
            >
              {updateMutation.isPending ? 'Đang lưu…' : 'Lưu phân khúc'}
            </Button>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
};

const ProfitSegmentsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery<ProfitSegment[]>({
    queryKey: ['profit-segments'],
    queryFn: async () => {
      const response = await apiClient.get('/profit-segments');
      if (response.data.status) return response.data.data as ProfitSegment[];
      throw new Error(
        response.data.error || 'Không tải được danh sách phân khúc.',
      );
    },
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.post('/profit-segments/reset-defaults');
      if (response.data.status) return response.data.data as ProfitSegment[];
      throw new Error(response.data.error || 'Reset thất bại');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profit-segments'] });
    },
  });

  const sorted = useMemo(
    () => [...(data ?? [])].sort((a, b) => a.sort_order - b.sort_order),
    [data],
  );

  return (
    <Box>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        sx={{
          mb: 2,
          justifyContent: 'space-between',
          alignItems: { xs: 'flex-start', sm: 'center' },
        }}
      >
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>
            Phân khúc & Đánh giá lợi nhuận
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Cấu hình 3 phân khúc theo giá bán và 4 dải màu đánh giá{' '}
            <strong>% Profit / Revenue</strong> cho báo cáo Marketing Summary.
          </Typography>
        </Box>
        <Button
          variant="outlined"
          color="inherit"
          startIcon={<RestartAltIcon />}
          onClick={() => resetMutation.mutate()}
          disabled={resetMutation.isPending}
        >
          {resetMutation.isPending
            ? 'Đang reset…'
            : 'Reset về mặc định'}
        </Button>
      </Stack>

      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
            Ý nghĩa 4 dải màu
          </Typography>
          <BandLegend />
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block', mt: 1.5 }}
          >
            Cách phân loại: <code>pct &lt; Đỏ → 🔴</code> ·{' '}
            <code>Đỏ ≤ pct &lt; Cam → 🟡</code> ·{' '}
            <code>Cam ≤ pct &lt; Xanh dương → 🔵</code> ·{' '}
            <code>pct ≥ Xanh dương → 🟢</code>
          </Typography>
        </CardContent>
      </Card>

      {error ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {(error as Error).message}
        </Alert>
      ) : null}

      {resetMutation.isError ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {(resetMutation.error as Error).message}
        </Alert>
      ) : null}

      {isLoading && !data ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Stack spacing={2.5}>
          {sorted.map((segment) => (
            <SegmentCard
              key={segment.id}
              segment={segment}
              onSaved={() => {
                /* invalidation handled in mutation */
              }}
            />
          ))}
          {sorted.length === 0 && !isLoading && (
            <Alert severity="info">
              Chưa có phân khúc nào. Bấm <strong>Reset về mặc định</strong> để
              khởi tạo 3 phân khúc gợi ý.
            </Alert>
          )}
        </Stack>
      )}
    </Box>
  );
};

export default ProfitSegmentsPage;
