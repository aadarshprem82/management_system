import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { useAuth, type UserProfile } from '../context/AuthContext';

interface ProtectedRouteProps {
    children: ReactNode;
    allowedRoles?: Array<UserProfile['role']>;
}

export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
    const { session, profile, loading } = useAuth();

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

    return children;
}