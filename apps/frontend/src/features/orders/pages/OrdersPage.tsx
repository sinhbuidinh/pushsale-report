import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Typography, Table, TableBody, TableCell, 
  TableContainer, TableHead, TableRow, Paper, CircularProgress, 
  Alert, Box, Pagination, Select, MenuItem, FormControl, InputLabel,
  TextField, InputAdornment, Chip, Tooltip
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import { Button } from '@mui/material';
import apiClient from '../../../shared/api/apiClient';

interface Order {
  id: number;
  order_number: string;
  customer_id: number | null;
  customer_name: string | null;
  marketing_user_id: number | null;
  marketing_user_display_name: string | null;
  sale_user_id: number | null;
  sale_user_display_name: string | null;
  total_quantity: number;
  total_amount: string;
  total_price: string;
  total_shipping_cost: string;
  reason_create: string;
  status_name: string | null;
  operation_result_name: string | null;
  item_codes: string[] | string | null;
  confirm_time: string;
  created_time: string;
  updated_time: string;
}

interface OrdersResponse {
  data: Order[];
  total: number;
  page: number;
  limit: number;
}

interface OrderFilterUser {
  id: number;
  display_name: string;
}

interface OrderFilterUsersResponse {
  marketing: OrderFilterUser[];
  sale: OrderFilterUser[];
}

/**
 * Render an upstream timestamp string (e.g. `2026-05-25T23:49:41.133`) as
 * `YYYY-MM-DD HH:mm:ss`. The values are already in Vietnam local time, so we
 * just normalize the separator and drop sub-second precision instead of
 * round-tripping through `new Date()` (which would interpret the missing
 * timezone as UTC and shift the wall clock).
 */
const fmtDateTime = (s: string | null | undefined): string => {
  if (!s) return '—';
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})/.exec(s);
  return m ? `${m[1]} ${m[2]}` : s;
};

/** TypeORM `simple-array` may arrive as a string[] or comma-separated string. */
const parseItemCodes = (
  raw: string[] | string | null | undefined,
): string[] => {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map((c) => String(c).trim()).filter(Boolean);
  }
  return String(raw)
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
};

const itemCodesTooltip = (codes: string[]): string =>
  codes.length > 0 ? codes.join(', ') : 'Không có mã sản phẩm';

const ItemCodesCell = ({ codes }: { codes: string[] }) => {
  if (codes.length === 0) {
    return <>—</>;
  }

  const label = codes.join(', ');

  return (
    <Tooltip title={label} arrow placement="top">
      <Typography
        variant="body2"
        component="span"
        noWrap
        sx={{ display: 'block', maxWidth: 180, cursor: 'default' }}
      >
        {label}
      </Typography>
    </Tooltip>
  );
};

