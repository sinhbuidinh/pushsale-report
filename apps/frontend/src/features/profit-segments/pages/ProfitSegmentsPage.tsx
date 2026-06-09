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
  type PoasSettings,
  type ProfitBand,
  type ProfitSegment,
  formatPct,
  formatRatio,
  formatVnd,
} from '../profitSegments';

interface PoasForm {
  danger_max: string;
  warning_max: string;
  good_max: string;
}

interface PoasUpdatePayload {
  danger_max: number;
  warning_max: number;
  good_max: number;
}

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

const toPoasForm = (s: PoasSettings): PoasForm => ({
  danger_max: String(s.danger_max),
  warning_max: String(s.warning_max),
  good_max: String(s.good_max),
});

function validatePoasForm(form: PoasForm): PoasUpdatePayload | string {
  const danger = Number(form.danger_max);
  const warning = Number(form.warning_max);
  const good = Number(form.good_max);
  for (const [label, v] of [
    ['Ngưỡng Đỏ', danger],
    ['Ngưỡng Cam', warning],
    ['Ngưỡng Xanh dương', good],
  ] as const) {
    if (!Number.isFinite(v) || v < 0) {
      return `${label} phải là số ≥ 0.`;
    }
  }
  if (!(danger <= warning && warning <= good)) {
    return 'Cần thoả mãn Đỏ ≤ Cam ≤ Xanh dương.';
  }
  return { danger_max: danger, warning_max: warning, good_max: good };
}

function buildRatioPreviewBands(
  dangerRaw: string,
  warningRaw: string,
  goodRaw: string,
) {
  const danger = Number(dangerRaw);
  const warning = Number(warningRaw);
  const good = Number(goodRaw);
  return [
    {
      band: 'danger' as const,
      range: `< ${formatRatio(Number.isFinite(danger) ? danger : 0)}`,
    },
    {
      band: 'warning' as const,
      range: `${formatRatio(
        Number.isFinite(danger) ? danger : 0,
      )} – ${formatRatio(Number.isFinite(warning) ? warning : 0)}`,
    },
    {
      band: 'good' as const,
      range: `${formatRatio(
        Number.isFinite(warning) ? warning : 0,
      )} – ${formatRatio(Number.isFinite(good) ? good : 0)}`,
    },
    {
      band: 'excellent' as const,
      range: `≥ ${formatRatio(Number.isFinite(good) ? good : 0)}`,
    },
  ];
}

function buildPctPreviewBands(
  dangerRaw: string,
  warningRaw: string,
  goodRaw: string,
) {
  const danger = Number(dangerRaw);
  const warning = Number(warningRaw);
  const good = Number(goodRaw);
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
      range: `≥ ${formatPct(Number.isFinite(good) ? good : 0)}`,
    },
  ];
}

