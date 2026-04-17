import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Typography, Table, TableBody, TableCell, 
  TableContainer, TableHead, TableRow, Paper, CircularProgress, 
  Alert, Box, Pagination, Select, MenuItem, FormControl, InputLabel,
  TextField, InputAdornment
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import { Button } from '@mui/material';
import apiClient from '../../../shared/api/apiClient';

interface Order {
  id: number;
  order_number: string;
  customer_id: number;
  total_quantity: number;
  total_amount: string;
  total_price: string;
  total_shipping_cost: string;
  reason_create: string;
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

const OrdersPage = () => {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [searchInput, setSearchInput] = useState('');
  const [dateInput, setDateInput] = useState('');
  
  // These are the actual values used for the query
  const [searchQuery, setSearchQuery] = useState('');
  const [dateQuery, setDateQuery] = useState('');

  const { data, isLoading, error } = useQuery<OrdersResponse>({
    queryKey: ['orders', page, limit, searchQuery, dateQuery],
    queryFn: async () => {
      const response = await apiClient.get(`/orders?page=${page}&limit=${limit}&search=${searchQuery}&date=${dateQuery}`);
      if (response.data.status) {
        return response.data.data;
      }
      throw new Error(response.data.error || 'Failed to fetch orders');
    },
  });

  const handleSearch = () => {
    setSearchQuery(searchInput);
    setDateQuery(dateInput);
    setPage(1);
  };

  const handleClear = () => {
    setSearchInput('');
    setDateInput('');
    setSearchQuery('');
    setDateQuery('');
    setPage(1);
  };

  if (isLoading && !data) return <CircularProgress />;
  if (error) return <Alert severity="error">{(error as any).message}</Alert>;

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4">Orders</Typography>
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

      <Paper sx={{ p: 2, mb: 3, display: 'flex', gap: 2, alignItems: 'flex-end', flexWrap: 'wrap' }}>
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
              '& .MuiInputBase-root': {
                bgcolor: 'action.hover',
              },
              '& .MuiInputBase-input': {
                fontSize: '0.875rem',
              }
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
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSearch();
            }}
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
              '& .MuiInputBase-root': {
                bgcolor: 'action.hover',
              }
            }}
          />
        </Box>

        <Box sx={{ display: 'flex', gap: 1, pb: 0.2 }}>
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

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>ID</TableCell>
              <TableCell>Order Number</TableCell>
              <TableCell align="right">Quantity</TableCell>
              <TableCell align="right">Total Amount</TableCell>
              <TableCell align="right">Shipping</TableCell>
              <TableCell align="right">Total Price</TableCell>
              <TableCell>Reason</TableCell>
              <TableCell>Confirm Time</TableCell>
              <TableCell>Created At</TableCell>
              <TableCell>Updated At</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data?.data.map((order) => (
              <TableRow key={order.id}>
                <TableCell>{order.id}</TableCell>
                <TableCell>{order.order_number}</TableCell>
                <TableCell align="right">{order.total_quantity}</TableCell>
                <TableCell align="right">{Number(order.total_amount).toLocaleString()}</TableCell>
                <TableCell align="right">{Number(order.total_shipping_cost).toLocaleString()}</TableCell>
                <TableCell align="right">{Number(order.total_price).toLocaleString()}</TableCell>
                <TableCell>{order.reason_create}</TableCell>
                <TableCell>{order.confirm_time}</TableCell>
                <TableCell>{order.created_time}</TableCell>
                <TableCell>{order.updated_time}</TableCell>
              </TableRow>
            ))}
            {data?.data.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} align="center">No orders found.</TableCell>
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
    </Box>
  );
};

export default OrdersPage;
