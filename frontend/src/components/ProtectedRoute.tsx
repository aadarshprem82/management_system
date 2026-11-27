import type { ReactNode } from 'react';
import { Link as RouterLink, Navigate } from 'react-router-dom';
import { Alert, Box, Button, CircularProgress, Container } from '@mui/material';
import { useAuth, type UserProfile } from '../context/AuthContext';
import { useConfig } from '../context/configContextDef';

interface ProtectedRouteProps {
    children: ReactNode;
    allowedRoles?: Array<UserProfile['role']>;
    moduleKey?: string;
}

export default function ProtectedRoute({
    children,
    allowedRoles,
    moduleKey,
}: ProtectedRouteProps) {
    const { session, profile, loading } = useAuth();
    const { isModuleEnabled } = useConfig();

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}>
                <CircularProgress />
            </Box>
        );
    }

    if (!session || !profile) {
        return <Navigate to="/login" replace />;
    }

    if (allowedRoles && !allowedRoles.includes(profile.role)) {
        return <Navigate to="/unauthorized" replace />;
    }

    if (moduleKey && !isModuleEnabled(moduleKey)) {
        return (
            <Container maxWidth="sm" sx={{ mt: 8 }}>
                <Alert severity="warning" sx={{ mb: 2 }}>
                    The <strong>{moduleKey}</strong> module is currently disabled for your organization.
                </Alert>
                <Button variant="contained" component={RouterLink} to="/dashboard">
                    Back to Dashboard
                </Button>
            </Container>
        );
    }

    return children;
}
