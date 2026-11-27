import { useCallback, useEffect, useState, type SyntheticEvent } from 'react';
import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    Checkbox,
    Chip,
    Container,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControlLabel,
    MenuItem,
    Paper,
    Stack,
    Tab,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Tabs,
    TextField,
    Typography,
} from '@mui/material';
import { useAuth, type UserRole } from '../context/AuthContext';
import { apiFetch } from '../lib/api';
import { formatDate, formatDateTime } from '../lib/date';
import DateInput from '../components/DateInput';
import AppHeader from '../components/AppHeader';

const ALL_ROLES: UserRole[] = [
    'super_admin',
    'admin',
    'principal',
    'admissions_officer',
    'accountant',
    'librarian',
    'transport_manager',
    'nurse',
    'auditor',
    'teacher',
    'student',
    'parent',
];

interface CampusItem {
    id: string;
    name: string;
    code: string;
}

interface UserRoleRow {
    id: string;
    role: UserRole;
    campus_id: string | null;
    effective_from: string;
    effective_to: string | null;
    is_primary: boolean;
    campus?: { id: string; name: string; code: string } | null;
}

interface IamUser {
    id: string;
    full_name: string;
    email: string;
    role: UserRole;
    status: 'invited' | 'active' | 'suspended' | 'archived';
    status_reason: string | null;
    status_changed_at: string | null;
    mfa_enforced: boolean;
    user_roles: UserRoleRow[];
}

interface ApprovalRequestItem {
    id: string;
    action_type: string;
    resource_type: string;
    resource_id: string | null;
    reason: string;
    status: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'executed';
    requested_by: string;
    requested_role: string | null;
    reviewed_by: string | null;
    reviewed_role: string | null;
    review_notes: string | null;
    created_at: string;
}