const ThresholdPreview: React.FC<{
  bands: { band: ProfitBand; range: string }[];
}> = ({ bands }) => (
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
      {bands.map(({ band, range }) => {
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
);

interface PoasSettingsCardProps {
  settings: PoasSettings;
}

const PoasSettingsCard: React.FC<PoasSettingsCardProps> = ({ settings }) => {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<PoasForm>(() => toPoasForm(settings));
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setForm(toPoasForm(settings));
    setLocalError(null);
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: async (payload: PoasUpdatePayload) => {
      const response = await apiClient.put('/profit-segments/poas-settings', payload);
      if (response.data.status) return response.data.data as PoasSettings;
      throw new Error(response.data.error || 'Cập nhật thất bại');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['poas-settings'] });
    },
  });

  const handleSave = () => {
    setLocalError(null);
    const result = validatePoasForm(form);
    if (typeof result === 'string') {
      setLocalError(result);
      return;
    }
    updateMutation.mutate(result);
  };

  const previewBands = useMemo(
    () => buildRatioPreviewBands(form.danger_max, form.warning_max, form.good_max),
    [form.danger_max, form.warning_max, form.good_max],
  );

  const dirty = useMemo(() => {
    const original = toPoasForm(settings);
    return (
      original.danger_max !== form.danger_max ||
      original.warning_max !== form.warning_max ||
      original.good_max !== form.good_max
    );
  }, [settings, form]);

  const handleReset = () => {
    setForm(toPoasForm(settings));
    setLocalError(null);
    updateMutation.reset();
  };

  const mutationError = (updateMutation.error as Error | undefined)?.message;

  return (
    <Card variant="outlined">
      <CardHeader
        title={
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Chỉ số 1: Điểm hiệu suất POAS
          </Typography>
        }
        subheader={
          <Typography variant="body2" color="text.secondary">
            Ngưỡng POAS toàn cục (Tổng lợi nhuận gộp ÷ (ADS + Thuế TK 10%)). Mặc
            định theo tiêu chí chấm điểm đa chiều.
          </Typography>
        }
      />
      <Divider />
      <CardContent>
        <Stack spacing={2.5}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <Tooltip title="🔴 POAS dưới mức này — Vi phạm ngưỡng chặn tài chính">
              <TextField
                label={`${BAND_THEME.danger.emoji} Dưới (Đỏ)`}
                type="number"
                value={form.danger_max}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, danger_max: e.target.value }))
                }
                size="small"
                fullWidth
                slotProps={{
                  htmlInput: { step: 0.1, min: 0 },
                }}
              />
            </Tooltip>
            <Tooltip title="🟡 Từ ngưỡng Đỏ tới ngưỡng này — Hiệu suất Yếu">
              <TextField
                label={`${BAND_THEME.warning.emoji} Tới (Cam)`}
                type="number"
                value={form.warning_max}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, warning_max: e.target.value }))
                }
                size="small"
                fullWidth
                slotProps={{
                  htmlInput: { step: 0.1, min: 0 },
                }}
              />
            </Tooltip>
            <Tooltip title="🔵 Từ ngưỡng Cam tới ngưỡng này — Hiệu suất Tiêu chuẩn. Từ ngưỡng này trở lên → Xuất sắc.">
              <TextField
                label={`${BAND_THEME.good.emoji} Tới (Xanh dương)`}
                type="number"
                value={form.good_max}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, good_max: e.target.value }))
                }
                size="small"
                fullWidth
                slotProps={{
                  htmlInput: { step: 0.1, min: 0 },
                }}
              />
            </Tooltip>
          </Stack>

          <ThresholdPreview bands={previewBands} />

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
              {updateMutation.isPending ? 'Đang lưu…' : 'Lưu POAS'}
            </Button>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
};

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

  const previewBands = useMemo(
    () =>
      buildPctPreviewBands(
        form.danger_max_pct,
        form.warning_max_pct,
        form.good_max_pct,
      ),
    [form.danger_max_pct, form.warning_max_pct, form.good_max_pct],
  );

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
              ROS % (theo phân khúc giá)
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

          <ThresholdPreview bands={previewBands} />

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
  const { data: poasSettings, isLoading: loadingPoas } = useQuery<PoasSettings>({
    queryKey: ['poas-settings'],
    queryFn: async () => {
      const response = await apiClient.get('/profit-segments/poas-settings');
      if (response.data.status) return response.data.data as PoasSettings;
      throw new Error(
        response.data.error || 'Không tải được cấu hình POAS.',
      );
    },
  });

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
      if (response.data.status) return response.data.data;
      throw new Error(response.data.error || 'Reset thất bại');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profit-segments'] });
      queryClient.invalidateQueries({ queryKey: ['poas-settings'] });
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
            Cấu hình ngưỡng <strong>POAS</strong> toàn cục và 3 phân khúc theo
            giá bán với 4 dải màu đánh giá <strong>ROS %</strong> cho báo cáo
            Marketing Summary.
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
            Cách phân loại (POAS hoặc ROS): <code>giá trị &lt; Đỏ → 🔴</code> ·{' '}
            <code>Đỏ ≤ giá trị &lt; Cam → 🟡</code> ·{' '}
            <code>Cam ≤ giá trị &lt; Xanh dương → 🔵</code> ·{' '}
            <code>giá trị ≥ Xanh dương → 🟢</code>
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

      {isLoading && !data && loadingPoas && !poasSettings ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Stack spacing={3}>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
              1. POAS
            </Typography>
            {poasSettings ? (
              <PoasSettingsCard settings={poasSettings} />
            ) : loadingPoas ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                <CircularProgress size={28} />
              </Box>
            ) : (
              <Alert severity="info">
                Chưa có cấu hình POAS. Bấm <strong>Reset về mặc định</strong>{' '}
                để khởi tạo.
              </Alert>
            )}
          </Box>

          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
              2. ROS (%)
            </Typography>
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
                  Chưa có phân khúc nào. Bấm <strong>Reset về mặc định</strong>{' '}
                  để khởi tạo 3 phân khúc gợi ý.
                </Alert>
              )}
            </Stack>
          </Box>
        </Stack>
      )}
    </Box>
  );
};

export default ProfitSegmentsPage;
