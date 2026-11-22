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
    Stack,
    Tab,
    Tabs,
    TextField,
    Toolbar,
    Typography,
} from '@mui/material';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';

import DateInput from '../components/DateInput';
import { formatDate } from '../lib/date';

interface AcademicYear {
    id: string;
    name: string;
    start_date: string;
    end_date: string;
    is_current: boolean;
}

interface SectionItem {
    id: string;
    name: string;
}

interface ClassItem {
    id: string;
    name: string;
    numeric_level: number | null;
    sections: SectionItem[];
}

interface SubjectItem {
    id: string;
    name: string;
    code: string;
}

export default function AcademicsPage() {
    const { session } = useAuth();
    const token = session?.access_token ?? '';

    const [tab, setTab] = useState(0);
    const [error, setError] = useState<string | null>(null);

    // Data states
    const [years, setYears] = useState<AcademicYear[]>([]);
    const [classes, setClasses] = useState<ClassItem[]>([]);
    const [subjects, setSubjects] = useState<SubjectItem[]>([]);

    // Form states
    const [yearName, setYearName] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    const [className, setClassName] = useState('');
    const [numericLevel, setNumericLevel] = useState('');
    const [selectedClassId, setSelectedClassId] = useState('');
    const [sectionName, setSectionName] = useState('');

    const [subjectName, setSubjectName] = useState('');
    const [subjectCode, setSubjectCode] = useState('');

    const loadAll = async () => {
        if (!token) return;
        try {
            setError(null);
            const [y, c, s] = await Promise.all([
                apiFetch<AcademicYear[]>('/api/v1/academics/academic-years', token),
                apiFetch<ClassItem[]>('/api/v1/academics/classes', token),
                apiFetch<SubjectItem[]>('/api/v1/academics/subjects', token),
            ]);
            setYears(y);
            setClasses(c);
            setSubjects(s);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to load academic data');
        }
    };

    useEffect(() => {
        loadAll();
    }, [token]);

    const handleAddYear = async (e: SyntheticEvent<HTMLFormElement>) => {
        e.preventDefault();
        try {
            await apiFetch('/api/v1/academics/academic-years', token, {
                method: 'POST',
                body: JSON.stringify({
                    name: yearName,
                    start_date: startDate,
                    end_date: endDate,
                    is_current: true,
                }),
            });
            setYearName('');
            setStartDate('');
            setEndDate('');
            loadAll();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to add academic year');
        }
    };

    const handleAddClass = async (e: SyntheticEvent<HTMLFormElement>) => {
        e.preventDefault();
        try {
            await apiFetch('/api/v1/academics/classes', token, {
                method: 'POST',
                body: JSON.stringify({
                    name: className,
                    numeric_level: numericLevel ? Number(numericLevel) : null,
                }),
            });
            setClassName('');
            setNumericLevel('');
            loadAll();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to add class');
        }
    };

    const handleAddSection = async (e: SyntheticEvent<HTMLFormElement>) => {
        e.preventDefault();
        try {
            await apiFetch('/api/v1/academics/sections', token, {
                method: 'POST',
                body: JSON.stringify({
                    class_id: selectedClassId,
                    name: sectionName,
                }),
            });
            setSectionName('');
            loadAll();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to add section');
        }
    };

    const handleAddSubject = async (e: SyntheticEvent<HTMLFormElement>) => {
        e.preventDefault();
        try {
            await apiFetch('/api/v1/academics/subjects', token, {
                method: 'POST',
                body: JSON.stringify({ name: subjectName, code: subjectCode }),
            });
            setSubjectName('');
            setSubjectCode('');
            loadAll();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to add subject');
        }
    };

    return (
        <>
            <AppBar position="static">
                <Toolbar>
                    <Typography variant="h6" sx={{ flexGrow: 1 }}>
                        Academic Structure
                    </Typography>
                    <Button color="inherit" component={RouterLink} to="/dashboard">
                        Back to Dashboard
                    </Button>
                </Toolbar>
            </AppBar>

            <Container maxWidth="md" sx={{ mt: 4 }}>
                {error && (
                    <Alert severity="error" sx={{ mb: 2 }}>
                        {error}
                    </Alert>
                )}

                <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
                    <Tab label="Academic Years" />
                    <Tab label="Classes & Sections" />
                    <Tab label="Subjects" />
                </Tabs>

                {tab === 0 && (
                    <Stack spacing={3}>
                        <Card>
                            <CardContent>
                                <Typography variant="h6" gutterBottom>Add Academic Year</Typography>
                                <Box component="form" onSubmit={handleAddYear} sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                                    <TextField label="Name (e.g. 2026-2027)" value={yearName} onChange={(e) => setYearName(e.target.value)} required />
                                    <DateInput label="Start Date" value={startDate} onChange={setStartDate} required />
                                    <DateInput label="End Date" value={endDate} onChange={setEndDate} required />
                                    <Button type="submit" variant="contained">Add</Button>
                                </Box>
                            </CardContent>
                        </Card>
                        {years.map((y) => (
                            <Card key={y.id} variant="outlined">
                                <CardContent sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Box>
                                        <Typography variant="subtitle1">{y.name}</Typography>
                                        <Typography variant="body2" color="text.secondary">
                                            {formatDate(y.start_date)} to {formatDate(y.end_date)}
                                        </Typography>
                                    </Box>
                                    {y.is_current && <Chip label="Current" color="success" size="small" />}
                                </CardContent>
                            </Card>
                        ))}
                    </Stack>
                )}

                {tab === 1 && (
                    <Stack spacing={3}>
                        <Card>
                            <CardContent>
                                <Typography variant="h6" gutterBottom>Add Class</Typography>
                                <Box component="form" onSubmit={handleAddClass} sx={{ display: 'flex', gap: 2 }}>
                                    <TextField label="Class Name (e.g. Grade 10)" value={className} onChange={(e) => setClassName(e.target.value)} required />
                                    <TextField label="Level (e.g. 10)" type="number" value={numericLevel} onChange={(e) => setNumericLevel(e.target.value)} />
                                    <Button type="submit" variant="contained">Add Class</Button>
                                </Box>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardContent>
                                <Typography variant="h6" gutterBottom>Add Section to Class</Typography>
                                <Box component="form" onSubmit={handleAddSection} sx={{ display: 'flex', gap: 2 }}>
                                    <TextField select label="Select Class" value={selectedClassId} onChange={(e) => setSelectedClassId(e.target.value)} required sx={{ minWidth: 200 }}>
                                        {classes.map((c) => (
                                            <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
                                        ))}
                                    </TextField>
                                    <TextField label="Section (e.g. A)" value={sectionName} onChange={(e) => setSectionName(e.target.value)} required />
                                    <Button type="submit" variant="contained">Add Section</Button>
                                </Box>
                            </CardContent>
                        </Card>

                        {classes.map((c) => (
                            <Card key={c.id} variant="outlined">
                                <CardContent>
                                    <Typography variant="subtitle1">{c.name}</Typography>
                                    <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
                                        {c.sections?.length ? (
                                            c.sections.map((sec) => <Chip key={sec.id} label={`Section ${sec.name}`} size="small" />)
                                        ) : (
                                            <Typography variant="body2" color="text.secondary">No sections yet</Typography>
                                        )}
                                    </Box>
                                </CardContent>
                            </Card>
                        ))}
                    </Stack>
                )}

                {tab === 2 && (
                    <Stack spacing={3}>
                        <Card>
                            <CardContent>
                                <Typography variant="h6" gutterBottom>Add Subject</Typography>
                                <Box component="form" onSubmit={handleAddSubject} sx={{ display: 'flex', gap: 2 }}>
                                    <TextField label="Subject Name (e.g. Mathematics)" value={subjectName} onChange={(e) => setSubjectName(e.target.value)} required />
                                    <TextField label="Code (e.g. MATH-101)" value={subjectCode} onChange={(e) => setSubjectCode(e.target.value)} required />
                                    <Button type="submit" variant="contained">Add Subject</Button>
                                </Box>
                            </CardContent>
                        </Card>
                        {subjects.map((s) => (
                            <Card key={s.id} variant="outlined">
                                <CardContent sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <Typography variant="subtitle1">{s.name}</Typography>
                                    <Chip label={s.code} size="small" />
                                </CardContent>
                            </Card>
                        ))}
                    </Stack>
                )}
            </Container>
        </>
    );
}