import { useState } from 'react';
import {
    Alert,
    AppBar,
    Box,
    Button,
    Chip,
    Container,
    Toolbar,
    Typography,
} from '@mui/material';
import { useAuth } from '../context/AuthContext';

export default function DashboardPage() {
    const { profile, session, signOut } = useAuth();
    const [pingResult, setPingResult] = useState<string | null>(null);

    const testAdminEndpoint = async () => {
        setPingResult(null);
        const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/v1/admin/ping`, {
            headers: { Authorization: `Bearer ${session?.access_token}` },
        });
        const data = await res.json();
        setPingResult(res.ok ? data.message : `Error ${res.status}: ${data.detail}`);
    };

    return (
        <>
            <AppBar position="static">
                <Toolbar>
                    <Typography variant="h6" sx={{ flexGrow: 1 }}>
                        School Management System
                    </Typography>
                    <Chip
                        label={profile?.role.toUpperCase()}
                        color="secondary"
                        size="small"
                        sx={{ mr: 2 }}
                    />
                    <Button color="inherit" onClick={signOut}>
                        Logout
                    </Button>
                </Toolbar>
            </AppBar>

            <Container maxWidth="md" sx={{ mt: 5 }}>
                <Typography variant="h4" gutterBottom>
                    Welcome, {profile?.full_name}
                </Typography>
                <Typography color="text.secondary" gutterBottom>
                    Email: {profile?.email} | Role: {profile?.role}
                </Typography>

                <Box sx={{ mt: 3 }}>
                    <Button variant="outlined" onClick={testAdminEndpoint}>
                        Test Admin RBAC Endpoint
                    </Button>
                    {pingResult && (
                        <Alert severity="info" sx={{ mt: 2 }}>
                            {pingResult}
                        </Alert>
                    )}
                </Box>
            </Container>
        </>
    );
}