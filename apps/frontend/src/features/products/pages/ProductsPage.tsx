import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Typography, Table, TableBody, TableCell, 
  TableContainer, TableHead, TableRow, Paper, CircularProgress, 
  Alert, Box, Pagination, Select, MenuItem, FormControl, InputLabel,
  TextField, InputAdornment
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import apiClient from '../../../shared/api/apiClient';
import { useDebounce } from '../../../shared/hooks/useDebounce';

interface Product {
  id: number;
  item_code: string;
  item_name: string;
  cost_price: string;
  weight_gram: number;
}

interface ProductsResponse {
  data: Product[];
  total: number;
  page: number;
  limit: number;
}

const ProductsPage = () => {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 500);

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

  if (isLoading && !data) return <CircularProgress />;
  if (error) return <Alert severity="error">{(error as any).message}</Alert>;

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
              <TableCell>ID</TableCell>
              <TableCell>Item Code</TableCell>
              <TableCell>Item Name</TableCell>
              <TableCell align="right">Cost Price</TableCell>
              <TableCell align="right">Weight (g)</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data?.data.map((product) => (
              <TableRow key={product.id}>
                <TableCell>{product.id}</TableCell>
                <TableCell>{product.item_code}</TableCell>
                <TableCell>{product.item_name}</TableCell>
                <TableCell align="right">{Number(product.cost_price).toLocaleString()}</TableCell>
                <TableCell align="right">{product.weight_gram}</TableCell>
              </TableRow>
            ))}
            {data?.data.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} align="center">No products found.</TableCell>
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

export default ProductsPage;
