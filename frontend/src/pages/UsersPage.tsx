import { useEffect, useState, type SyntheticEvent } from 'react';
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
import { apiFetch } from '../lib/api';

interface ProfileItem {
    id: string;
    full_name: string;
    email: string;
    role: 'admin' | 'teacher' | 'student' | 'parent';
    phone: string | null;
}

interface AcademicYear {
    id: string;
    name: string;
}

interface SectionItem {
    id: string;
    name: string;
}

interface ClassItem {
    id: string;
    name: string;
    sections: SectionItem[];
}

interface EnrollmentItem {
    id: string;
    roll_number: string | null;
    student: { id: string; full_name: string; email: string } | null;
    academic_year: { id: string; name: string } | null;
    class: { id: string; name: string } | null;
    section: { id: string; name: string } | null;
}

export default function UsersPage() {
    const { session } = useAuth();
    const token = session?.access_token ?? '';

    const [tab, setTab] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // Data states
    const [users, setUsers] = useState<ProfileItem[]>([]);
    const [years, setYears] = useState<AcademicYear[]>([]);
    const [classes, setClasses] = useState<ClassItem[]>([]);
    const [enrollments, setEnrollments] = useState<EnrollmentItem[]>([]);

    // User form states
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState<'teacher' | 'student' | 'parent' | 'admin'>('student');
    const [phone, setPhone] = useState('');

    // Enrollment form states
    const [studentId, setStudentId] = useState('');
    const [yearId, setYearId] = useState('');
    const [classId, setClassId] = useState('');
    const [sectionId, setSectionId] = useState('');
    const [rollNumber, setRollNumber] = useState('');

    const loadAll = async () => {
        if (!token) return;
        try {
            setError(null);
            const [u, y, c, e] = await Promise.all([
                apiFetch<ProfileItem[]>('/api/v1/users', token),
                apiFetch<AcademicYear[]>('/api/v1/academics/academic-years', token),
                apiFetch<ClassItem[]>('/api/v1/academics/classes', token),
                apiFetch<EnrollmentItem[]>('/api/v1/users/enrollments', token),
            ]);
            setUsers(u);
            setYears(y);
            setClasses(c);
            setEnrollments(e);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to load data');
        }
    };

    useEffect(() => {
        loadAll();
    }, [token]);

    const handleCreateUser = async (e: SyntheticEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);
        try {
            await apiFetch('/api/v1/users', token, {
                method: 'POST',
                body: JSON.stringify({
                    full_name: fullName,
                    email,
                    password,
                    role,
                    phone: phone || null,
                }),
            });
            setFullName('');
            setEmail('');
            setPassword('');
            setPhone('');
            setSuccess(`Created ${role} account successfully.`);
            loadAll();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to create user');
        }
    };

    const handleEnrollStudent = async (e: SyntheticEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);
        try {
            await apiFetch('/api/v1/users/enrollments', token, {
                method: 'POST',
                body: JSON.stringify({
                    student_id: studentId,
                    academic_year_id: yearId,
                    class_id: classId,
                    section_id: sectionId,
                    roll_number: rollNumber || null,
                }),
            });
            setStudentId('');
            setRollNumber('');
            setSuccess('Student enrolled successfully.');
            loadAll();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to enroll student');
        }
    };

    const students = users.filter((u) => u.role === 'student');
    const selectedClass = classes.find((c) => c.id === classId);

    return (
        <>
            <AppBar position="static">
                <Toolbar>
                    <Typography variant="h6" sx={{ flexGrow: 1 }}>
                        Users &amp; Student Enrollments
                    </Typography>
                    <Button color="inherit" component={RouterLink} to="/dashboard">
                        Back to Dashboard
                    </Button>
                </Toolbar>
            </AppBar>

            <Container maxWidth="lg" sx={{ mt: 4 }}>
                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

                <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
                    <Tab label="Users (Staff, Students, Parents)" />
                    <Tab label="Student Enrollments" />
                </Tabs>

                {tab === 0 && (
                    <Stack spacing={3}>
                        <Card>
                            <CardContent>
                                <Typography variant="h6" gutterBottom>Add New User</Typography>
                                <Box
                                    component="form"
                                    onSubmit={handleCreateUser}
                                    sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}
                                >
                                    <TextField label="Full Name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                                    <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                                    <TextField label="Temp Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                                    <TextField
                                        select
                                        label="Role"
                                        value={role}
                                        onChange={(e) => setRole(e.target.value as ProfileItem['role'])}
                                        sx={{ minWidth: 140 }}
                                    >
                                        <MenuItem value="student">Student</MenuItem>
                                        <MenuItem value="teacher">Teacher</MenuItem>
                                        <MenuItem value="parent">Parent</MenuItem>
                                        <MenuItem value="admin">Admin</MenuItem>
                                    </TextField>
                                    <TextField label="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
                                    <Button type="submit" variant="contained">Create User</Button>
                                </Box>
                            </CardContent>
                        </Card>

                        <TableContainer component={Paper}>
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Name</TableCell>
                                        <TableCell>Email</TableCell>
                                        <TableCell>Role</TableCell>
                                        <TableCell>Phone</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {users.map((u) => (
                                        <TableRow key={u.id}>
                                            <TableCell>{u.full_name}</TableCell>
                                            <TableCell>{u.email}</TableCell>
                                            <TableCell>
                                                <Chip label={u.role.toUpperCase()} size="small" />
                                            </TableCell>
                                            <TableCell>{u.phone || '—'}</TableCell>
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
                                <Typography variant="h6" gutterBottom>Enroll Student</Typography>
                                <Box
                                    component="form"
                                    onSubmit={handleEnrollStudent}
                                    sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}
                                >
                                    <TextField
                                        select
                                        label="Student"
                                        value={studentId}
                                        onChange={(e) => setStudentId(e.target.value)}
                                        required
                                        sx={{ minWidth: 200 }}
                                    >
                                        {students.map((s) => (
                                            <MenuItem key={s.id} value={s.id}>{s.full_name}</MenuItem>
                                        ))}
                                    </TextField>

                                    <TextField
                                        select
                                        label="Academic Year"
                                        value={yearId}
                                        onChange={(e) => setYearId(e.target.value)}
                                        required
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
                                        required
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
                                        required
                                        disabled={!selectedClass}
                                        sx={{ minWidth: 140 }}
                                    >
                                        {selectedClass?.sections.map((sec) => (
                                            <MenuItem key={sec.id} value={sec.id}>Section {sec.name}</MenuItem>
                                        ))}
                                    </TextField>

                                    <TextField
                                        label="Roll No."
                                        value={rollNumber}
                                        onChange={(e) => setRollNumber(e.target.value)}
                                        sx={{ width: 120 }}
                                    />

                                    <Button type="submit" variant="contained">Enroll</Button>
                                </Box>
                            </CardContent>
                        </Card>

                        <TableContainer component={Paper}>
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Roll No.</TableCell>
                                        <TableCell>Student</TableCell>
                                        <TableCell>Academic Year</TableCell>
                                        <TableCell>Class</TableCell>
                                        <TableCell>Section</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {enrollments.map((en) => (
                                        <TableRow key={en.id}>
                                            <TableCell>{en.roll_number || '—'}</TableCell>
                                            <TableCell>{en.student?.full_name}</TableCell>
                                            <TableCell>{en.academic_year?.name}</TableCell>
                                            <TableCell>{en.class?.name}</TableCell>
                                            <TableCell>{en.section?.name}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Stack>
                )}
            </Container>
        </>
    );
}