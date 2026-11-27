import { useCallback, useEffect, useState, type SyntheticEvent } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
    Alert,
    AppBar,
    Box,
    Button,
    Card,
    CardContent,
    Checkbox,
    Chip,
    Container,
    FormControlLabel,
    LinearProgress,
    MenuItem,
    Paper,
    Stack,
    Switch,
    Tab,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Tabs,
    TextField,
    Toolbar,
    Typography,
} from '@mui/material';
import { useAuth } from '../context/AuthContext';
import { useConfig } from '../context/configContextDef';
import { apiFetch } from '../lib/api';
import DateInput from '../components/DateInput';
import { formatDate } from '../lib/date';
import YearCloneWizardDialog from '../components/settings/YearCloneWizardDialog';

interface AcademicYear {
    id: string;
    name: string;
    start_date: string;
    end_date: string;
    is_current: boolean;
}

interface Campus {
    id: string;
    name: string;
    code: string;
    address: string | null;
    city: string | null;
    timezone: string | null;
    is_primary: boolean;
    is_active: boolean;
}

interface Room {
    id: string;
    campus_id: string | null;
    name: string;
    code: string;
    building: string | null;
    floor: string | null;
    room_type: string;
    capacity: number;
    exam_capacity: number | null;
    is_active: boolean;
    campus?: { id: string; name: string; code: string } | null;
}

interface RoomCapacityResult {
    room_id: string;
    room_name: string;
    room_code: string;
    mode: string;
    max_capacity: number;
    requested_count: number;
    fits: boolean;
    remaining_capacity: number;
    overflow: number;
    utilization_pct: number;
    warning: string | null;
}

interface TermItem {
    id: string;
    academic_year_id: string;
    campus_id: string | null;
    name: string;
    code: string | null;
    start_date: string;
    end_date: string;
    sequence_order: number;
    effective_from: string;
    effective_to: string | null;
    academic_year?: { id: string; name: string } | null;
    campus?: { id: string; name: string; code: string } | null;
}

interface CalendarConflict {
    severity: 'warning' | 'error';
    category: string;
    message: string;
    entity_id: string | null;
}

interface CalendarDay {
    id: string;
    campus_id: string | null;
    academic_year_id: string | null;
    term_id: string | null;
    day_date: string;
    day_type: 'holiday' | 'closure' | 'special_schedule' | 'exam_day' | 'event';
    title: string;
    description: string | null;
    is_working_day: boolean;
    campus?: { id: string; name: string; code: string } | null;
    term?: { id: string; name: string } | null;
}

interface StreamItem {
    id: string;
    name: string;
    code: string;
    description: string | null;
    campus?: { id: string; name: string } | null;
}

interface HouseItem {
    id: string;
    name: string;
    code: string;
    color: string;
    motto: string | null;
    campus?: { id: string; name: string } | null;
}

interface NumberingSequence {
    id: string;
    campus_id: string | null;
    academic_year_id: string | null;
    sequence_type: string;
    prefix: string;
    suffix: string;
    separator: string;
    padding: number;
    next_number: number;
    reset_policy: 'never' | 'yearly' | 'monthly';
    effective_from: string;
    effective_to: string | null;
    is_active: boolean;
    campus?: { id: string; name: string } | null;
    academic_year?: { id: string; name: string } | null;
}

interface FeatureFlagsPayload {
    modules: Record<string, boolean>;
    available_modules: Array<{ module_key: string; description: string }>;
    flags: Array<{
        id: string;
        module_key: string;
        campus_id: string | null;
        is_enabled: boolean;
        effective_from: string;
        effective_to: string | null;
        version: number;
        campus?: { id: string; name: string } | null;
    }>;
}

const COMMON_TIMEZONES = [
    'UTC',
    'Asia/Kolkata',
    'America/New_York',
    'America/Chicago',
    'America/Los_Angeles',
    'Europe/London',
    'Europe/Berlin',
    'Asia/Dubai',
    'Asia/Singapore',
    'Australia/Sydney',
];

