import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
    AppBar,
    Box,
    Button,
    Chip,
    MenuItem,
    Select,
    Toolbar,
    Typography,
    type SelectChangeEvent,
} from '@mui/material';
import { useAuth, type UserRole } from '../context/AuthContext';
import { useConfig } from '../context/configContextDef';
import MfaDialog from './iam/MfaDialog';

interface AppHeaderProps {
    title?: string;
    showBackToDashboard?: boolean;
}

export default function AppHeader({ title, showBackToDashboard = false }: AppHeaderProps) {
    const {
        profile,
        activeRole,
        activeCampusId,
        mfaLevel,
        needsMfaChallenge,
        switchRoleContext,
        signOut,
    } = useAuth();
    const { organization } = useConfig();

    const [mfaOpen, setMfaOpen] = useState(false);

    const roleContexts = profile?.roles && profile.roles.length > 0
        ? profile.roles
        : activeRole
            ? [{ role: activeRole, campus_id: activeCampusId, is_primary: true }]
            : [];

    const currentContextValue = activeRole
        ? `${activeRole}::${activeCampusId ?? ''}`
        : '';

    const handleContextChange = async (e: SelectChangeEvent<string>) => {
        const [nextRole, nextCampus] = e.target.value.split('::');
        if (!nextRole) return;
        await switchRoleContext(nextRole as UserRole, nextCampus || null);
    };

    const isAdminLike = profile && ['super_admin', 'admin', 'principal'].includes(profile.role);

    return (
        <>
            <AppBar position="static" sx={{ bgcolor: organization?.primary_color || undefined }}>
                <Toolbar sx={{ gap: 1.5, flexWrap: 'wrap' }}>
                    <Typography variant="h6" sx={{ flexGrow: 1 }}>
                        {title || organization?.name || 'School Management System'}
                    </Typography>

                    {roleContexts.length > 1 ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.85)' }}>
                                Role Context:
                            </Typography>
                            <Select
                                size="small"
                                value={currentContextValue}
                                onChange={(e) => {
                                    void handleContextChange(e);
                                }}
                                sx={{
                                    color: '#fff',
                                    '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.45)' },
                                    '.MuiSvgIcon-root': { color: '#fff' },
                                    minWidth: 165,
                                    height: 32,
                                }}
                            >
                                {roleContexts.map((rc, idx) => {
                                    const val = `${rc.role}::${rc.campus_id ?? ''}`;
                                    const label = rc.campus_name
                                        ? `${rc.role.toUpperCase()} (${rc.campus_name})`
                                        : rc.role.toUpperCase();
                                    return (
                                        <MenuItem key={`${val}-${idx}`} value={val}>
                                            {label}
                                        </MenuItem>
                                    );
                                })}
                            </Select>
                        </Box>
                    ) : (
                        activeRole && (
                            <Chip
                                label={activeRole.toUpperCase()}
                                color="secondary"
                                size="small"
                            />
                        )
                    )}

                    <Chip
                        label={mfaLevel === 'aal2' ? 'MFA: AAL2' : needsMfaChallenge ? 'MFA Required (AAL1)' : 'MFA: AAL1'}
                        color={mfaLevel === 'aal2' ? 'success' : needsMfaChallenge ? 'warning' : 'default'}
                        size="small"
                        onClick={() => setMfaOpen(true)}
                        sx={{ cursor: 'pointer', color: '#fff', borderColor: 'rgba(255,255,255,0.5)' }}
                        variant={mfaLevel === 'aal2' ? 'filled' : 'outlined'}
                    />

                    {isAdminLike && (
                        <Button color="inherit" size="small" component={RouterLink} to="/iam">
                            IAM &amp; Approvals
                        </Button>
                    )}

                    {showBackToDashboard && (
                        <Button color="inherit" size="small" component={RouterLink} to="/dashboard">
                            Back to Dashboard
                        </Button>
                    )}

                    <Button color="inherit" size="small" onClick={() => void signOut()}>
                        Logout
                    </Button>
                </Toolbar>
            </AppBar>

            <MfaDialog
                open={mfaOpen}
                onClose={() => setMfaOpen(false)}
                required={needsMfaChallenge}
            />
        </>
    );
}
