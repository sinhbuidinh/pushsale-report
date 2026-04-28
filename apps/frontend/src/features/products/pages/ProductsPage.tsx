import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  CircularProgress,
  Alert,
  Box,
  Pagination,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  TextField,
  InputAdornment,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import EditIcon from '@mui/icons-material/Edit';
import apiClient from '../../../shared/api/apiClient';
import { useDebounce } from '../../../shared/hooks/useDebounce';

/**
 * One row per adaptation range, or a single row per product with no adaptations yet
 * (`adaption_id` null, prices from `product`, dates shown as "-" in the table).
 */
interface ProductListRow {
  adaption_id: number | null;
  product_id: number;
  item_code: string;
  item_name: string;
  start_date: string | null;
  end_date: string | null;
  cost_price: string | number;
  delivery_fee: string | number;
  weight_gram: number;
}

interface ProductsResponse {
  data: ProductListRow[];
  total: number;
  page: number;
  limit: number;
}

const ProductsPage = () => {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 500);

  const [editProduct, setEditProduct] = useState<ProductListRow | null>(null);
  const [editCostPrice, setEditCostPrice] = useState('');
  const [editDeliveryFee, setEditDeliveryFee] = useState('');
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');

  const { data, isLoading, error } = useQuery<ProductsResponse>({
    queryKey: ['products', page, limit, debouncedSearch],
    queryFn: async () => {
      const response = await apiClient.get(`/products?page=${page}&limit=${limit}&search=${debouncedSearch}`);
      if (response.data.status) {
        return response.data.data;
      }
      throw new Error(response.data.error || 'Failed to fetch products');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: {
      adaption_id: number;
      cost_price: number;
      delivery_fee: number;
    }) => {
      const response = await apiClient.patch(`/products/adaptions/${payload.adaption_id}`, {
        cost_price: payload.cost_price,
        delivery_fee: payload.delivery_fee,
      });
      if (response.data.status) {
        return response.data.data;
      }
      throw new Error(response.data.error || 'Failed to update product adaptation');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setEditProduct(null);
    },
  });

  const createAdaptionMutation = useMutation({
    mutationFn: async (payload: {
      product_id: number;
      start_date: string;
      end_date: string;
      cost_price: number;
      delivery_fee: number;
    }) => {
      const response = await apiClient.post(`/products/${payload.product_id}/adaptions`, {
        start_date: payload.start_date,
        end_date: payload.end_date,
        cost_price: payload.cost_price,
        delivery_fee: payload.delivery_fee,
      });
      if (response.data.status) {
        return response.data.data;
      }
      throw new Error(response.data.error || 'Failed to create adaptation');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setEditProduct(null);
    },
  });

  const openEdit = (row: ProductListRow) => {
    updateMutation.reset();
    createAdaptionMutation.reset();
    setEditCostPrice(String(row.cost_price ?? '0'));
    setEditDeliveryFee(String(row.delivery_fee ?? '0'));
    setEditStartDate('');
    setEditEndDate('');
    setEditProduct(row);
  };

  const handleSaveEdit = () => {
    if (!editProduct) return;
    const cost = parseFloat(editCostPrice);
    const fee = parseFloat(editDeliveryFee);
    if (!Number.isFinite(cost) || cost < 0 || !Number.isFinite(fee) || fee < 0) {
      return;
    }
    if (editProduct.adaption_id == null) {
      const start = editStartDate.trim();
      const end = editEndDate.trim();
      if (!start || !end || start > end) {
        return;
      }
      createAdaptionMutation.mutate({
        product_id: editProduct.product_id,
        start_date: start,
        end_date: end,
        cost_price: cost,
        delivery_fee: fee,
      });
      return;
    }
    updateMutation.mutate({
      adaption_id: editProduct.adaption_id,
      cost_price: cost,
      delivery_fee: fee,
    });
  };

  const formatRange = (start: string, end: string | null) =>
    end ? `${start} → ${end}` : `${start} → (open)`;

  const formatRangeCell = (row: ProductListRow) => {
    if (row.start_date == null) {
      return '-';
    }
    return formatRange(row.start_date, row.end_date);
  };

  const rowKey = (row: ProductListRow) =>
    row.adaption_id != null ? `a-${row.adaption_id}` : `p-${row.product_id}`;

  const savePending = updateMutation.isPending || createAdaptionMutation.isPending;
  const saveError =
    (updateMutation.error as Error | undefined)?.message ||
    (createAdaptionMutation.error as Error | undefined)?.message;

  if (isLoading && !data) return <CircularProgress />;
  if (error) return <Alert severity="error">{(error as Error).message}</Alert>;

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Products</Typography>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <TextField
            size="small"
            placeholder="Search item code or name..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              },
            }}
            sx={{ width: 300 }}
          />
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
      </Box>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Adaption ID</TableCell>
              <TableCell>Product ID</TableCell>
              <TableCell>Item Code</TableCell>
              <TableCell>Item Name</TableCell>
              <TableCell>Date range</TableCell>
              <TableCell align="right">Cost Price</TableCell>
              <TableCell align="right">Delivery Fee</TableCell>
              <TableCell align="right">Weight (g)</TableCell>
              <TableCell align="center" width={72}>
                Edit
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data?.data.map((row) => (
              <TableRow key={rowKey(row)}>
                <TableCell>{row.adaption_id ?? '-'}</TableCell>
                <TableCell>{row.product_id}</TableCell>
                <TableCell>{row.item_code}</TableCell>
                <TableCell>{row.item_name}</TableCell>
                <TableCell>{formatRangeCell(row)}</TableCell>
                <TableCell align="right">{Number(row.cost_price).toLocaleString()}</TableCell>
                <TableCell align="right">{Number(row.delivery_fee ?? 0).toLocaleString()}</TableCell>
                <TableCell align="right">{row.weight_gram}</TableCell>
                <TableCell align="center">
                  <IconButton
                    aria-label={
                      row.adaption_id != null
                        ? `Edit adaptation ${row.adaption_id}`
                        : `Edit product ${row.product_id}`
                    }
                    size="small"
                    onClick={() => openEdit(row)}
                  >
                    <EditIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
            {data?.data.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} align="center">
                  No products found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Box sx={{ p: 2, display: 'flex', justifyContent: 'center' }}>
        <Pagination
          count={Math.ceil((data?.total || 0) / limit)}
          page={page}
          onChange={(_, v) => setPage(v)}
        />
      </Box>

      <Dialog open={Boolean(editProduct)} onClose={() => setEditProduct(null)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editProduct?.adaption_id == null ? 'Add adaptation range' : 'Edit adaptation prices'}
        </DialogTitle>
        <DialogContent>
          {editProduct && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
              <Typography variant="body2" color="text.secondary">
                {editProduct.adaption_id != null ? (
                  <>Adaption ID: {editProduct.adaption_id} · </>
                ) : null}
                Product ID: {editProduct.product_id}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Item code: {editProduct.item_code}
              </Typography>
              {editProduct.adaption_id != null && editProduct.start_date != null ? (
                <Typography variant="body2" color="text.secondary">
                  Range: {formatRange(editProduct.start_date, editProduct.end_date)}
                </Typography>
              ) : null}
              <Typography variant="body2" sx={{ mb: 1 }}>
                {editProduct.item_name}
              </Typography>
              {editProduct.adaption_id == null ? (
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                  <TextField
                    label="Start date"
                    type="date"
                    required
                    value={editStartDate}
                    onChange={(e) => setEditStartDate(e.target.value)}
                    slotProps={{ inputLabel: { shrink: true } }}
                    fullWidth
                    sx={{ flex: '1 1 200px' }}
                  />
                  <TextField
                    label="End date"
                    type="date"
                    required
                    value={editEndDate}
                    onChange={(e) => setEditEndDate(e.target.value)}
                    slotProps={{ inputLabel: { shrink: true } }}
                    fullWidth
                    sx={{ flex: '1 1 200px' }}
                  />
                </Box>
              ) : null}
              {editProduct.adaption_id == null &&
              editStartDate &&
              editEndDate &&
              editStartDate > editEndDate ? (
                <Alert severity="warning">Start date must be on or before end date.</Alert>
              ) : null}
              <TextField
                label="Cost price"
                type="number"
                value={editCostPrice}
                onChange={(e) => setEditCostPrice(e.target.value)}
                slotProps={{ htmlInput: { min: 0, step: 'any' } }}
                fullWidth
              />
              <TextField
                label="Delivery fee"
                type="number"
                value={editDeliveryFee}
                onChange={(e) => setEditDeliveryFee(e.target.value)}
                slotProps={{ htmlInput: { min: 0, step: 'any' } }}
                fullWidth
              />
              {saveError ? <Alert severity="error">{saveError}</Alert> : null}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditProduct(null)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSaveEdit}
            disabled={
              savePending ||
              !editProduct ||
              !Number.isFinite(parseFloat(editCostPrice)) ||
              parseFloat(editCostPrice) < 0 ||
              !Number.isFinite(parseFloat(editDeliveryFee)) ||
              parseFloat(editDeliveryFee) < 0 ||
              (editProduct.adaption_id == null &&
                (!editStartDate.trim() ||
                  !editEndDate.trim() ||
                  editStartDate > editEndDate))
            }
          >
            {savePending ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ProductsPage;