export default function IamPage() {
    const { session, profile } = useAuth();
    const token = session?.access_token ?? '';

    const [tab, setTab] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const [users, setUsers] = useState<IamUser[]>([]);
    const [campuses, setCampuses] = useState<CampusItem[]>([]);
    const [approvals, setApprovals] = useState<ApprovalRequestItem[]>([]);

    // Invite form
    const [inviteName, setInviteName] = useState('');
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState<UserRole>('teacher');
    const [inviteCampusId, setInviteCampusId] = useState('');
    const [invitePassword, setInvitePassword] = useState('');
    const [inviteMfaEnforced, setInviteMfaEnforced] = useState(false);

    // Lifecycle dialog (suspend / archive / reinstate)
    const [lifecycleTarget, setLifecycleTarget] = useState<{
        user: IamUser;
        action: 'suspend' | 'archive' | 'reinstate';
    } | null>(null);
    const [lifecycleReason, setLifecycleReason] = useState('');

    // Multi-role assignment dialog
    const [roleTargetUser, setRoleTargetUser] = useState<IamUser | null>(null);
    const [newRole, setNewRole] = useState<UserRole>('parent');
    const [newRoleCampusId, setNewRoleCampusId] = useState('');
    const [newRoleFrom, setNewRoleFrom] = useState('');
    const [newRoleTo, setNewRoleTo] = useState('');
    const [newRolePrimary, setNewRolePrimary] = useState(false);

    // Approval request form
    const [appActionType, setAppActionType] = useState('fee_payment_void');
    const [appResourceType, setAppResourceType] = useState('fee_payment');
    const [appResourceId, setAppResourceId] = useState('');
    const [appReason, setAppReason] = useState('');

    // Decision dialog
    const [decisionTarget, setDecisionTarget] = useState<{
        item: ApprovalRequestItem;
        decision: 'approved' | 'rejected';
    } | null>(null);
    const [reviewNotes, setReviewNotes] = useState('');

    const fetchIamData = useCallback(async (authToken: string) => {
        const [u, c, a] = await Promise.all([
            apiFetch<IamUser[]>('/api/v1/iam/users', authToken),
            apiFetch<CampusItem[]>('/api/v1/config/campuses', authToken),
            apiFetch<ApprovalRequestItem[]>('/api/v1/iam/approvals', authToken),
        ]);
        return { u, c, a };
    }, []);

    const reloadAll = useCallback(async () => {
        if (!token) return;
        try {
            const data = await fetchIamData(token);
            setUsers(data.u);
            setCampuses(data.c);
            setApprovals(data.a);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to load IAM data');
        }
    }, [token, fetchIamData]);

    useEffect(() => {
        if (!token) return;
        let cancelled = false;
        const init = async () => {
            try {
                const data = await fetchIamData(token);
                if (cancelled) return;
                setUsers(data.u);
                setCampuses(data.c);
                setApprovals(data.a);
            } catch (err: unknown) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : 'Failed to load IAM data');
                }
            }
        };
        void init();
        return () => {
            cancelled = true;
        };
    }, [token, fetchIamData]);

    const handleInviteUser = async (e: SyntheticEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);
        try {
            await apiFetch('/api/v1/iam/users/invite', token, {
                method: 'POST',
                body: JSON.stringify({
                    full_name: inviteName,
                    email: inviteEmail,
                    role: inviteRole,
                    campus_id: inviteCampusId || null,
                    temp_password: invitePassword || null,
                    mfa_enforced: inviteMfaEnforced,
                }),
            });
            setInviteName('');
            setInviteEmail('');
            setInvitePassword('');
            setInviteMfaEnforced(false);
            setSuccess('User invited/provisioned successfully.');
            void reloadAll();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to invite user');
        }
    };

    const handleConfirmLifecycle = async () => {
        if (!lifecycleTarget || lifecycleReason.trim().length < 3) return;
        setError(null);
        setSuccess(null);
        try {
            await apiFetch(
                `/api/v1/iam/users/${lifecycleTarget.user.id}/${lifecycleTarget.action}`,
                token,
                {
                    method: 'POST',
                    body: JSON.stringify({ reason: lifecycleReason.trim() }),
                }
            );
            setSuccess(
                `User ${lifecycleTarget.user.full_name} ${lifecycleTarget.action}d.`
            );
            setLifecycleTarget(null);
            setLifecycleReason('');
            void reloadAll();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Lifecycle action failed');
        }
    };

    const handleAssignRole = async () => {
        if (!roleTargetUser) return;
        setError(null);
        setSuccess(null);
        try {
            await apiFetch(`/api/v1/iam/users/${roleTargetUser.id}/roles`, token, {
                method: 'POST',
                body: JSON.stringify({
                    role: newRole,
                    campus_id: newRoleCampusId || null,
                    effective_from: newRoleFrom || null,
                    effective_to: newRoleTo || null,
                    is_primary: newRolePrimary,
                }),
            });
            setSuccess(`Assigned role '${newRole}' to ${roleTargetUser.full_name}.`);
            setRoleTargetUser(null);
            setNewRoleFrom('');
            setNewRoleTo('');
            setNewRolePrimary(false);
            void reloadAll();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to assign role');
        }
    };

    const handleRevokeRole = async (userId: string, assignmentId: string) => {
        setError(null);
        try {
            await apiFetch(`/api/v1/iam/users/${userId}/roles/${assignmentId}`, token, {
                method: 'DELETE',
            });
            setSuccess('Role assignment deactivated.');
            void reloadAll();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to revoke role');
        }
    };

    const handleCreateApproval = async (e: SyntheticEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);
        try {
            await apiFetch('/api/v1/iam/approvals', token, {
                method: 'POST',
                body: JSON.stringify({
                    action_type: appActionType,
                    resource_type: appResourceType,
                    resource_id: appResourceId || null,
                    reason: appReason,
                }),
            });
            setAppResourceId('');
            setAppReason('');
            setSuccess('Approval request submitted for second-person review.');
            void reloadAll();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to submit approval request');
        }
    };

    const handleDecideApproval = async () => {
        if (!decisionTarget) return;
        setError(null);
        setSuccess(null);
        try {
            await apiFetch(`/api/v1/iam/approvals/${decisionTarget.item.id}/decision`, token, {
                method: 'POST',
                body: JSON.stringify({
                    decision: decisionTarget.decision,
                    review_notes: reviewNotes || null,
                }),
            });
            setSuccess(`Approval request ${decisionTarget.decision}.`);
            setDecisionTarget(null);
            setReviewNotes('');
            void reloadAll();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Decision failed');
        }
    };

    const handleExecuteApproval = async (requestId: string) => {
        setError(null);
        setSuccess(null);
        try {
            await apiFetch(`/api/v1/iam/approvals/${requestId}/execute`, token, {
                method: 'POST',
                headers: { 'X-Approval-Request-Id': requestId },
            });
            setSuccess('Dual-control approval executed.');
            void reloadAll();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Execution failed');
        }
    };

    const statusColor = (status: IamUser['status']) => {
        if (status === 'active') return 'success';
        if (status === 'invited') return 'info';
        if (status === 'suspended') return 'error';
        return 'default';
    };

    return (
        <>
            <AppHeader title="IAM, MFA &amp; Segregation of Duties" showBackToDashboard />

            <Container maxWidth="lg" sx={{ mt: 4, mb: 6 }}>
                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

                <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
                    <Tab label="Users, Multi-Role & Lifecycle" />
                    <Tab label="Dual-Control Approvals (Maker-Checker)" />
                </Tabs>

                {tab === 0 && (
                    <Stack spacing={3}>
                        <Card>
                            <CardContent>
                                <Typography variant="h6" gutterBottom>
                                    Invite / Provision User
                                </Typography>
                                <Box
                                    component="form"
                                    onSubmit={handleInviteUser}
                                    sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}
                                >
                                    <TextField
                                        label="Full Name"
                                        value={inviteName}
                                        onChange={(e) => setInviteName(e.target.value)}
                                        required
                                    />
                                    <TextField
                                        label="Email"
                                        type="email"
                                        value={inviteEmail}
                                        onChange={(e) => setInviteEmail(e.target.value)}
                                        required
                                    />
                                    <TextField
                                        select
                                        label="Primary Role"
                                        value={inviteRole}
                                        onChange={(e) => setInviteRole(e.target.value as UserRole)}
                                        sx={{ minWidth: 180 }}
                                    >
                                        {ALL_ROLES.map((r) => (
                                            <MenuItem key={r} value={r}>{r}</MenuItem>
                                        ))}
                                    </TextField>
                                    <TextField
                                        select
                                        label="Campus (Optional)"
                                        value={inviteCampusId}
                                        onChange={(e) => setInviteCampusId(e.target.value)}
                                        sx={{ minWidth: 160 }}
                                    >
                                        <MenuItem value="">All Campuses</MenuItem>
                                        {campuses.map((c) => (
                                            <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
                                        ))}
                                    </TextField>
                                    <TextField
                                        label="Temp Password (or blank to email invite)"
                                        type="password"
                                        value={invitePassword}
                                        onChange={(e) => setInvitePassword(e.target.value)}
                                    />
                                    <FormControlLabel
                                        control={
                                            <Checkbox
                                                checked={inviteMfaEnforced}
                                                onChange={(e) => setInviteMfaEnforced(e.target.checked)}
                                            />
                                        }
                                        label="Enforce MFA"
                                    />
                                    <Button type="submit" variant="contained">
                                        Invite User
                                    </Button>
                                </Box>
                            </CardContent>
                        </Card>

                        <TableContainer component={Paper}>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>User</TableCell>
                                        <TableCell>Status</TableCell>
                                        <TableCell>Assigned Role Contexts</TableCell>
                                        <TableCell align="right">Lifecycle &amp; Roles</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {users.map((u) => (
                                        <TableRow key={u.id}>
                                            <TableCell>
                                                <Typography variant="subtitle2">{u.full_name}</Typography>
                                                <Typography variant="caption" color="text.secondary">{u.email}</Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Chip label={u.status.toUpperCase()} color={statusColor(u.status)} size="small" />
                                                {u.status_reason && (
                                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                                        Reason: {u.status_reason}
                                                    </Typography>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
                                                    {(u.user_roles && u.user_roles.length > 0
                                                        ? u.user_roles
                                                        : [{ id: 'primary', role: u.role, campus: null, is_primary: true, effective_from: '', effective_to: null, campus_id: null }]
                                                    ).map((ur) => (
                                                        <Chip
                                                            key={ur.id}
                                                            size="small"
                                                            color={ur.is_primary ? 'primary' : 'default'}
                                                            label={`${ur.role}${ur.campus?.code ? ` @ ${ur.campus.code}` : ''}`}
                                                            onDelete={
                                                                ur.id !== 'primary' && !ur.is_primary
                                                                    ? () => void handleRevokeRole(u.id, ur.id)
                                                                    : undefined
                                                            }
                                                        />
                                                    ))}
                                                </Stack>
                                            </TableCell>
                                            <TableCell align="right">
                                                <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
                                                    <Button
                                                        size="small"
                                                        variant="outlined"
                                                        onClick={() => setRoleTargetUser(u)}
                                                    >
                                                        + Role
                                                    </Button>
                                                    {u.status === 'suspended' || u.status === 'archived' ? (
                                                        <Button
                                                            size="small"
                                                            color="success"
                                                            variant="outlined"
                                                            onClick={() => {
                                                                setLifecycleTarget({ user: u, action: 'reinstate' });
                                                                setLifecycleReason('');
                                                            }}
                                                        >
                                                            Reinstate
                                                        </Button>
                                                    ) : (
                                                        <>
                                                            <Button
                                                                size="small"
                                                                color="warning"
                                                                variant="outlined"
                                                                disabled={u.id === profile?.id}
                                                                onClick={() => {
                                                                    setLifecycleTarget({ user: u, action: 'suspend' });
                                                                    setLifecycleReason('');
                                                                }}
                                                            >
                                                                Suspend
                                                            </Button>
                                                            <Button
                                                                size="small"
                                                                color="error"
                                                                disabled={u.id === profile?.id}
                                                                onClick={() => {
                                                                    setLifecycleTarget({ user: u, action: 'archive' });
                                                                    setLifecycleReason('');
                                                                }}
                                                            >
                                                                Archive
                                                            </Button>
                                                        </>
                                                    )}
                                                </Stack>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Stack>
                )}

                {tab === 1 && (
                    <Stack spacing={3}>
                        <Card>
                            <CardContent>
                                <Typography variant="h6" gutterBottom>
                                    Submit High-Risk Approval Request
                                </Typography>
                                <Box
                                    component="form"
                                    onSubmit={handleCreateApproval}
                                    sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}
                                >
                                    <TextField
                                        select
                                        label="Action Type"
                                        value={appActionType}
                                        onChange={(e) => setAppActionType(e.target.value)}
                                        sx={{ minWidth: 200 }}
                                    >
                                        <MenuItem value="fee_payment_void">Fee Payment Void</MenuItem>
                                        <MenuItem value="fee_waiver">Fee Waiver</MenuItem>
                                        <MenuItem value="user_role_grant">Privileged Role Grant</MenuItem>
                                        <MenuItem value="mark_override">Exam Mark Override</MenuItem>
                                    </TextField>
                                    <TextField
                                        label="Resource Type"
                                        value={appResourceType}
                                        onChange={(e) => setAppResourceType(e.target.value)}
                                        required
                                    />
                                    <TextField
                                        label="Resource ID"
                                        value={appResourceId}
                                        onChange={(e) => setAppResourceId(e.target.value)}
                                    />
                                    <TextField
                                        label="Justification / Reason"
                                        value={appReason}
                                        onChange={(e) => setAppReason(e.target.value)}
                                        required
                                        sx={{ minWidth: 260 }}
                                    />
                                    <Button type="submit" variant="contained">
                                        Submit Request
                                    </Button>
                                </Box>
                            </CardContent>
                        </Card>

                        <TableContainer component={Paper}>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Action</TableCell>
                                        <TableCell>Resource</TableCell>
                                        <TableCell>Reason</TableCell>
                                        <TableCell>Status</TableCell>
                                        <TableCell>Created</TableCell>
                                        <TableCell align="right">Review / Execute</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {approvals.map((a) => {
                                        const isMaker = a.requested_by === profile?.id;
                                        return (
                                            <TableRow key={a.id}>
                                                <TableCell>
                                                    <strong>{a.action_type}</strong>
                                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                                        By role: {a.requested_role || '—'}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell>
                                                    {a.resource_type} {a.resource_id ? `(${a.resource_id})` : ''}
                                                </TableCell>
                                                <TableCell>{a.reason}</TableCell>
                                                <TableCell>
                                                    <Chip
                                                        label={a.status.toUpperCase()}
                                                        size="small"
                                                        color={
                                                            a.status === 'approved' || a.status === 'executed'
                                                                ? 'success'
                                                                : a.status === 'rejected'
                                                                    ? 'error'
                                                                    : 'warning'
                                                        }
                                                    />
                                                </TableCell>
                                                <TableCell>{formatDateTime(a.created_at)}</TableCell>
                                                <TableCell align="right">
                                                    {a.status === 'pending' && (
                                                        isMaker ? (
                                                            <Chip label="SoD: Self-approval blocked" size="small" variant="outlined" />
                                                        ) : (
                                                            <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
                                                                <Button
                                                                    size="small"
                                                                    color="success"
                                                                    variant="outlined"
                                                                    onClick={() => {
                                                                        setDecisionTarget({ item: a, decision: 'approved' });
                                                                        setReviewNotes('');
                                                                    }}
                                                                >
                                                                    Approve
                                                                </Button>
                                                                <Button
                                                                    size="small"
                                                                    color="error"
                                                                    variant="outlined"
                                                                    onClick={() => {
                                                                        setDecisionTarget({ item: a, decision: 'rejected' });
                                                                        setReviewNotes('');
                                                                    }}
                                                                >
                                                                    Reject
                                                                </Button>
                                                            </Stack>
                                                        )
                                                    )}
                                                    {a.status === 'approved' && (
                                                        <Button
                                                            size="small"
                                                            variant="contained"
                                                            onClick={() => void handleExecuteApproval(a.id)}
                                                        >
                                                            Execute (Dual Control)
                                                        </Button>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Stack>
                )}
            </Container>

            {/* Mandatory Reason Dialog for Suspend / Archive / Reinstate */}
            <Dialog open={Boolean(lifecycleTarget)} onClose={() => setLifecycleTarget(null)} maxWidth="sm" fullWidth>
                <DialogTitle>
                    {lifecycleTarget?.action === 'suspend' && 'Suspend User Account'}
                    {lifecycleTarget?.action === 'archive' && 'Archive User Account'}
                    {lifecycleTarget?.action === 'reinstate' && 'Reinstate User Account'}
                </DialogTitle>
                <DialogContent dividers>
                    <Stack spacing={2}>
                        <Alert severity={lifecycleTarget?.action === 'reinstate' ? 'info' : 'warning'}>
                            {lifecycleTarget?.action === 'reinstate'
                                ? `Reinstating ${lifecycleTarget.user.full_name} will restore active login access.`
                                : `${lifecycleTarget?.action === 'suspend' ? 'Suspending' : 'Archiving'} ${lifecycleTarget?.user.full_name} immediately revokes all active Supabase sessions and blocks API access.`}
                        </Alert>
                        <TextField
                            label="Mandatory Reason (min 3 characters)"
                            value={lifecycleReason}
                            onChange={(e) => setLifecycleReason(e.target.value)}
                            multiline
                            minRows={2}
                            required
                            fullWidth
                            helperText="Recorded in the audit trail."
                        />
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setLifecycleTarget(null)}>Cancel</Button>
                    <Button
                        variant="contained"
                        color={lifecycleTarget?.action === 'reinstate' ? 'success' : 'error'}
                        disabled={lifecycleReason.trim().length < 3}
                        onClick={() => void handleConfirmLifecycle()}
                    >
                        Confirm {lifecycleTarget?.action}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Multi-Role Assignment Dialog */}
            <Dialog open={Boolean(roleTargetUser)} onClose={() => setRoleTargetUser(null)} maxWidth="sm" fullWidth>
                <DialogTitle>Assign Additional Role — {roleTargetUser?.full_name}</DialogTitle>
                <DialogContent dividers>
                    <Stack spacing={2} sx={{ mt: 0.5 }}>
                        <TextField
                            select
                            label="Role"
                            value={newRole}
                            onChange={(e) => setNewRole(e.target.value as UserRole)}
                            fullWidth
                        >
                            {ALL_ROLES.map((r) => (
                                <MenuItem key={r} value={r}>{r}</MenuItem>
                            ))}
                        </TextField>
                        <TextField
                            select
                            label="Campus Scope (Optional)"
                            value={newRoleCampusId}
                            onChange={(e) => setNewRoleCampusId(e.target.value)}
                            fullWidth
                        >
                            <MenuItem value="">All Campuses</MenuItem>
                            {campuses.map((c) => (
                                <MenuItem key={c.id} value={c.id}>{c.name} ({c.code})</MenuItem>
                            ))}
                        </TextField>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                            <DateInput label="Effective From" value={newRoleFrom} onChange={setNewRoleFrom} />
                            <DateInput label="Effective To (Optional)" value={newRoleTo} onChange={setNewRoleTo} />
                        </Stack>
                        <FormControlLabel
                            control={
                                <Checkbox
                                    checked={newRolePrimary}
                                    onChange={(e) => setNewRolePrimary(e.target.checked)}
                                />
                            }
                            label="Make this the user's primary default role"
                        />
                        {roleTargetUser?.user_roles && roleTargetUser.user_roles.length > 0 && (
                            <Typography variant="caption" color="text.secondary">
                                Existing roles:{' '}
                                {roleTargetUser.user_roles
                                    .map((ur) => `${ur.role} (from ${formatDate(ur.effective_from)})`)
                                    .join(', ')}
                            </Typography>
                        )}
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setRoleTargetUser(null)}>Cancel</Button>
                    <Button variant="contained" onClick={() => void handleAssignRole()}>
                        Assign Role
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Approval Decision Dialog */}
            <Dialog open={Boolean(decisionTarget)} onClose={() => setDecisionTarget(null)} maxWidth="sm" fullWidth>
                <DialogTitle>
                    {decisionTarget?.decision === 'approved' ? 'Approve Request' : 'Reject Request'}
                </DialogTitle>
                <DialogContent dividers>
                    <Stack spacing={2}>
                        <Typography variant="body2">
                            Action: <strong>{decisionTarget?.item.action_type}</strong> — {decisionTarget?.item.reason}
                        </Typography>
                        <TextField
                            label="Reviewer Notes (Optional)"
                            value={reviewNotes}
                            onChange={(e) => setReviewNotes(e.target.value)}
                            multiline
                            minRows={2}
                            fullWidth
                        />
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDecisionTarget(null)}>Cancel</Button>
                    <Button
                        variant="contained"
                        color={decisionTarget?.decision === 'approved' ? 'success' : 'error'}
                        onClick={() => void handleDecideApproval()}
                    >
                        Confirm {decisionTarget?.decision}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}
