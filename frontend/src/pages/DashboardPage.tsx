import { useState, useEffect } from 'react';
import {
    Alert,
    AppBar,
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    CircularProgress,
    Container,
    Stack,
    Toolbar,
    Typography,
} from '@mui/material';
import { useAuth } from '../context/AuthContext';
import { useConfig } from '../context/configContextDef';
import { Link as RouterLink } from 'react-router-dom';
import { apiFetch } from '../lib/api';

interface DashboardMetrics {
    role: string;
    total_students?: number;
    total_teachers?: number;
    total_classes?: number;
    today_attendance_pct?: number | null;
    total_fees_collected?: number;
    attendance_pct?: number;
    overall_percentage?: number;
    overall_grade?: string;
    total_fees_paid?: number;
    total_notices: number;
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
    return (
        <Card variant="outlined">
            <CardContent>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                    {label}
                </Typography>
                <Typography variant="h4" sx={{ fontWeight: 600 }}>
                    {value}
                </Typography>
            </CardContent>
        </Card>
    );
}

export default function DashboardPage() {
    const { profile, session, signOut } = useAuth();
    const { organization, isModuleEnabled } = useConfig();
    const token = session?.access_token ?? '';
    const analyticsEnabled = isModuleEnabled('analytics');
    const currencySymbol = organization?.currency_symbol ?? '₹';

    const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
    const [loading, setLoading] = useState(analyticsEnabled);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!token || !analyticsEnabled) return;
        let cancelled = false;
        const loadMetrics = async () => {
            try {
                const data = await apiFetch<DashboardMetrics>('/api/v1/analytics/dashboard', token);
                if (!cancelled) {
                    setMetrics(data);
                    setError(null);
                }
            } catch (err: unknown) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : 'Failed to load analytics');
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };
        void loadMetrics();
        return () => {
            cancelled = true;
        };
    }, [token, analyticsEnabled]);

    const isStaff = profile?.role === 'admin' || profile?.role === 'teacher';

    return (
        <>
            <AppBar position="static" sx={{ bgcolor: organization?.primary_color || undefined }}>
                <Toolbar>
                    <Typography variant="h6" sx={{ flexGrow: 1 }}>
                        {organization?.name || 'School Management System'}
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

            <Container maxWidth="lg" sx={{ mt: 4, mb: 6 }}>
                <Typography variant="h4" gutterBottom>
                    Welcome, {profile?.full_name}
                </Typography>
                <Typography color="text.secondary" sx={{ mb: 3 }}>
                    {profile?.email}
                    {organization?.tagline ? ` · ${organization.tagline}` : ''}
                </Typography>

                {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

                {analyticsEnabled && (
                    loading ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, my: 4 }}>
                            <CircularProgress size={22} />
                            <Typography>Loading dashboard metrics...</Typography>
                        </Box>
                    ) : (
                        metrics && (
                            <Box
                                sx={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                                    gap: 2,
                                    mb: 4,
                                }}
                            >
                                {isStaff ? (
                                    <>
                                        {isModuleEnabled('users') && (
                                            <>
                                                <MetricCard label="Total Students" value={metrics.total_students ?? 0} />
                                                <MetricCard label="Total Teachers" value={metrics.total_teachers ?? 0} />
                                            </>
                                        )}
                                        {isModuleEnabled('academics') && (
                                            <MetricCard label="Classes" value={metrics.total_classes ?? 0} />
                                        )}
                                        {isModuleEnabled('attendance') && (
                                            <MetricCard
                                                label="Today's Attendance"
                                                value={
                                                    metrics.today_attendance_pct !== null &&
                                                        metrics.today_attendance_pct !== undefined
                                                        ? `${metrics.today_attendance_pct}%`
                                                        : 'Not marked'
                                                }
                                            />
                                        )}
                                        {profile?.role === 'admin' && isModuleEnabled('fees') && (
                                            <MetricCard
                                                label="Fees Collected"
                                                value={`${currencySymbol}${metrics.total_fees_collected ?? 0}`}
                                            />
                                        )}
                                        {isModuleEnabled('notices') && (
                                            <MetricCard label="Active Notices" value={metrics.total_notices} />
                                        )}
                                    </>
                                ) : (
                                    <>
                                        {isModuleEnabled('attendance') && (
                                            <MetricCard label="My Attendance" value={`${metrics.attendance_pct ?? 0}%`} />
                                        )}
                                        {isModuleEnabled('assessments') && (
                                            <MetricCard
                                                label="Overall Score"
                                                value={`${metrics.overall_percentage ?? 0}% (${metrics.overall_grade ?? 'N/A'})`}
                                            />
                                        )}
                                        {isModuleEnabled('fees') && (
                                            <MetricCard label="Fees Paid" value={`${currencySymbol}${metrics.total_fees_paid ?? 0}`} />
                                        )}
                                        {isModuleEnabled('notices') && (
                                            <MetricCard label="Active Notices" value={metrics.total_notices} />
                                        )}
                                    </>
                                )}
                            </Box>
                        )
                    )
                )}

                <Typography variant="h6" gutterBottom>
                    Quick Actions
                </Typography>
                <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap', gap: 1.5 }}>
                    {profile?.role === 'admin' && (
                        <>
                            {isModuleEnabled('academics') && (
                                <Button variant="contained" component={RouterLink} to="/academics">
                                    Manage Academics
                                </Button>
                            )}
                            {isModuleEnabled('users') && (
                                <Button variant="contained" component={RouterLink} to="/users">
                                    Users &amp; Enrollments
                                </Button>
                            )}
                            <Button variant="outlined" component={RouterLink} to="/settings">
                                Settings &amp; Campus Setup
                            </Button>
                        </>
                    )}
                    {profile && ['admin', 'teacher', 'student'].includes(profile.role) && (
                        <>
                            {isModuleEnabled('attendance') && (
                                <Button variant="contained" color="secondary" component={RouterLink} to="/attendance">
                                    Attendance
                                </Button>
                            )}
                            {isModuleEnabled('assessments') && (
                                <Button variant="contained" color="success" component={RouterLink} to="/assessments">
                                    Exams &amp; Assignments
                                </Button>
                            )}
                        </>
                    )}
                    {profile && ['admin', 'student'].includes(profile.role) && isModuleEnabled('fees') && (
                        <Button variant="contained" color="warning" component={RouterLink} to="/fees">
                            Fees
                        </Button>
                    )}
                    {isModuleEnabled('notices') && (
                        <Button variant="contained" color="info" component={RouterLink} to="/notices">
                            Notice Board
                        </Button>
                    )}
                </Stack>
            </Container>
        </>
    );
}
