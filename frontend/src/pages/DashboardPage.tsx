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
import { Link as RouterLink } from 'react-router-dom';

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
                <Box sx={{ mt: 3 }}>
                    {profile?.role === 'admin' && (
                        <Button variant="contained" component={RouterLink} to="/academics" sx={{ mr: 2 }}>
                            Manage Academics
                        </Button>
                    )}
                    {profile?.role === 'admin' && (
                        <Button variant="contained" component={RouterLink} to="/users" sx={{ mr: 2 }}>
                            Manage Users &amp; Enrollments
                        </Button>
                    )}
                    {profile && ['admin', 'teacher', 'student'].includes(profile.role) && (
                        <Button variant="contained" color="secondary" component={RouterLink} to="/attendance" sx={{ mr: 2 }}>
                            Attendance
                        </Button>
                    )}
                    {profile && ['admin', 'teacher', 'student'].includes(profile.role) && (
                        <Button variant="contained" color="success" component={RouterLink} to="/assessments" sx={{ mr: 2 }}>
                            Exams &amp; Assignments
                        </Button>
                    )}
                </Box>
            </Container>
        </>
    );
}