const OrdersPage = () => {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [searchInput, setSearchInput] = useState('');
  const [itemCodeInput, setItemCodeInput] = useState('');
  const [dateInput, setDateInput] = useState('');
  const [confirmDateInput, setConfirmDateInput] = useState('');
  const [marketingUserInput, setMarketingUserInput] = useState('');
  const [saleUserInput, setSaleUserInput] = useState('');
  const [confirmStatusInput, setConfirmStatusInput] = useState('');

  /** Values sent to the API (updated only when Search is clicked). */
  const [searchQuery, setSearchQuery] = useState('');
  const [itemCodeQuery, setItemCodeQuery] = useState('');
  const [dateQuery, setDateQuery] = useState('');
  const [confirmDateQuery, setConfirmDateQuery] = useState('');
  const [marketingUserQuery, setMarketingUserQuery] = useState('');
  const [saleUserQuery, setSaleUserQuery] = useState('');
  const [confirmStatusQuery, setConfirmStatusQuery] = useState('');

  const { data: filterUsers } = useQuery<OrderFilterUsersResponse>({
    queryKey: ['users', 'order-filters'],
    queryFn: async () => {
      const response = await apiClient.get('/users/order-filters');
      if (response.data.status) {
        return response.data.data;
      }
      throw new Error(response.data.error || 'Failed to load users');
    },
  });

  const { data, isLoading, error } = useQuery<OrdersResponse>({
    queryKey: ['orders', page, limit, searchQuery, itemCodeQuery, dateQuery, confirmDateQuery, marketingUserQuery, saleUserQuery, confirmStatusQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(limit));
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      if (itemCodeQuery.trim()) params.set('item_code', itemCodeQuery.trim());
      if (dateQuery.trim()) params.set('date', dateQuery.trim());
      if (confirmDateQuery.trim()) params.set('confirm_date', confirmDateQuery.trim());
      if (marketingUserQuery.trim()) params.set('marketing_user_id', marketingUserQuery.trim());
      if (saleUserQuery.trim()) params.set('sale_user_id', saleUserQuery.trim());
      if (confirmStatusQuery.trim()) params.set('confirm_status', confirmStatusQuery.trim());
      const response = await apiClient.get(`/orders?${params.toString()}`);
      if (response.data.status) {
        return response.data.data;
      }
      throw new Error(response.data.error || 'Failed to fetch orders');
    },
  });

  const handleSearch = () => {
    setSearchQuery(searchInput);
    setItemCodeQuery(itemCodeInput);
    setDateQuery(dateInput);
    setConfirmDateQuery(confirmDateInput);
    setMarketingUserQuery(marketingUserInput);
    setSaleUserQuery(saleUserInput);
    setConfirmStatusQuery(confirmStatusInput);
    setPage(1);
  };

  const handleClear = () => {
    setSearchInput('');
    setItemCodeInput('');
    setDateInput('');
    setConfirmDateInput('');
    setMarketingUserInput('');
    setSaleUserInput('');
    setConfirmStatusInput('');
    setSearchQuery('');
    setItemCodeQuery('');
    setDateQuery('');
    setConfirmDateQuery('');
    setMarketingUserQuery('');
    setSaleUserQuery('');
    setConfirmStatusQuery('');
    setPage(1);
  };

  if (isLoading && !data) return <CircularProgress />;
  if (error) return <Alert severity="error">{(error as any).message}</Alert>;

  const total = data?.total ?? 0;
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = total === 0 ? 0 : Math.min(page * limit, total);

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Typography variant="h4">Orders</Typography>
          <Chip
            label={`${total.toLocaleString()} orders`}
            size="small"
            color="primary"
            variant="outlined"
            sx={{ fontWeight: 600 }}
          />
        </Box>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Per Page</InputLabel>
          <Select
            value={limit}
            label="Per Page"
            onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
            }}
          >
            <MenuItem value={5}>5</MenuItem>
            <MenuItem value={10}>10</MenuItem>
            <MenuItem value={20}>20</MenuItem>
            <MenuItem value={50}>50</MenuItem>
          </Select>
        </FormControl>
      </Box>

      <Paper sx={{ p: 2, mb: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 'bold', ml: 1 }}>
              Created Date
            </Typography>
            <TextField
              size="small"
              type="date"
              value={dateInput}
              onChange={(e) => setDateInput(e.target.value)}
              sx={{
                width: 180,
                '& .MuiInputBase-root': { bgcolor: 'action.hover' },
                '& .MuiInputBase-input': { fontSize: '0.875rem' },
              }}
            />
          </Box>

          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Marketing user</InputLabel>
            <Select
              label="Marketing user"
              value={marketingUserInput}
              onChange={(e) => setMarketingUserInput(e.target.value as string)}
              sx={{ bgcolor: 'action.hover' }}
            >
              <MenuItem value="">
                <em>Any</em>
              </MenuItem>
              {(filterUsers?.marketing ?? []).map((u) => (
                <MenuItem key={u.id} value={String(u.id)}>
                  {u.display_name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel>Tình trạng xác nhận</InputLabel>
            <Select
              label="Tình trạng xác nhận"
              value={confirmStatusInput}
              onChange={(e) => setConfirmStatusInput(e.target.value as string)}
              sx={{ bgcolor: 'action.hover' }}
            >
              <MenuItem value="">
                <em>Tất cả</em>
              </MenuItem>
              <MenuItem value="confirmed">Đã xác nhận</MenuItem>
              <MenuItem value="unconfirmed">Chưa xác nhận</MenuItem>
            </Select>
          </FormControl>
        </Box>

        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 'bold', ml: 1 }}>
              Confirm Date
            </Typography>
            <TextField
              size="small"
              type="date"
              value={confirmDateInput}
              onChange={(e) => setConfirmDateInput(e.target.value)}
              sx={{
                width: 180,
                '& .MuiInputBase-root': { bgcolor: 'action.hover' },
                '& .MuiInputBase-input': { fontSize: '0.875rem' },
              }}
            />
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 'bold', ml: 1 }}>
              Order Number
            </Typography>
            <TextField
              size="small"
              placeholder="Ex: 123456..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                },
              }}
              sx={{
                width: 300,
                '& .MuiInputBase-root': { bgcolor: 'action.hover' },
              }}
            />
          </Box>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 'bold', ml: 1 }}>
              Mã SP
            </Typography>
            <TextField
              size="small"
              placeholder="Ex: ABC123..."
              value={itemCodeInput}
              onChange={(e) => setItemCodeInput(e.target.value)}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                },
              }}
              sx={{
                width: 220,
                '& .MuiInputBase-root': { bgcolor: 'action.hover' },
              }}
            />
          </Box>

          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Sale user</InputLabel>
            <Select
              label="Sale user"
              value={saleUserInput}
              onChange={(e) => setSaleUserInput(e.target.value as string)}
              sx={{ bgcolor: 'action.hover' }}
            >
              <MenuItem value="">
                <em>Any</em>
              </MenuItem>
              {(filterUsers?.sale ?? []).map((u) => (
                <MenuItem key={u.id} value={String(u.id)}>
                  {u.display_name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="contained"
            startIcon={<SearchIcon />}
            onClick={handleSearch}
            sx={{ height: 40 }}
          >
            Search
          </Button>
          <Button
            variant="outlined"
            startIcon={<ClearIcon />}
            onClick={handleClear}
            color="inherit"
            sx={{ height: 40 }}
          >
            Clear
          </Button>
        </Box>
      </Paper>

      <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
        <Table size="small" sx={{ minWidth: 1400 }}>
          <TableHead>
            <TableRow>
              <TableCell>Order Number</TableCell>
              <TableCell>Marketing</TableCell>
              <TableCell>Sale</TableCell>
              <TableCell align="right">SL</TableCell>
              <TableCell align="right">Total Amount</TableCell>
              <TableCell align="right">Total Price</TableCell>
              <TableCell>Xác nhận lúc</TableCell>
              <TableCell>Tạo lúc</TableCell>
              <TableCell>Update lúc</TableCell>
              <TableCell>Tình trạng đơn</TableCell>
              <TableCell>Note</TableCell>
              <TableCell>Mã SP</TableCell>
              <TableCell>Khách</TableCell>
              <TableCell align="right">Phí ship</TableCell>
              <TableCell>Tạo từ</TableCell>
              <TableCell>ID</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data?.data.map((order) => {
              const itemCodes = parseItemCodes(order.item_codes);
              const rowTooltip = itemCodesTooltip(itemCodes);

              return (
              <TableRow
                key={order.id}
                hover
                title={rowTooltip}
                sx={{ cursor: 'default' }}
              >
                <TableCell>{order.order_number}</TableCell>
                <TableCell>{order.marketing_user_display_name ?? '—'}</TableCell>
                <TableCell>{order.sale_user_display_name ?? '—'}</TableCell>
                <TableCell align="right">{order.total_quantity}</TableCell>
                <TableCell align="right">
                  {Number(order.total_amount).toLocaleString()}
                </TableCell>
                <TableCell align="right">
                  {Number(order.total_price).toLocaleString()}
                </TableCell>
                <TableCell>{fmtDateTime(order.confirm_time)}</TableCell>
                <TableCell>{fmtDateTime(order.created_time)}</TableCell>
                <TableCell>{fmtDateTime(order.updated_time)}</TableCell>
                <TableCell>{order.status_name ?? '—'}</TableCell>
                <TableCell>{order.operation_result_name ?? '—'}</TableCell>
                <TableCell>
                  <ItemCodesCell codes={itemCodes} />
                </TableCell>
                <TableCell>{order.customer_name ?? '—'}</TableCell>
                <TableCell align="right">
                  {Number(order.total_shipping_cost).toLocaleString()}
                </TableCell>
                <TableCell>{order.reason_create ?? '—'}</TableCell>
                <TableCell>{order.id}</TableCell>
              </TableRow>
              );
            })}
            {data?.data.length === 0 && (
              <TableRow>
                <TableCell colSpan={16} align="center">
                  No orders found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Box
        sx={{
          px: 2,
          py: 1.5,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 2,
        }}
      >
        <Typography variant="body2" color="text.secondary">
          {total === 0
            ? 'No orders found'
            : `Showing ${from.toLocaleString()}–${to.toLocaleString()} of ${total.toLocaleString()} orders`}
        </Typography>
        <Pagination
          count={Math.ceil(total / limit)}
          page={page}
          onChange={(_, v) => setPage(v)}
        />
      </Box>
    </Box>
  );
};

export default OrdersPage;
