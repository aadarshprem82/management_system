import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
    Alert,
    AppBar,
    Box,
    Button,
    Card,
    CardContent,
    Chip,
    Container,
    MenuItem,
    Paper,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    ToggleButton,
    ToggleButtonGroup,
    Toolbar,
    Typography,
} from '@mui/material';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';

type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

interface AcademicYear {
    id: string;
    name: string;
}

interface ClassItem {
    id: string;
    name: string;
    sections: { id: string; name: string }[];
}

interface RosterRow {
    student_id: string;
    roll_number: string | null;
    full_name: string;
    status: AttendanceStatus;
    remarks: string;
    is_marked: boolean;
}

interface StudentSummary {
    total_days: number;
    present: number;
    late: number;
    absent: number;
    excused: number;
    percentage: number;
    records: { id: string; date: string; status: AttendanceStatus; remarks: string | null }[];
}

export default function AttendancePage() {
    const { session, profile } = useAuth();
    const token = session?.access_token ?? '';
    const isStaff = profile?.role === 'admin' || profile?.role === 'teacher';

    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // Staff filter states
    const [years, setYears] = useState<AcademicYear[]>([]);
    const [classes, setClasses] = useState<ClassItem[]>([]);
    const [yearId, setYearId] = useState('');
    const [classId, setClassId] = useState('');
    const [sectionId, setSectionId] = useState('');
    const [selectedDate, setSelectedDate] = useState(
        new Date().toISOString().split('T')[0]
    );
    const [roster, setRoster] = useState<RosterRow[]>([]);
    const [saving, setSaving] = useState(false);

    // Student summary state
    const [summary, setSummary] = useState<StudentSummary | null>(null);

    useEffect(() => {
        if (!token) return;
        if (isStaff) {
            Promise.all([
                apiFetch<AcademicYear[]>('/api/v1/academics/academic-years', token),
                apiFetch<ClassItem[]>('/api/v1/academics/classes', token),
            ])
                .then(([y, c]) => {
                    setYears(y);
                    setClasses(c);
                })
                .catch((err: unknown) =>
                    setError(err instanceof Error ? err.message : 'Failed to load filters')
                );
        } else {
            apiFetch<StudentSummary>('/api/v1/attendance/my-summary', token)
                .then(setSummary)
                .catch((err: unknown) =>
                    setError(err instanceof Error ? err.message : 'Failed to load attendance')
                );
        }
    }, [token, isStaff]);

    const loadRoster = async () => {
        if (!yearId || !classId || !sectionId || !selectedDate) return;
        setError(null);
        setSuccess(null);
        try {
            const params = new URLSearchParams({
                academic_year_id: yearId,
                class_id: classId,
                section_id: sectionId,
                date: selectedDate,
            });
            const data = await apiFetch<RosterRow[]>(
                `/api/v1/attendance/roster?${params.toString()}`,
                token
            );
            setRoster(data);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to load roster');
        }
    };

    const updateRow = (
        studentId: string,
        field: 'status' | 'remarks',
        value: string
    ) => {
        setRoster((prev) =>
            prev.map((row) =>
                row.student_id === studentId ? { ...row, [field]: value } : row
            )
        );
    };

    const handleSaveAttendance = async () => {
        setSaving(true);
        setError(null);
        setSuccess(null);
        try {
            const res = await apiFetch<{ saved_count: number }>(
                '/api/v1/attendance/bulk',
                token,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        academic_year_id: yearId,
                        class_id: classId,
                        section_id: sectionId,
                        date: selectedDate,
                        records: roster.map((r) => ({
                            student_id: r.student_id,
                            status: r.status,
                            remarks: r.remarks || null,
                        })),
                    }),
                }
            );
            setSuccess(`Saved attendance for ${res.saved_count} student(s).`);
            loadRoster();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to save attendance');
        } finally {
            setSaving(false);
        }
    };

    const selectedClass = classes.find((c) => c.id === classId);

    return (
        <>
            <AppBar position="static">
                <Toolbar>
                    <Typography variant="h6" sx={{ flexGrow: 1 }}>
                        Attendance
                    </Typography>
                    <Button color="inherit" component={RouterLink} to="/dashboard">
                        Back to Dashboard
                    </Button>
                </Toolbar>
            </AppBar>

            <Container maxWidth="lg" sx={{ mt: 4 }}>
                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

                {isStaff ? (
                    <Stack spacing={3}>
                        <Card>
                            <CardContent>
                                <Typography variant="h6" gutterBottom>Select Class &amp; Date</Typography>
                                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                                    <TextField
                                        select
                                        label="Academic Year"
                                        value={yearId}
                                        onChange={(e) => setYearId(e.target.value)}
                                        sx={{ minWidth: 160 }}
                                    >
                                        {years.map((y) => (
                                            <MenuItem key={y.id} value={y.id}>{y.name}</MenuItem>
                                        ))}
                                    </TextField>

                                    <TextField
                                        select
                                        label="Class"
                                        value={classId}
                                        onChange={(e) => {
                                            setClassId(e.target.value);
                                            setSectionId('');
                                        }}
                                        sx={{ minWidth: 160 }}
                                    >
                                        {classes.map((c) => (
                                            <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
                                        ))}
                                    </TextField>

                                    <TextField
                                        select
                                        label="Section"
                                        value={sectionId}
                                        onChange={(e) => setSectionId(e.target.value)}
                                        disabled={!selectedClass}
                                        sx={{ minWidth: 140 }}
                                    >
                                        {selectedClass?.sections.map((sec) => (
                                            <MenuItem key={sec.id} value={sec.id}>Section {sec.name}</MenuItem>
                                        ))}
                                    </TextField>

                                    <TextField
                                        label="Date"
                                        type="date"
                                        value={selectedDate}
                                        onChange={(e) => setSelectedDate(e.target.value)}
                                        slotProps={{ inputLabel: { shrink: true } }}
                                    />

                                    <Button
                                        variant="contained"
                                        onClick={loadRoster}
                                        disabled={!yearId || !classId || !sectionId}
                                    >
                                        Load Roster
                                    </Button>
                                </Box>
                            </CardContent>
                        </Card>

                        {roster.length > 0 && (
                            <>
                                <TableContainer component={Paper}>
                                    <Table>
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>Roll No.</TableCell>
                                                <TableCell>Student</TableCell>
                                                <TableCell>Status</TableCell>
                                                <TableCell>Remarks</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {roster.map((row) => (
                                                <TableRow key={row.student_id}>
                                                    <TableCell>{row.roll_number || '—'}</TableCell>
                                                    <TableCell>{row.full_name}</TableCell>
                                                    <TableCell>
                                                        <ToggleButtonGroup
                                                            size="small"
                                                            exclusive
                                                            value={row.status}
                                                            onChange={(_, val: AttendanceStatus | null) => {
                                                                if (val) updateRow(row.student_id, 'status', val);
                                                            }}
                                                        >
                                                            <ToggleButton value="present" color="success">Present</ToggleButton>
                                                            <ToggleButton value="absent" color="error">Absent</ToggleButton>
                                                            <ToggleButton value="late" color="warning">Late</ToggleButton>
                                                            <ToggleButton value="excused" color="info">Excused</ToggleButton>
                                                        </ToggleButtonGroup>
                                                    </TableCell>
                                                    <TableCell>
                                                        <TextField
                                                            size="small"
                                                            placeholder="Optional note"
                                                            value={row.remarks}
                                                            onChange={(e) => updateRow(row.student_id, 'remarks', e.target.value)}
                                                        />
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>

                                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                                    <Button
                                        variant="contained"
                                        size="large"
                                        onClick={handleSaveAttendance}
                                        disabled={saving}
                                    >
                                        {saving ? 'Saving...' : 'Save Attendance'}
                                    </Button>
                                </Box>
                            </>
                        )}
                    </Stack>
                ) : (
                    <Stack spacing={3}>
                        {summary && (
                            <>
                                <Card>
                                    <CardContent sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                                        <Typography variant="h5" sx={{ mr: 2 }}>
                                            Attendance: {summary.percentage}%
                                        </Typography>
                                        <Chip label={`Total: ${summary.total_days}`} />
                                        <Chip label={`Present: ${summary.present}`} color="success" />
                                        <Chip label={`Late: ${summary.late}`} color="warning" />
                                        <Chip label={`Absent: ${summary.absent}`} color="error" />
                                        <Chip label={`Excused: ${summary.excused}`} color="info" />
                                    </CardContent>
                                </Card>

                                <TableContainer component={Paper}>
                                    <Table>
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>Date</TableCell>
                                                <TableCell>Status</TableCell>
                                                <TableCell>Remarks</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {summary.records.map((rec) => (
                                                <TableRow key={rec.id}>
                                                    <TableCell>{rec.date}</TableCell>
                                                    <TableCell>
                                                        <Chip label={rec.status.toUpperCase()} size="small" />
                                                    </TableCell>
                                                    <TableCell>{rec.remarks || '—'}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            </>
                        )}
                    </Stack>
                )}
            </Container>
        </>
    );
}