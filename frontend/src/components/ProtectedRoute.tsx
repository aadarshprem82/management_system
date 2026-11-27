import { useState, type ReactNode } from 'react';
import { Link as RouterLink, Navigate } from 'react-router-dom';
import { Alert, Box, Button, CircularProgress, Container, Stack } from '@mui/material';
import { useAuth, type UserRole } from '../context/AuthContext';
import { useConfig } from '../context/configContextDef';
import ConsentModal from './iam/ConsentModal';
import MfaDialog from './iam/MfaDialog';

interface ProtectedRouteProps {
    children: ReactNode;
    allowedRoles?: UserRole[];
    moduleKey?: string;
    requireMfa?: boolean;
}

export default function ProtectedRoute({
    children,
    allowedRoles,
    moduleKey,
    requireMfa = false,
}: ProtectedRouteProps) {
    const { session, profile, loading, needsMfaChallenge, mfaLevel } = useAuth();
    const { isModuleEnabled } = useConfig();
    const [mfaOpen, setMfaOpen] = useState(false);

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

    const effectiveAllowed = new Set<UserRole>(allowedRoles || []);
    if (effectiveAllowed.has('admin')) {
        effectiveAllowed.add('super_admin');
    }

    if (allowedRoles && !effectiveAllowed.has(profile.role)) {
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

    const mfaBlocked = (requireMfa || (profile.mfa_required && moduleKey === 'fees')) && mfaLevel !== 'aal2';

    if (mfaBlocked) {
        return (
            <>
                <ConsentModal />
                <Container maxWidth="sm" sx={{ mt: 8 }}>
                    <Alert severity="warning" sx={{ mb: 2 }}>
                        Multi-Factor Authentication (<strong>AAL2</strong>) is required for your role (
                        <strong>{profile.role}</strong>) to access this area.
                    </Alert>
                    <Stack direction="row" spacing={2}>
                        <Button variant="contained" onClick={() => setMfaOpen(true)}>
                            Verify / Enroll MFA
                        </Button>
                        <Button variant="outlined" component={RouterLink} to="/dashboard">
                            Back to Dashboard
                        </Button>
                    </Stack>
                </Container>
                <MfaDialog open={mfaOpen} onClose={() => setMfaOpen(false)} required={needsMfaChallenge} />
            </>
        );
    }

    return (
        <>
            <ConsentModal />
            {children}
        </>
    );
}
