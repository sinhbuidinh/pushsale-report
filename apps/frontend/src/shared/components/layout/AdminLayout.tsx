import React from 'react';
import { 
  Box, Drawer, AppBar, Toolbar, List, Typography, 
  ListItem, ListItemButton, ListItemIcon, ListItemText, 
  CssBaseline, Button, Container 
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { 
  Dashboard as DashboardIcon, 
  People as PeopleIcon, 
  Inventory as InventoryIcon, 
  Receipt as OrdersIcon,
  Campaign as CampaignIcon,
  Insights as InsightsIcon,
  Tune as TuneIcon,
  Logout as LogoutIcon 
} from '@mui/icons-material';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  clearAuthStorage,
  getStoredUser,
  PANEL_PREFIX,
} from '../../auth/authStorage';

const drawerWidth = 240;

interface AdminLayoutProps {
  children: React.ReactNode;
}

const AdminLayout: React.FC<AdminLayoutProps> = ({ children }) => {
  const user = getStoredUser();
  const navigate = useNavigate();
  const location = useLocation();

  if (!user?.type || typeof user.type !== 'string') {
    return <Navigate to={`/${PANEL_PREFIX}`} replace />;
  }

  const userType = user.type;

  const handleLogout = () => {
    clearAuthStorage();
    navigate(`/${PANEL_PREFIX}`);
  };

  const menuItems = [
    { id: 'marketing-summary', text: 'Báo cáo bán hàng', icon: <InsightsIcon />, path: `/${PANEL_PREFIX}/marketing-summary`, roles: ['admin', 'marketing'] },
    { id: 'profit-segments', text: 'Chỉnh màu phân khúc lợi nhuận', icon: <TuneIcon />, path: `/${PANEL_PREFIX}/profit-segments`, roles: ['admin'] },
    { id: 'dashboard', text: 'Lấy đơn từ PushSale', icon: <DashboardIcon />, path: `/${PANEL_PREFIX}/dashboard`, roles: ['admin', 'sale'] },
    { id: 'facebook-ads', text: 'Lấy ads cost từ facebook', icon: <CampaignIcon />, path: `/${PANEL_PREFIX}/facebook-ads`, roles: ['admin'] },
    { id: 'products', text: 'Sản phẩm', icon: <InventoryIcon />, path: `/${PANEL_PREFIX}/products`, roles: ['admin'] },
    { id: 'orders', text: 'Đơn hàng', icon: <OrdersIcon />, path: `/${PANEL_PREFIX}/orders`, roles: ['admin'] },
    { id: 'users', text: 'Người dùng', icon: <PeopleIcon />, path: `/${PANEL_PREFIX}/users`, roles: ['admin', 'marketing', 'sale'] },
  ];

  return (
    <Box sx={{ display: 'flex', position: 'relative', zIndex: 10 }}>
      <CssBaseline />
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar sx={{ justifyContent: 'space-between' }}>
          <Typography variant="h6" noWrap component="div">
            HungViet Ads Control Panel
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Typography variant="body2" sx={{ mr: 2 }}>
              {user.display_name ?? user.username ?? 'User'} ({userType})
            </Typography>
            <Button color="inherit" onClick={handleLogout} startIcon={<LogoutIcon />}>Logout</Button>
          </Box>
        </Toolbar>
      </AppBar>
      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: { width: drawerWidth, boxSizing: 'border-box' },
        }}
      >
        <Toolbar />
        <Box sx={{ overflow: 'auto' }}>
          <List>
            {menuItems.filter((item) => item.roles.includes(userType)).map((item) => {
              const isSelected =
                location.pathname === item.path ||
                location.pathname.startsWith(`${item.path}/`);
              return (
                <ListItem key={item.id} disablePadding>
                  <ListItemButton
                    component={Link}
                    to={item.path}
                    selected={isSelected}
                    sx={(theme) => ({
                      '&.Mui-selected': {
                        backgroundColor: alpha(theme.palette.primary.main, 0.12),
                        borderLeft: `4px solid ${theme.palette.primary.main}`,
                        pl: 'calc(16px - 4px)',
                        '& .MuiListItemIcon-root': {
                          color: theme.palette.primary.main,
                        },
                        '& .MuiListItemText-primary': {
                          color: theme.palette.primary.main,
                          fontWeight: 600,
                        },
                        '&:hover': {
                          backgroundColor: alpha(theme.palette.primary.main, 0.18),
                        },
                      },
                    })}
                  >
                    <ListItemIcon>{item.icon}</ListItemIcon>
                    <ListItemText primary={item.text} />
                  </ListItemButton>
                </ListItem>
              );
            })}
          </List>
        </Box>
      </Drawer>
      <Box component="main" sx={{ flexGrow: 1, p: 3, mt: 8 }}>
        <Container maxWidth="lg">
          {children}
        </Container>
      </Box>
    </Box>
  );
};

export default AdminLayout;
