import React from 'react';
import { 
  Box, Drawer, AppBar, Toolbar, List, Typography, 
  ListItem, ListItemButton, ListItemIcon, ListItemText, 
  CssBaseline, Button, Container 
} from '@mui/material';
import { 
  Dashboard as DashboardIcon, 
  People as PeopleIcon, 
  Inventory as InventoryIcon, 
  Receipt as OrdersIcon,
  Campaign as CampaignIcon,
  Logout as LogoutIcon 
} from '@mui/icons-material';
import { Link, Navigate, useNavigate } from 'react-router-dom';
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

  if (!user?.type || typeof user.type !== 'string') {
    return <Navigate to={`/${PANEL_PREFIX}`} replace />;
  }

  const userType = user.type;

  const handleLogout = () => {
    clearAuthStorage();
    navigate(`/${PANEL_PREFIX}`);
  };

  const menuItems = [
    { text: 'Dashboard', icon: <DashboardIcon />, path: `/${PANEL_PREFIX}/dashboard`, roles: ['admin', 'marketing', 'sale'] },
    { text: 'Users', icon: <PeopleIcon />, path: `/${PANEL_PREFIX}/users`, roles: ['admin', 'marketing', 'sale'] },
    { text: 'Products', icon: <InventoryIcon />, path: `/${PANEL_PREFIX}/products`, roles: ['admin'] },
    { text: 'Orders', icon: <OrdersIcon />, path: `/${PANEL_PREFIX}/orders`, roles: ['admin'] },
    { text: 'Facebook Ads', icon: <CampaignIcon />, path: `/${PANEL_PREFIX}/facebook-ads`, roles: ['admin'] },
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
            {menuItems.filter((item) => item.roles.includes(userType)).map((item) => (
              <ListItem key={item.text} disablePadding>
                <ListItemButton component={Link} to={item.path}>
                  <ListItemIcon>{item.icon}</ListItemIcon>
                  <ListItemText primary={item.text} />
                </ListItemButton>
              </ListItem>
            ))}
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