export default function SettingsPage() {
    const { session } = useAuth();
    const token = session?.access_token ?? '';
    const { organization, refreshConfig } = useConfig();

    const [tab, setTab] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [cloneOpen, setCloneOpen] = useState(false);

    // Loaded data
    const [years, setYears] = useState<AcademicYear[]>([]);
    const [campuses, setCampuses] = useState<Campus[]>([]);
    const [rooms, setRooms] = useState<Room[]>([]);
    const [terms, setTerms] = useState<TermItem[]>([]);
    const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
    const [streams, setStreams] = useState<StreamItem[]>([]);
    const [houses, setHouses] = useState<HouseItem[]>([]);
    const [sequences, setSequences] = useState<NumberingSequence[]>([]);
    const [flagsData, setFlagsData] = useState<FeatureFlagsPayload | null>(null);

    // Tab 0: Organization form
    const [orgName, setOrgName] = useState('');
    const [orgTagline, setOrgTagline] = useState('');
    const [orgAddress, setOrgAddress] = useState('');
    const [orgEmail, setOrgEmail] = useState('');
    const [orgPhone, setOrgPhone] = useState('');
    const [orgWebsite, setOrgWebsite] = useState('');
    const [orgLogoUrl, setOrgLogoUrl] = useState('');
    const [orgPrimaryColor, setOrgPrimaryColor] = useState('#1976d2');
    const [orgSecondaryColor, setOrgSecondaryColor] = useState('#9c27b0');
    const [orgTimezone, setOrgTimezone] = useState('UTC');
    const [orgCurrencyCode, setOrgCurrencyCode] = useState('INR');
    const [orgCurrencySymbol, setOrgCurrencySymbol] = useState('₹');

    // Tab 1: Campus & Room forms
    const [campusName, setCampusName] = useState('');
    const [campusCode, setCampusCode] = useState('');
    const [campusCity, setCampusCity] = useState('');
    const [campusTimezone, setCampusTimezone] = useState('');
    const [campusPrimary, setCampusPrimary] = useState(false);

    const [roomCampusId, setRoomCampusId] = useState('');
    const [roomName, setRoomName] = useState('');
    const [roomCode, setRoomCode] = useState('');
    const [roomType, setRoomType] = useState('classroom');
    const [roomBuilding, setRoomBuilding] = useState('');
    const [roomFloor, setRoomFloor] = useState('');
    const [roomCapacity, setRoomCapacity] = useState('40');
    const [roomExamCapacity, setRoomExamCapacity] = useState('30');

    // Room capacity check tool
    const [checkRoomId, setCheckRoomId] = useState('');
    const [checkCount, setCheckCount] = useState('35');
    const [checkMode, setCheckMode] = useState<'regular' | 'exam'>('regular');
    const [capacityResult, setCapacityResult] = useState<RoomCapacityResult | null>(null);

    // Tab 2: Term & Calendar forms
    const [termYearId, setTermYearId] = useState('');
    const [termCampusId, setTermCampusId] = useState('');
    const [termName, setTermName] = useState('');
    const [termCode, setTermCode] = useState('');
    const [termStart, setTermStart] = useState('');
    const [termEnd, setTermEnd] = useState('');
    const [termOrder, setTermOrder] = useState('1');

    const [calDate, setCalDate] = useState('');
    const [calType, setCalType] = useState<CalendarDay['day_type']>('holiday');
    const [calTitle, setCalTitle] = useState('');
    const [calCampusId, setCalCampusId] = useState('');
    const [calYearId, setCalYearId] = useState('');
    const [calTermId, setCalTermId] = useState('');
    const [calWorkingDay, setCalWorkingDay] = useState(false);
    const [calDescription, setCalDescription] = useState('');
    const [calendarConflicts, setCalendarConflicts] = useState<CalendarConflict[]>([]);

    // Tab 3: Streams & Houses
    const [streamName, setStreamName] = useState('');
    const [streamCode, setStreamCode] = useState('');
    const [streamCampusId, setStreamCampusId] = useState('');
    const [streamDesc, setStreamDesc] = useState('');

    const [houseName, setHouseName] = useState('');
    const [houseCode, setHouseCode] = useState('');
    const [houseColor, setHouseColor] = useState('#d32f2f');
    const [houseCampusId, setHouseCampusId] = useState('');
    const [houseMotto, setHouseMotto] = useState('');

    // Tab 4: Numbering Sequences
    const [seqType, setSeqType] = useState('admission');
    const [seqPrefix, setSeqPrefix] = useState('ADM');
    const [seqSeparator, setSeqSeparator] = useState('-');
    const [seqPadding, setSeqPadding] = useState('5');
    const [seqNext, setSeqNext] = useState('1');
    const [seqResetPolicy, setSeqResetPolicy] = useState<'never' | 'yearly' | 'monthly'>('yearly');
    const [seqCampusId, setSeqCampusId] = useState('');
    const [seqYearId, setSeqYearId] = useState('');
    const [testSeqType, setTestSeqType] = useState('admission');
    const [generatedSample, setGeneratedSample] = useState<string | null>(null);

    // Tab 5: Feature Flags
    const [flagCampusId, setFlagCampusId] = useState('');
    const [flagEffectiveFrom, setFlagEffectiveFrom] = useState('');

    const fetchAllData = useCallback(async (authToken: string) => {
        const [
            org,
            yr,
            cmp,
            rm,
            tm,
            cal,
            st,
            hs,
            sq,
            fl,
        ] = await Promise.all([
            apiFetch<{
                name: string;
                tagline: string | null;
                address: string | null;
                email: string | null;
                phone: string | null;
                website: string | null;
                logo_url: string | null;
                primary_color: string;
                secondary_color: string;
                timezone: string;
                currency_code: string;
                currency_symbol: string;
            }>('/api/v1/config/organization', authToken),
            apiFetch<AcademicYear[]>('/api/v1/academics/academic-years', authToken),
            apiFetch<Campus[]>('/api/v1/config/campuses', authToken),
            apiFetch<Room[]>('/api/v1/config/rooms', authToken),
            apiFetch<TermItem[]>('/api/v1/config/terms', authToken),
            apiFetch<CalendarDay[]>('/api/v1/config/calendar-days', authToken),
            apiFetch<StreamItem[]>('/api/v1/config/streams', authToken),
            apiFetch<HouseItem[]>('/api/v1/config/houses', authToken),
            apiFetch<NumberingSequence[]>('/api/v1/config/sequences', authToken),
            apiFetch<FeatureFlagsPayload>('/api/v1/config/feature-flags', authToken),
        ]);
        return { org, yr, cmp, rm, tm, cal, st, hs, sq, fl };
    }, []);

    const reloadAll = useCallback(async () => {
        if (!token) return;
        try {
            const data = await fetchAllData(token);
            setOrgName(data.org.name || '');
            setOrgTagline(data.org.tagline || '');
            setOrgAddress(data.org.address || '');
            setOrgEmail(data.org.email || '');
            setOrgPhone(data.org.phone || '');
            setOrgWebsite(data.org.website || '');
            setOrgLogoUrl(data.org.logo_url || '');
            setOrgPrimaryColor(data.org.primary_color || '#1976d2');
            setOrgSecondaryColor(data.org.secondary_color || '#9c27b0');
            setOrgTimezone(data.org.timezone || 'UTC');
            setOrgCurrencyCode(data.org.currency_code || 'INR');
            setOrgCurrencySymbol(data.org.currency_symbol || '₹');
            setYears(data.yr);
            setCampuses(data.cmp);
            setRooms(data.rm);
            setTerms(data.tm);
            setCalendarDays(data.cal);
            setStreams(data.st);
            setHouses(data.hs);
            setSequences(data.sq);
            setFlagsData(data.fl);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to load configuration');
        }
    }, [token, fetchAllData]);

    useEffect(() => {
        if (!token) return;
        let cancelled = false;
        const init = async () => {
            try {
                const data = await fetchAllData(token);
                if (cancelled) return;
                setOrgName(data.org.name || '');
                setOrgTagline(data.org.tagline || '');
                setOrgAddress(data.org.address || '');
                setOrgEmail(data.org.email || '');
                setOrgPhone(data.org.phone || '');
                setOrgWebsite(data.org.website || '');
                setOrgLogoUrl(data.org.logo_url || '');
                setOrgPrimaryColor(data.org.primary_color || '#1976d2');
                setOrgSecondaryColor(data.org.secondary_color || '#9c27b0');
                setOrgTimezone(data.org.timezone || 'UTC');
                setOrgCurrencyCode(data.org.currency_code || 'INR');
                setOrgCurrencySymbol(data.org.currency_symbol || '₹');
                setYears(data.yr);
                setCampuses(data.cmp);
                setRooms(data.rm);
                setTerms(data.tm);
                setCalendarDays(data.cal);
                setStreams(data.st);
                setHouses(data.hs);
                setSequences(data.sq);
                setFlagsData(data.fl);
            } catch (err: unknown) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : 'Failed to load configuration');
                }
            }
        };
        void init();
        return () => {
            cancelled = true;
        };
    }, [token, fetchAllData]);

    // Live calendar conflict checker whenever date/type/scope changes
    useEffect(() => {
        if (!token || !calDate) return;
        let cancelled = false;
        const checkConflicts = async () => {
            try {
                const params = new URLSearchParams({
                    day_date: calDate,
                    day_type: calType,
                    is_working_day: String(calWorkingDay),
                });
                if (calCampusId) params.set('campus_id', calCampusId);
                if (calYearId) params.set('academic_year_id', calYearId);
                if (calTermId) params.set('term_id', calTermId);

                const res = await apiFetch<{ conflicts: CalendarConflict[] }>(
                    `/api/v1/config/calendar-days/conflicts?${params.toString()}`,
                    token
                );
                if (!cancelled) {
                    setCalendarConflicts(res.conflicts || []);
                }
            } catch {
                // Ignore transient preview errors
            }
        };
        void checkConflicts();
        return () => {
            cancelled = true;
        };
    }, [token, calDate, calType, calWorkingDay, calCampusId, calYearId, calTermId]);

    const handleSaveOrganization = async (e: SyntheticEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);
        try {
            await apiFetch('/api/v1/config/organization', token, {
                method: 'PUT',
                body: JSON.stringify({
                    name: orgName,
                    tagline: orgTagline || null,
                    address: orgAddress || null,
                    email: orgEmail || null,
                    phone: orgPhone || null,
                    website: orgWebsite || null,
                    logo_url: orgLogoUrl || null,
                    primary_color: orgPrimaryColor,
                    secondary_color: orgSecondaryColor,
                    timezone: orgTimezone,
                    currency_code: orgCurrencyCode,
                    currency_symbol: orgCurrencySymbol,
                }),
            });
            setSuccess('Organization branding, timezone & currency settings saved.');
            await Promise.all([reloadAll(), refreshConfig()]);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to save organization settings');
        }
    };

    const handleCreateCampus = async (e: SyntheticEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);
        try {
            await apiFetch('/api/v1/config/campuses', token, {
                method: 'POST',
                body: JSON.stringify({
                    name: campusName,
                    code: campusCode,
                    city: campusCity || null,
                    timezone: campusTimezone || null,
                    is_primary: campusPrimary,
                }),
            });
            setCampusName('');
            setCampusCode('');
            setCampusCity('');
            setCampusTimezone('');
            setCampusPrimary(false);
            setSuccess('Campus added.');
            reloadAll();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to create campus');
        }
    };

    const handleCreateRoom = async (e: SyntheticEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);
        try {
            await apiFetch('/api/v1/config/rooms', token, {
                method: 'POST',
                body: JSON.stringify({
                    campus_id: roomCampusId || null,
                    name: roomName,
                    code: roomCode,
                    room_type: roomType,
                    building: roomBuilding || null,
                    floor: roomFloor || null,
                    capacity: Number(roomCapacity),
                    exam_capacity: roomExamCapacity ? Number(roomExamCapacity) : null,
                }),
            });
            setRoomName('');
            setRoomCode('');
            setRoomBuilding('');
            setRoomFloor('');
            setSuccess('Room added.');
            reloadAll();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to create room');
        }
    };

    const handleCheckRoomCapacity = async (e: SyntheticEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError(null);
        try {
            const res = await apiFetch<RoomCapacityResult>('/api/v1/config/rooms/capacity-check', token, {
                method: 'POST',
                body: JSON.stringify({
                    room_id: checkRoomId,
                    requested_count: Number(checkCount),
                    mode: checkMode,
                }),
            });
            setCapacityResult(res);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Capacity check failed');
        }
    };

    const handleCreateTerm = async (e: SyntheticEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);
        try {
            await apiFetch('/api/v1/config/terms', token, {
                method: 'POST',
                body: JSON.stringify({
                    academic_year_id: termYearId,
                    campus_id: termCampusId || null,
                    name: termName,
                    code: termCode || null,
                    start_date: termStart,
                    end_date: termEnd,
                    sequence_order: Number(termOrder),
                }),
            });
            setTermName('');
            setTermCode('');
            setTermStart('');
            setTermEnd('');
            setSuccess('Term created.');
            reloadAll();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to create term');
        }
    };

    const handleCreateCalendarDay = async (e: SyntheticEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);
        try {
            const res = await apiFetch<{ conflicts?: CalendarConflict[] }>('/api/v1/config/calendar-days', token, {
                method: 'POST',
                body: JSON.stringify({
                    day_date: calDate,
                    day_type: calType,
                    title: calTitle,
                    campus_id: calCampusId || null,
                    academic_year_id: calYearId || null,
                    term_id: calTermId || null,
                    is_working_day: calWorkingDay,
                    description: calDescription || null,
                }),
            });
            setCalTitle('');
            setCalDescription('');
            const count = res.conflicts?.length || 0;
            setSuccess(
                count > 0
                    ? `Calendar entry saved with ${count} conflict warning(s).`
                    : 'Calendar entry saved.'
            );
            reloadAll();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to create calendar day');
        }
    };

    const handleCreateStream = async (e: SyntheticEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);
        try {
            await apiFetch('/api/v1/config/streams', token, {
                method: 'POST',
                body: JSON.stringify({
                    name: streamName,
                    code: streamCode,
                    campus_id: streamCampusId || null,
                    description: streamDesc || null,
                }),
            });
            setStreamName('');
            setStreamCode('');
            setStreamDesc('');
            setSuccess('Stream added.');
            reloadAll();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to add stream');
        }
    };

    const handleCreateHouse = async (e: SyntheticEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);
        try {
            await apiFetch('/api/v1/config/houses', token, {
                method: 'POST',
                body: JSON.stringify({
                    name: houseName,
                    code: houseCode,
                    color: houseColor,
                    campus_id: houseCampusId || null,
                    motto: houseMotto || null,
                }),
            });
            setHouseName('');
            setHouseCode('');
            setHouseMotto('');
            setSuccess('House added.');
            reloadAll();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to add house');
        }
    };

    const handleCreateSequence = async (e: SyntheticEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);
        try {
            await apiFetch('/api/v1/config/sequences', token, {
                method: 'POST',
                body: JSON.stringify({
                    sequence_type: seqType,
                    prefix: seqPrefix,
                    separator: seqSeparator,
                    padding: Number(seqPadding),
                    next_number: Number(seqNext),
                    reset_policy: seqResetPolicy,
                    campus_id: seqCampusId || null,
                    academic_year_id: seqYearId || null,
                }),
            });
            setSuccess('Numbering sequence configured.');
            reloadAll();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to create sequence');
        }
    };

    const handleGenerateTestSequence = async () => {
        setError(null);
        try {
            const res = await apiFetch<{ formatted_number: string }>('/api/v1/config/sequences/next', token, {
                method: 'POST',
                body: JSON.stringify({
                    sequence_type: testSeqType,
                    campus_id: seqCampusId || null,
                    academic_year_id: seqYearId || null,
                }),
            });
            setGeneratedSample(res.formatted_number);
            reloadAll();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to generate sequence number');
        }
    };

    const handleToggleFlag = async (moduleKey: string, nextEnabled: boolean) => {
        setError(null);
        setSuccess(null);
        try {
            await apiFetch(`/api/v1/config/feature-flags/${moduleKey}`, token, {
                method: 'PUT',
                body: JSON.stringify({
                    is_enabled: nextEnabled,
                    campus_id: flagCampusId || null,
                    effective_from: flagEffectiveFrom || null,
                }),
            });
            setSuccess(`Module '${moduleKey}' ${nextEnabled ? 'enabled' : 'disabled'}.`);
            await Promise.all([reloadAll(), refreshConfig(flagCampusId || undefined)]);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to update feature flag');
        }
    };

    const handleFlagCampusChange = async (nextCampus: string) => {
        setFlagCampusId(nextCampus);
        try {
            const path = nextCampus
                ? `/api/v1/config/feature-flags?campus_id=${encodeURIComponent(nextCampus)}`
                : '/api/v1/config/feature-flags';
            const updated = await apiFetch<FeatureFlagsPayload>(path, token);
            setFlagsData(updated);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to filter feature flags');
        }
    };

    const handleDeleteItem = async (endpoint: string, label: string) => {
        setError(null);
        try {
            await apiFetch(endpoint, token, { method: 'DELETE' });
            setSuccess(`${label} removed.`);
            reloadAll();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : `Failed to remove ${label}`);
        }
    };

    return (
        <>
            <AppBar position="static" sx={{ bgcolor: organization?.primary_color || undefined }}>
                <Toolbar>
                    <Typography variant="h6" sx={{ flexGrow: 1 }}>
                        Settings &amp; Campus Setup
                    </Typography>
                    <Button color="inherit" onClick={() => setCloneOpen(true)} sx={{ mr: 1 }}>
                        Clone Academic Year
                    </Button>
                    <Button color="inherit" component={RouterLink} to="/dashboard">
                        Back to Dashboard
                    </Button>
                </Toolbar>
            </AppBar>

            <Container maxWidth="lg" sx={{ mt: 4, mb: 6 }}>
                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

                <Tabs
                    value={tab}
                    onChange={(_, v) => setTab(v)}
                    variant="scrollable"
                    scrollButtons="auto"
                    sx={{ mb: 3 }}
                >
                    <Tab label="Organization & Branding" />
                    <Tab label="Campuses & Rooms" />
                    <Tab label="Terms & Calendar" />
                    <Tab label="Streams & Houses" />
                    <Tab label="Numbering Sequences" />
                    <Tab label="Feature Flags" />
                </Tabs>

                {tab === 0 && (
                    <Card>
                        <CardContent>
                            <Typography variant="h6" gutterBottom>
                                Organization Branding, Timezone &amp; Currency
                            </Typography>
                            <Box component="form" onSubmit={handleSaveOrganization}>
                                <Stack spacing={2.5}>
                                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                                        <TextField
                                            label="Organization Name"
                                            value={orgName}
                                            onChange={(e) => setOrgName(e.target.value)}
                                            required
                                            fullWidth
                                        />
                                        <TextField
                                            label="Tagline"
                                            value={orgTagline}
                                            onChange={(e) => setOrgTagline(e.target.value)}
                                            fullWidth
                                        />
                                    </Stack>
                                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                                        <TextField
                                            label="Contact Email"
                                            value={orgEmail}
                                            onChange={(e) => setOrgEmail(e.target.value)}
                                            fullWidth
                                        />
                                        <TextField
                                            label="Contact Phone"
                                            value={orgPhone}
                                            onChange={(e) => setOrgPhone(e.target.value)}
                                            fullWidth
                                        />
                                        <TextField
                                            label="Website"
                                            value={orgWebsite}
                                            onChange={(e) => setOrgWebsite(e.target.value)}
                                            fullWidth
                                        />
                                    </Stack>
                                    <TextField
                                        label="Headquarters Address"
                                        value={orgAddress}
                                        onChange={(e) => setOrgAddress(e.target.value)}
                                        fullWidth
                                    />
                                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                                        <TextField
                                            select
                                            label="Timezone"
                                            value={COMMON_TIMEZONES.includes(orgTimezone) ? orgTimezone : 'UTC'}
                                            onChange={(e) => setOrgTimezone(e.target.value)}
                                            fullWidth
                                        >
                                            {COMMON_TIMEZONES.map((tz) => (
                                                <MenuItem key={tz} value={tz}>{tz}</MenuItem>
                                            ))}
                                        </TextField>
                                        <TextField
                                            label="Currency Code (ISO)"
                                            value={orgCurrencyCode}
                                            onChange={(e) => setOrgCurrencyCode(e.target.value.toUpperCase())}
                                            slotProps={{ htmlInput: { maxLength: 3 } }}
                                            required
                                            sx={{ minWidth: 160 }}
                                        />
                                        <TextField
                                            label="Currency Symbol"
                                            value={orgCurrencySymbol}
                                            onChange={(e) => setOrgCurrencySymbol(e.target.value)}
                                            slotProps={{ htmlInput: { maxLength: 5 } }}
                                            required
                                            sx={{ minWidth: 140 }}
                                        />
                                    </Stack>
                                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: 'center' }}>
                                        <TextField
                                            label="Logo URL"
                                            value={orgLogoUrl}
                                            onChange={(e) => setOrgLogoUrl(e.target.value)}
                                            fullWidth
                                        />
                                        <TextField
                                            label="Primary Color"
                                            type="color"
                                            value={orgPrimaryColor}
                                            onChange={(e) => setOrgPrimaryColor(e.target.value)}
                                            sx={{ minWidth: 130 }}
                                        />
                                        <TextField
                                            label="Secondary Color"
                                            type="color"
                                            value={orgSecondaryColor}
                                            onChange={(e) => setOrgSecondaryColor(e.target.value)}
                                            sx={{ minWidth: 130 }}
                                        />
                                    </Stack>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                        <Button type="submit" variant="contained">
                                            Save Organization Config
                                        </Button>
                                        <Chip
                                            label={`Preview: ${orgName || 'School'} (${orgCurrencyCode} ${orgCurrencySymbol})`}
                                            sx={{ bgcolor: orgPrimaryColor, color: '#fff' }}
                                        />
                                    </Box>
                                </Stack>
                            </Box>
                        </CardContent>
                    </Card>
                )}

                {tab === 1 && (
                    <Stack spacing={3}>
                        <Card>
                            <CardContent>
                                <Typography variant="h6" gutterBottom>Add Campus</Typography>
                                <Box component="form" onSubmit={handleCreateCampus} sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                                    <TextField label="Campus Name" value={campusName} onChange={(e) => setCampusName(e.target.value)} required />
                                    <TextField label="Code (e.g. NORTH)" value={campusCode} onChange={(e) => setCampusCode(e.target.value.toUpperCase())} required />
                                    <TextField label="City" value={campusCity} onChange={(e) => setCampusCity(e.target.value)} />
                                    <TextField select label="Timezone Override" value={campusTimezone} onChange={(e) => setCampusTimezone(e.target.value)} sx={{ minWidth: 180 }}>
                                        <MenuItem value="">Inherit Org Timezone</MenuItem>
                                        {COMMON_TIMEZONES.map((tz) => (
                                            <MenuItem key={tz} value={tz}>{tz}</MenuItem>
                                        ))}
                                    </TextField>
                                    <FormControlLabel
                                        control={<Checkbox checked={campusPrimary} onChange={(e) => setCampusPrimary(e.target.checked)} />}
                                        label="Primary Campus"
                                    />
                                    <Button type="submit" variant="contained">Add Campus</Button>
                                </Box>
                            </CardContent>
                        </Card>

                        <TableContainer component={Paper}>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Code</TableCell>
                                        <TableCell>Name</TableCell>
                                        <TableCell>City</TableCell>
                                        <TableCell>Timezone</TableCell>
                                        <TableCell>Status</TableCell>
                                        <TableCell align="right">Actions</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {campuses.map((c) => (
                                        <TableRow key={c.id}>
                                            <TableCell><strong>{c.code}</strong></TableCell>
                                            <TableCell>{c.name}</TableCell>
                                            <TableCell>{c.city || '—'}</TableCell>
                                            <TableCell>{c.timezone || `Inherited (${orgTimezone})`}</TableCell>
                                            <TableCell>
                                                {c.is_primary && <Chip label="Primary" color="primary" size="small" sx={{ mr: 0.5 }} />}
                                                <Chip label={c.is_active ? 'Active' : 'Inactive'} color={c.is_active ? 'success' : 'default'} size="small" />
                                            </TableCell>
                                            <TableCell align="right">
                                                <Button size="small" color="error" onClick={() => handleDeleteItem(`/api/v1/config/campuses/${c.id}`, 'Campus')}>
                                                    Delete
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>

                        <Card>
                            <CardContent>
                                <Typography variant="h6" gutterBottom>Add Room</Typography>
                                <Box component="form" onSubmit={handleCreateRoom} sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                                    <TextField select label="Campus" value={roomCampusId} onChange={(e) => setRoomCampusId(e.target.value)} sx={{ minWidth: 160 }}>
                                        <MenuItem value="">All / Shared</MenuItem>
                                        {campuses.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                                    </TextField>
                                    <TextField label="Room Name" value={roomName} onChange={(e) => setRoomName(e.target.value)} required />
                                    <TextField label="Code (e.g. R-101)" value={roomCode} onChange={(e) => setRoomCode(e.target.value)} required />
                                    <TextField select label="Type" value={roomType} onChange={(e) => setRoomType(e.target.value)} sx={{ minWidth: 140 }}>
                                        <MenuItem value="classroom">Classroom</MenuItem>
                                        <MenuItem value="lab">Lab</MenuItem>
                                        <MenuItem value="auditorium">Auditorium</MenuItem>
                                        <MenuItem value="library">Library</MenuItem>
                                        <MenuItem value="sports">Sports</MenuItem>
                                        <MenuItem value="other">Other</MenuItem>
                                    </TextField>
                                    <TextField label="Building" value={roomBuilding} onChange={(e) => setRoomBuilding(e.target.value)} />
                                    <TextField label="Floor" value={roomFloor} onChange={(e) => setRoomFloor(e.target.value)} sx={{ width: 100 }} />
                                    <TextField label="Capacity" type="number" value={roomCapacity} onChange={(e) => setRoomCapacity(e.target.value)} required sx={{ width: 110 }} />
                                    <TextField label="Exam Cap." type="number" value={roomExamCapacity} onChange={(e) => setRoomExamCapacity(e.target.value)} sx={{ width: 110 }} />
                                    <Button type="submit" variant="contained">Add Room</Button>
                                </Box>
                            </CardContent>
                        </Card>

                        <Card variant="outlined">
                            <CardContent>
                                <Typography variant="h6" gutterBottom>Room Capacity Check</Typography>
                                <Box component="form" onSubmit={handleCheckRoomCapacity} sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                                    <TextField select label="Select Room" value={checkRoomId} onChange={(e) => setCheckRoomId(e.target.value)} required sx={{ minWidth: 220 }}>
                                        {rooms.map((r) => (
                                            <MenuItem key={r.id} value={r.id}>
                                                {r.name} ({r.code}) — Cap {r.capacity}
                                            </MenuItem>
                                        ))}
                                    </TextField>
                                    <TextField select label="Mode" value={checkMode} onChange={(e) => setCheckMode(e.target.value as 'regular' | 'exam')} sx={{ minWidth: 130 }}>
                                        <MenuItem value="regular">Regular</MenuItem>
                                        <MenuItem value="exam">Exam</MenuItem>
                                    </TextField>
                                    <TextField label="Students / Seats" type="number" value={checkCount} onChange={(e) => setCheckCount(e.target.value)} required sx={{ width: 150 }} />
                                    <Button type="submit" variant="outlined">Check Capacity</Button>
                                </Box>
                                {capacityResult && (
                                    <Box sx={{ mt: 2 }}>
                                        <Alert severity={capacityResult.fits ? (capacityResult.warning ? 'warning' : 'success') : 'error'}>
                                            <strong>{capacityResult.room_name}</strong> ({capacityResult.mode}):{' '}
                                            {capacityResult.requested_count} / {capacityResult.max_capacity} seats ({capacityResult.utilization_pct}%).{' '}
                                            {capacityResult.fits
                                                ? `${capacityResult.remaining_capacity} seat(s) remaining.`
                                                : capacityResult.warning}
                                        </Alert>
                                        <LinearProgress
                                            variant="determinate"
                                            value={Math.min(100, capacityResult.utilization_pct)}
                                            color={capacityResult.fits ? 'primary' : 'error'}
                                            sx={{ mt: 1, height: 8, borderRadius: 1 }}
                                        />
                                    </Box>
                                )}
                            </CardContent>
                        </Card>

                        <TableContainer component={Paper}>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Code</TableCell>
                                        <TableCell>Room</TableCell>
                                        <TableCell>Campus</TableCell>
                                        <TableCell>Type</TableCell>
                                        <TableCell>Capacity</TableCell>
                                        <TableCell>Exam Cap.</TableCell>
                                        <TableCell align="right">Actions</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {rooms.map((r) => (
                                        <TableRow key={r.id}>
                                            <TableCell>{r.code}</TableCell>
                                            <TableCell>{r.name}</TableCell>
                                            <TableCell>{r.campus?.name || 'Shared'}</TableCell>
                                            <TableCell>{r.room_type}</TableCell>
                                            <TableCell>{r.capacity}</TableCell>
                                            <TableCell>{r.exam_capacity ?? r.capacity}</TableCell>
                                            <TableCell align="right">
                                                <Button size="small" color="error" onClick={() => handleDeleteItem(`/api/v1/config/rooms/${r.id}`, 'Room')}>
                                                    Delete
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Stack>
                )}

                {tab === 2 && (
                    <Stack spacing={3}>
                        <Card>
                            <CardContent>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                    <Typography variant="h6">Add Academic Term</Typography>
                                    <Button variant="outlined" onClick={() => setCloneOpen(true)}>
                                        Open Year Cloning Wizard
                                    </Button>
                                </Box>
                                <Box component="form" onSubmit={handleCreateTerm} sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                                    <TextField select label="Academic Year" value={termYearId} onChange={(e) => setTermYearId(e.target.value)} required sx={{ minWidth: 160 }}>
                                        {years.map((y) => <MenuItem key={y.id} value={y.id}>{y.name}</MenuItem>)}
                                    </TextField>
                                    <TextField select label="Campus (Optional)" value={termCampusId} onChange={(e) => setTermCampusId(e.target.value)} sx={{ minWidth: 150 }}>
                                        <MenuItem value="">All Campuses</MenuItem>
                                        {campuses.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                                    </TextField>
                                    <TextField label="Term Name (e.g. Term 1)" value={termName} onChange={(e) => setTermName(e.target.value)} required />
                                    <TextField label="Code" value={termCode} onChange={(e) => setTermCode(e.target.value)} sx={{ width: 110 }} />
                                    <DateInput label="Start Date" value={termStart} onChange={setTermStart} required />
                                    <DateInput label="End Date" value={termEnd} onChange={setTermEnd} required />
                                    <TextField label="Order" type="number" value={termOrder} onChange={(e) => setTermOrder(e.target.value)} sx={{ width: 90 }} />
                                    <Button type="submit" variant="contained">Add Term</Button>
                                </Box>
                            </CardContent>
                        </Card>

                        <TableContainer component={Paper}>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Term</TableCell>
                                        <TableCell>Academic Year</TableCell>
                                        <TableCell>Campus</TableCell>
                                        <TableCell>Dates</TableCell>
                                        <TableCell>Effective From</TableCell>
                                        <TableCell align="right">Actions</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {terms.map((t) => (
                                        <TableRow key={t.id}>
                                            <TableCell>{t.name} {t.code ? `(${t.code})` : ''}</TableCell>
                                            <TableCell>{t.academic_year?.name || '—'}</TableCell>
                                            <TableCell>{t.campus?.name || 'All Campuses'}</TableCell>
                                            <TableCell>{formatDate(t.start_date)} – {formatDate(t.end_date)}</TableCell>
                                            <TableCell>{formatDate(t.effective_from)}</TableCell>
                                            <TableCell align="right">
                                                <Button size="small" color="error" onClick={() => handleDeleteItem(`/api/v1/config/terms/${t.id}`, 'Term')}>
                                                    Delete
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>

                        <Card>
                            <CardContent>
                                <Typography variant="h6" gutterBottom>
                                    Add Calendar Day (Holiday / Closure / Special Schedule)
                                </Typography>
                                {calendarConflicts.length > 0 && (
                                    <Alert severity="warning" sx={{ mb: 2 }}>
                                        <strong>Calendar Conflict Warning:</strong>
                                        {calendarConflicts.map((c, idx) => (
                                            <div key={idx}>• {c.message}</div>
                                        ))}
                                    </Alert>
                                )}
                                <Box component="form" onSubmit={handleCreateCalendarDay} sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                                    <DateInput
                                        label="Date"
                                        value={calDate}
                                        onChange={(val) => {
                                            setCalDate(val);
                                            if (!val) setCalendarConflicts([]);
                                        }}
                                        required
                                    />
                                    <TextField
                                        select
                                        label="Type"
                                        value={calType}
                                        onChange={(e) => setCalType(e.target.value as CalendarDay['day_type'])}
                                        sx={{ minWidth: 160 }}
                                    >
                                        <MenuItem value="holiday">Holiday</MenuItem>
                                        <MenuItem value="closure">Closure</MenuItem>
                                        <MenuItem value="special_schedule">Special Schedule</MenuItem>
                                        <MenuItem value="exam_day">Exam Day</MenuItem>
                                        <MenuItem value="event">Event</MenuItem>
                                    </TextField>
                                    <TextField label="Title" value={calTitle} onChange={(e) => setCalTitle(e.target.value)} required />
                                    <TextField select label="Campus" value={calCampusId} onChange={(e) => setCalCampusId(e.target.value)} sx={{ minWidth: 150 }}>
                                        <MenuItem value="">All Campuses</MenuItem>
                                        {campuses.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                                    </TextField>
                                    <TextField select label="Academic Year" value={calYearId} onChange={(e) => setCalYearId(e.target.value)} sx={{ minWidth: 150 }}>
                                        <MenuItem value="">None</MenuItem>
                                        {years.map((y) => <MenuItem key={y.id} value={y.id}>{y.name}</MenuItem>)}
                                    </TextField>
                                    <TextField select label="Term" value={calTermId} onChange={(e) => setCalTermId(e.target.value)} sx={{ minWidth: 140 }}>
                                        <MenuItem value="">None</MenuItem>
                                        {terms.map((t) => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
                                    </TextField>
                                    <TextField label="Notes" value={calDescription} onChange={(e) => setCalDescription(e.target.value)} />
                                    <FormControlLabel
                                        control={<Checkbox checked={calWorkingDay} onChange={(e) => setCalWorkingDay(e.target.checked)} />}
                                        label="Working Day"
                                    />
                                    <Button type="submit" variant="contained">Save Calendar Day</Button>
                                </Box>
                            </CardContent>
                        </Card>

                        <TableContainer component={Paper}>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Date</TableCell>
                                        <TableCell>Title</TableCell>
                                        <TableCell>Type</TableCell>
                                        <TableCell>Campus</TableCell>
                                        <TableCell>Working Day</TableCell>
                                        <TableCell align="right">Actions</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {calendarDays.map((d) => (
                                        <TableRow key={d.id}>
                                            <TableCell>{formatDate(d.day_date)}</TableCell>
                                            <TableCell>{d.title}</TableCell>
                                            <TableCell><Chip label={d.day_type} size="small" /></TableCell>
                                            <TableCell>{d.campus?.name || 'All Campuses'}</TableCell>
                                            <TableCell>{d.is_working_day ? 'Yes' : 'No'}</TableCell>
                                            <TableCell align="right">
                                                <Button size="small" color="error" onClick={() => handleDeleteItem(`/api/v1/config/calendar-days/${d.id}`, 'Calendar day')}>
                                                    Delete
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Stack>
                )}

                {tab === 3 && (
                    <Stack spacing={3}>
                        <Card>
                            <CardContent>
                                <Typography variant="h6" gutterBottom>Add Academic Stream</Typography>
                                <Box component="form" onSubmit={handleCreateStream} sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                                    <TextField label="Stream Name (e.g. Science)" value={streamName} onChange={(e) => setStreamName(e.target.value)} required />
                                    <TextField label="Code (e.g. SCI)" value={streamCode} onChange={(e) => setStreamCode(e.target.value.toUpperCase())} required />
                                    <TextField select label="Campus" value={streamCampusId} onChange={(e) => setStreamCampusId(e.target.value)} sx={{ minWidth: 160 }}>
                                        <MenuItem value="">All Campuses</MenuItem>
                                        {campuses.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                                    </TextField>
                                    <TextField label="Description" value={streamDesc} onChange={(e) => setStreamDesc(e.target.value)} />
                                    <Button type="submit" variant="contained">Add Stream</Button>
                                </Box>
                            </CardContent>
                        </Card>

                        <TableContainer component={Paper}>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Code</TableCell>
                                        <TableCell>Stream</TableCell>
                                        <TableCell>Campus</TableCell>
                                        <TableCell>Description</TableCell>
                                        <TableCell align="right">Actions</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {streams.map((s) => (
                                        <TableRow key={s.id}>
                                            <TableCell>{s.code}</TableCell>
                                            <TableCell>{s.name}</TableCell>
                                            <TableCell>{s.campus?.name || 'All Campuses'}</TableCell>
                                            <TableCell>{s.description || '—'}</TableCell>
                                            <TableCell align="right">
                                                <Button size="small" color="error" onClick={() => handleDeleteItem(`/api/v1/config/streams/${s.id}`, 'Stream')}>
                                                    Delete
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>

                        <Card>
                            <CardContent>
                                <Typography variant="h6" gutterBottom>Add Student House</Typography>
                                <Box component="form" onSubmit={handleCreateHouse} sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                                    <TextField label="House Name (e.g. Red Falcons)" value={houseName} onChange={(e) => setHouseName(e.target.value)} required />
                                    <TextField label="Code (e.g. RED)" value={houseCode} onChange={(e) => setHouseCode(e.target.value.toUpperCase())} required />
                                    <TextField label="Color" type="color" value={houseColor} onChange={(e) => setHouseColor(e.target.value)} sx={{ width: 90 }} />
                                    <TextField select label="Campus" value={houseCampusId} onChange={(e) => setHouseCampusId(e.target.value)} sx={{ minWidth: 160 }}>
                                        <MenuItem value="">All Campuses</MenuItem>
                                        {campuses.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                                    </TextField>
                                    <TextField label="Motto" value={houseMotto} onChange={(e) => setHouseMotto(e.target.value)} />
                                    <Button type="submit" variant="contained">Add House</Button>
                                </Box>
                            </CardContent>
                        </Card>

                        <TableContainer component={Paper}>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Code</TableCell>
                                        <TableCell>House</TableCell>
                                        <TableCell>Color</TableCell>
                                        <TableCell>Campus</TableCell>
                                        <TableCell>Motto</TableCell>
                                        <TableCell align="right">Actions</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {houses.map((h) => (
                                        <TableRow key={h.id}>
                                            <TableCell>{h.code}</TableCell>
                                            <TableCell>{h.name}</TableCell>
                                            <TableCell>
                                                <Chip label={h.color} size="small" sx={{ bgcolor: h.color, color: '#fff' }} />
                                            </TableCell>
                                            <TableCell>{h.campus?.name || 'All Campuses'}</TableCell>
                                            <TableCell>{h.motto || '—'}</TableCell>
                                            <TableCell align="right">
                                                <Button size="small" color="error" onClick={() => handleDeleteItem(`/api/v1/config/houses/${h.id}`, 'House')}>
                                                    Delete
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Stack>
                )}

                {tab === 4 && (
                    <Stack spacing={3}>
                        <Card>
                            <CardContent>
                                <Typography variant="h6" gutterBottom>Configure Numbering Sequence</Typography>
                                <Box component="form" onSubmit={handleCreateSequence} sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                                    <TextField select label="Sequence Type" value={seqType} onChange={(e) => setSeqType(e.target.value)} sx={{ minWidth: 150 }}>
                                        <MenuItem value="admission">Admission</MenuItem>
                                        <MenuItem value="receipt">Receipt</MenuItem>
                                        <MenuItem value="invoice">Invoice</MenuItem>
                                        <MenuItem value="tc">Transfer Cert (TC)</MenuItem>
                                        <MenuItem value="employee">Employee</MenuItem>
                                    </TextField>
                                    <TextField label="Prefix" value={seqPrefix} onChange={(e) => setSeqPrefix(e.target.value)} required sx={{ width: 120 }} />
                                    <TextField label="Separator" value={seqSeparator} onChange={(e) => setSeqSeparator(e.target.value)} sx={{ width: 90 }} />
                                    <TextField label="Padding" type="number" value={seqPadding} onChange={(e) => setSeqPadding(e.target.value)} required sx={{ width: 100 }} />
                                    <TextField label="Next No." type="number" value={seqNext} onChange={(e) => setSeqNext(e.target.value)} required sx={{ width: 110 }} />
                                    <TextField select label="Reset Policy" value={seqResetPolicy} onChange={(e) => setSeqResetPolicy(e.target.value as 'never' | 'yearly' | 'monthly')} sx={{ minWidth: 130 }}>
                                        <MenuItem value="never">Never</MenuItem>
                                        <MenuItem value="yearly">Yearly</MenuItem>
                                        <MenuItem value="monthly">Monthly</MenuItem>
                                    </TextField>
                                    <TextField select label="Campus" value={seqCampusId} onChange={(e) => setSeqCampusId(e.target.value)} sx={{ minWidth: 150 }}>
                                        <MenuItem value="">All Campuses</MenuItem>
                                        {campuses.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                                    </TextField>
                                    <TextField select label="Academic Year" value={seqYearId} onChange={(e) => setSeqYearId(e.target.value)} sx={{ minWidth: 150 }}>
                                        <MenuItem value="">Any Year</MenuItem>
                                        {years.map((y) => <MenuItem key={y.id} value={y.id}>{y.name}</MenuItem>)}
                                    </TextField>
                                    <Button type="submit" variant="contained">Save Rule</Button>
                                </Box>
                            </CardContent>
                        </Card>

                        <Card variant="outlined">
                            <CardContent>
                                <Typography variant="subtitle1" gutterBottom>Transactional Sequence Generator Test</Typography>
                                <Stack direction="row" spacing={2} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                                    <TextField select label="Type" size="small" value={testSeqType} onChange={(e) => setTestSeqType(e.target.value)} sx={{ minWidth: 150 }}>
                                        <MenuItem value="admission">Admission</MenuItem>
                                        <MenuItem value="receipt">Receipt</MenuItem>
                                        <MenuItem value="invoice">Invoice</MenuItem>
                                    </TextField>
                                    <Button variant="outlined" onClick={handleGenerateTestSequence}>
                                        Generate Next Number
                                    </Button>
                                    {generatedSample && (
                                        <Chip label={`Generated: ${generatedSample}`} color="success" />
                                    )}
                                </Stack>
                            </CardContent>
                        </Card>

                        <TableContainer component={Paper}>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Type</TableCell>
                                        <TableCell>Format Preview</TableCell>
                                        <TableCell>Next No.</TableCell>
                                        <TableCell>Reset Policy</TableCell>
                                        <TableCell>Campus / Year</TableCell>
                                        <TableCell>Effective</TableCell>
                                        <TableCell align="right">Actions</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {sequences.map((s) => (
                                        <TableRow key={s.id}>
                                            <TableCell><strong>{s.sequence_type}</strong></TableCell>
                                            <TableCell>
                                                {s.prefix}{s.separator}{String(s.next_number).padStart(s.padding, '0')}{s.suffix}
                                            </TableCell>
                                            <TableCell>{s.next_number}</TableCell>
                                            <TableCell>{s.reset_policy}</TableCell>
                                            <TableCell>{s.campus?.name || 'All'} / {s.academic_year?.name || 'Any'}</TableCell>
                                            <TableCell>{formatDate(s.effective_from)}</TableCell>
                                            <TableCell align="right">
                                                <Button size="small" color="error" onClick={() => handleDeleteItem(`/api/v1/config/sequences/${s.id}`, 'Sequence')}>
                                                    Delete
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Stack>
                )}

                {tab === 5 && flagsData && (
                    <Stack spacing={3}>
                        <Card>
                            <CardContent>
                                <Typography variant="h6" gutterBottom>
                                    Module Feature Flags (API &amp; UI Enforcement)
                                </Typography>
                                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
                                    <TextField
                                        select
                                        label="Campus Scope"
                                        value={flagCampusId}
                                        onChange={(e) => handleFlagCampusChange(e.target.value)}
                                        sx={{ minWidth: 220 }}
                                    >
                                        <MenuItem value="">School-Wide (Default)</MenuItem>
                                        {campuses.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                                    </TextField>
                                    <DateInput
                                        label="Effective From (Optional)"
                                        value={flagEffectiveFrom}
                                        onChange={setFlagEffectiveFrom}
                                    />
                                </Stack>

                                <TableContainer component={Paper} variant="outlined">
                                    <Table>
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>Module</TableCell>
                                                <TableCell>Description</TableCell>
                                                <TableCell>Status</TableCell>
                                                <TableCell align="right">Enabled</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {flagsData.available_modules.map((mod) => {
                                                const enabled = flagsData.modules[mod.module_key] !== false;
                                                return (
                                                    <TableRow key={mod.module_key}>
                                                        <TableCell><strong>{mod.module_key}</strong></TableCell>
                                                        <TableCell>{mod.description}</TableCell>
                                                        <TableCell>
                                                            <Chip
                                                                label={enabled ? 'ENABLED' : 'DISABLED'}
                                                                color={enabled ? 'success' : 'default'}
                                                                size="small"
                                                            />
                                                        </TableCell>
                                                        <TableCell align="right">
                                                            <Switch
                                                                checked={enabled}
                                                                onChange={(e) => handleToggleFlag(mod.module_key, e.target.checked)}
                                                            />
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            </CardContent>
                        </Card>
                    </Stack>
                )}
            </Container>

            <YearCloneWizardDialog
                open={cloneOpen}
                onClose={() => setCloneOpen(false)}
                token={token}
                academicYears={years}
                campuses={campuses}
                onCloned={() => {
                    void reloadAll();
                }}
            />
        </>
    );
}
