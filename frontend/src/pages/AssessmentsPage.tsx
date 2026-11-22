import { useEffect, useState, type ChangeEvent, type SyntheticEvent } from 'react';
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
    Link,
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
import { supabase } from '../lib/supabase';

import DateInput from '../components/DateInput';
import { formatDate } from '../lib/date';

interface AcademicYear { id: string; name: string }
interface ClassItem { id: string; name: string; sections: { id: string; name: string }[] }
interface SubjectItem { id: string; name: string; code: string }

interface ExamItem {
    id: string;
    name: string;
    start_date: string;
    end_date: string;
    academic_year_id: string;
    class_id: string;
    academic_year: { id: string; name: string } | null;
    class: { id: string; name: string } | null;
}

interface MarkRosterRow {
    student_id: string;
    roll_number: string | null;
    full_name: string;
    marks_obtained: string | number;
    max_marks: number;
    remarks: string;
}

interface ReportCard {
    overall_percentage: number;
    overall_grade: string;
    items: {
        id: string;
        exam_name: string;
        subject_name: string;
        subject_code: string;
        marks_obtained: number;
        max_marks: number;
        percentage: number;
        grade: string;
        remarks: string | null;
    }[];
}

interface AssignmentItem {
    id: string;
    title: string;
    description: string | null;
    due_date: string;
    file_url: string | null;
    class: { name: string } | null;
    section: { name: string } | null;
    subject: { name: string; code: string } | null;
}

export default function AssessmentsPage() {
    const { session, profile } = useAuth();
    const token = session?.access_token ?? '';
    const isStaff = profile?.role === 'admin' || profile?.role === 'teacher';

    const [tab, setTab] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // Reference data
    const [years, setYears] = useState<AcademicYear[]>([]);
    const [classes, setClasses] = useState<ClassItem[]>([]);
    const [subjects, setSubjects] = useState<SubjectItem[]>([]);
    const [exams, setExams] = useState<ExamItem[]>([]);
    const [assignments, setAssignments] = useState<AssignmentItem[]>([]);
    const [reportCard, setReportCard] = useState<ReportCard | null>(null);

    // Create Exam form
    const [examName, setExamName] = useState('');
    const [examYearId, setExamYearId] = useState('');
    const [examClassId, setExamClassId] = useState('');
    const [examStart, setExamStart] = useState('');
    const [examEnd, setExamEnd] = useState('');

    // Marks entry filter + roster
    const [selectedExamId, setSelectedExamId] = useState('');
    const [markSectionId, setMarkSectionId] = useState('');
    const [markSubjectId, setMarkSubjectId] = useState('');
    const [marksRoster, setMarksRoster] = useState<MarkRosterRow[]>([]);

    // Assignment form
    const [assignTitle, setAssignTitle] = useState('');
    const [assignDesc, setAssignDesc] = useState('');
    const [assignClassId, setAssignClassId] = useState('');
    const [assignSectionId, setAssignSectionId] = useState('');
    const [assignSubjectId, setAssignSubjectId] = useState('');
    const [assignDueDate, setAssignDueDate] = useState('');
    const [assignFile, setAssignFile] = useState<File | null>(null);

    const loadData = async () => {
        if (!token) return;
        try {
            setError(null);
            const [e, a] = await Promise.all([
                apiFetch<ExamItem[]>('/api/v1/assessments/exams', token),
                apiFetch<AssignmentItem[]>('/api/v1/assessments/assignments', token),
            ]);
            setExams(e);
            setAssignments(a);

            if (isStaff) {
                const [y, c, s] = await Promise.all([
                    apiFetch<AcademicYear[]>('/api/v1/academics/academic-years', token),
                    apiFetch<ClassItem[]>('/api/v1/academics/classes', token),
                    apiFetch<SubjectItem[]>('/api/v1/academics/subjects', token),
                ]);
                setYears(y);
                setClasses(c);
                setSubjects(s);
            } else {
                const rc = await apiFetch<ReportCard>('/api/v1/assessments/my-report-card', token);
                setReportCard(rc);
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to load data');
        }
    };

    useEffect(() => {
        loadData();
    }, [token, isStaff]);

    const uploadFileToStorage = async (file: File, folder: string): Promise<string> => {
        const filePath = `${folder}/${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
        const { error: uploadErr } = await supabase.storage
            .from('school-files')
            .upload(filePath, file);
        if (uploadErr) throw new Error(`File upload failed: ${uploadErr.message}`);
        const { data } = supabase.storage.from('school-files').getPublicUrl(filePath);
        return data.publicUrl;
    };

    const handleCreateExam = async (e: SyntheticEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);
        try {
            await apiFetch('/api/v1/assessments/exams', token, {
                method: 'POST',
                body: JSON.stringify({
                    name: examName,
                    academic_year_id: examYearId,
                    class_id: examClassId,
                    start_date: examStart,
                    end_date: examEnd,
                }),
            });
            setExamName('');
            setSuccess('Exam created.');
            loadData();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to create exam');
        }
    };

    const selectedExam = exams.find((ex) => ex.id === selectedExamId);
    const markClass = classes.find((c) => c.id === selectedExam?.class_id);
    const assignClass = classes.find((c) => c.id === assignClassId);

    const loadMarksRoster = async () => {
        if (!selectedExam || !markSectionId || !markSubjectId) return;
        setError(null);
        try {
            const params = new URLSearchParams({
                exam_id: selectedExam.id,
                academic_year_id: selectedExam.academic_year_id,
                class_id: selectedExam.class_id,
                section_id: markSectionId,
                subject_id: markSubjectId,
            });
            const data = await apiFetch<MarkRosterRow[]>(
                `/api/v1/assessments/marks/roster?${params.toString()}`,
                token
            );
            setMarksRoster(data);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to load marks roster');
        }
    };

    const handleSaveMarks = async () => {
        setError(null);
        setSuccess(null);
        try {
            const validRecords = marksRoster
                .filter((r) => r.marks_obtained !== '')
                .map((r) => ({
                    student_id: r.student_id,
                    marks_obtained: Number(r.marks_obtained),
                    max_marks: Number(r.max_marks),
                    remarks: r.remarks || null,
                }));
            const res = await apiFetch<{ saved_count: number }>(
                '/api/v1/assessments/marks/bulk',
                token,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        exam_id: selectedExamId,
                        subject_id: markSubjectId,
                        records: validRecords,
                    }),
                }
            );
            setSuccess(`Saved marks for ${res.saved_count} student(s).`);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to save marks');
        }
    };

    const handleCreateAssignment = async (e: SyntheticEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);
        try {
            let fileUrl: string | null = null;
            if (assignFile) {
                fileUrl = await uploadFileToStorage(assignFile, 'assignments');
            }
            await apiFetch('/api/v1/assessments/assignments', token, {
                method: 'POST',
                body: JSON.stringify({
                    title: assignTitle,
                    description: assignDesc || null,
                    class_id: assignClassId,
                    section_id: assignSectionId,
                    subject_id: assignSubjectId,
                    due_date: assignDueDate,
                    file_url: fileUrl,
                }),
            });
            setAssignTitle('');
            setAssignDesc('');
            setAssignFile(null);
            setSuccess('Assignment published.');
            loadData();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to create assignment');
        }
    };

    const handleStudentSubmit = async (assignmentId: string, e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setError(null);
        setSuccess(null);
        try {
            const fileUrl = await uploadFileToStorage(file, 'submissions');
            await apiFetch(`/api/v1/assessments/assignments/${assignmentId}/submit`, token, {
                method: 'POST',
                body: JSON.stringify({ file_url: fileUrl }),
            });
            setSuccess('Assignment submitted successfully.');
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Submission failed');
        }
    };

    return (
        <>
            <AppBar position="static">
                <Toolbar>
                    <Typography variant="h6" sx={{ flexGrow: 1 }}>
                        Exams, Gradebook &amp; Assignments
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
                    <Tab label={isStaff ? 'Exams & Marks Entry' : 'My Report Card'} />
                    <Tab label="Assignments" />
                </Tabs>

                {tab === 0 && (
                    isStaff ? (
                        <Stack spacing={3}>
                            <Card>
                                <CardContent>
                                    <Typography variant="h6" gutterBottom>Create Exam</Typography>
                                    <Box component="form" onSubmit={handleCreateExam} sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                                        <TextField label="Exam Name" value={examName} onChange={(e) => setExamName(e.target.value)} required />
                                        <TextField select label="Academic Year" value={examYearId} onChange={(e) => setExamYearId(e.target.value)} required sx={{ minWidth: 150 }}>
                                            {years.map((y) => <MenuItem key={y.id} value={y.id}>{y.name}</MenuItem>)}
                                        </TextField>
                                        <TextField select label="Class" value={examClassId} onChange={(e) => setExamClassId(e.target.value)} required sx={{ minWidth: 150 }}>
                                            {classes.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                                        </TextField>
                                        <DateInput label="Start Date" value={examStart} onChange={setExamStart} required />
                                        <DateInput label="End Date" value={examEnd} onChange={setExamEnd} required />
                                        <Button type="submit" variant="contained">Create</Button>
                                    </Box>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardContent>
                                    <Typography variant="h6" gutterBottom>Enter Marks</Typography>
                                    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                                        <TextField select label="Exam" value={selectedExamId} onChange={(e) => { setSelectedExamId(e.target.value); setMarkSectionId(''); }} sx={{ minWidth: 200 }}>
                                            {exams.map((ex) => <MenuItem key={ex.id} value={ex.id}>{ex.name} ({ex.class?.name})</MenuItem>)}
                                        </TextField>
                                        <TextField select label="Section" value={markSectionId} onChange={(e) => setMarkSectionId(e.target.value)} disabled={!markClass} sx={{ minWidth: 140 }}>
                                            {markClass?.sections.map((s) => <MenuItem key={s.id} value={s.id}>Section {s.name}</MenuItem>)}
                                        </TextField>
                                        <TextField select label="Subject" value={markSubjectId} onChange={(e) => setMarkSubjectId(e.target.value)} sx={{ minWidth: 180 }}>
                                            {subjects.map((sub) => <MenuItem key={sub.id} value={sub.id}>{sub.name}</MenuItem>)}
                                        </TextField>
                                        <Button variant="contained" onClick={loadMarksRoster} disabled={!selectedExamId || !markSectionId || !markSubjectId}>
                                            Load Students
                                        </Button>
                                    </Box>
                                </CardContent>
                            </Card>

                            {marksRoster.length > 0 && (
                                <>
                                    <TableContainer component={Paper}>
                                        <Table>
                                            <TableHead>
                                                <TableRow>
                                                    <TableCell>Roll No.</TableCell>
                                                    <TableCell>Student</TableCell>
                                                    <TableCell>Marks Obtained</TableCell>
                                                    <TableCell>Max Marks</TableCell>
                                                    <TableCell>Remarks</TableCell>
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {marksRoster.map((row, idx) => (
                                                    <TableRow key={row.student_id}>
                                                        <TableCell>{row.roll_number || '—'}</TableCell>
                                                        <TableCell>{row.full_name}</TableCell>
                                                        <TableCell>
                                                            <TextField
                                                                size="small"
                                                                type="number"
                                                                value={row.marks_obtained}
                                                                onChange={(e) => {
                                                                    const next = [...marksRoster];
                                                                    next[idx] = { ...row, marks_obtained: e.target.value };
                                                                    setMarksRoster(next);
                                                                }}
                                                                sx={{ width: 110 }}
                                                            />
                                                        </TableCell>
                                                        <TableCell>
                                                            <TextField
                                                                size="small"
                                                                type="number"
                                                                value={row.max_marks}
                                                                onChange={(e) => {
                                                                    const next = [...marksRoster];
                                                                    next[idx] = { ...row, max_marks: Number(e.target.value) };
                                                                    setMarksRoster(next);
                                                                }}
                                                                sx={{ width: 110 }}
                                                            />
                                                        </TableCell>
                                                        <TableCell>
                                                            <TextField
                                                                size="small"
                                                                value={row.remarks}
                                                                onChange={(e) => {
                                                                    const next = [...marksRoster];
                                                                    next[idx] = { ...row, remarks: e.target.value };
                                                                    setMarksRoster(next);
                                                                }}
                                                            />
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </TableContainer>
                                    <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                                        <Button variant="contained" size="large" onClick={handleSaveMarks}>
                                            Save Marks
                                        </Button>
                                    </Box>
                                </>
                            )}
                        </Stack>
                    ) : (
                        <Stack spacing={3}>
                            {reportCard && (
                                <>
                                    <Card>
                                        <CardContent sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                                            <Typography variant="h5">
                                                Overall: {reportCard.overall_percentage}%
                                            </Typography>
                                            <Chip label={`Grade ${reportCard.overall_grade}`} color="primary" />
                                        </CardContent>
                                    </Card>
                                    <TableContainer component={Paper}>
                                        <Table>
                                            <TableHead>
                                                <TableRow>
                                                    <TableCell>Exam</TableCell>
                                                    <TableCell>Subject</TableCell>
                                                    <TableCell>Score</TableCell>
                                                    <TableCell>Grade</TableCell>
                                                    <TableCell>Remarks</TableCell>
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {reportCard.items.map((item) => (
                                                    <TableRow key={item.id}>
                                                        <TableCell>{item.exam_name}</TableCell>
                                                        <TableCell>{item.subject_name} ({item.subject_code})</TableCell>
                                                        <TableCell>{item.marks_obtained} / {item.max_marks} ({item.percentage}%)</TableCell>
                                                        <TableCell><Chip label={item.grade} size="small" /></TableCell>
                                                        <TableCell>{item.remarks || '—'}</TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </TableContainer>
                                </>
                            )}
                        </Stack>
                    )
                )}

                {tab === 1 && (
                    <Stack spacing={3}>
                        {isStaff && (
                            <Card>
                                <CardContent>
                                    <Typography variant="h6" gutterBottom>Publish Assignment</Typography>
                                    <Box component="form" onSubmit={handleCreateAssignment} sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                                        <TextField label="Title" value={assignTitle} onChange={(e) => setAssignTitle(e.target.value)} required />
                                        <TextField label="Description" value={assignDesc} onChange={(e) => setAssignDesc(e.target.value)} sx={{ minWidth: 220 }} />
                                        <TextField select label="Class" value={assignClassId} onChange={(e) => { setAssignClassId(e.target.value); setAssignSectionId(''); }} required sx={{ minWidth: 140 }}>
                                            {classes.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                                        </TextField>
                                        <TextField select label="Section" value={assignSectionId} onChange={(e) => setAssignSectionId(e.target.value)} disabled={!assignClass} required sx={{ minWidth: 130 }}>
                                            {assignClass?.sections.map((s) => <MenuItem key={s.id} value={s.id}>Section {s.name}</MenuItem>)}
                                        </TextField>
                                        <TextField select label="Subject" value={assignSubjectId} onChange={(e) => setAssignSubjectId(e.target.value)} required sx={{ minWidth: 160 }}>
                                            {subjects.map((sub) => <MenuItem key={sub.id} value={sub.id}>{sub.name}</MenuItem>)}
                                        </TextField>
                                        <DateInput label="Due Date" value={assignDueDate} onChange={setAssignDueDate} required />
                                        <Button variant="outlined" component="label">
                                            {assignFile ? assignFile.name : 'Attach File'}
                                            <input type="file" hidden onChange={(e) => setAssignFile(e.target.files?.[0] ?? null)} />
                                        </Button>
                                        <Button type="submit" variant="contained">Publish</Button>
                                    </Box>
                                </CardContent>
                            </Card>
                        )}

                        {assignments.map((a) => (
                            <Card key={a.id} variant="outlined">
                                <CardContent sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
                                    <Box>
                                        <Typography variant="subtitle1">{a.title}</Typography>
                                        <Typography variant="body2" color="text.secondary">
                                            {a.class?.name} - Section {a.section?.name} | {a.subject?.name} | Due: {formatDate(a.due_date)}
                                        </Typography>
                                        {a.description && <Typography variant="body2" sx={{ mt: 1 }}>{a.description}</Typography>}
                                        {a.file_url && (
                                            <Link href={a.file_url} target="_blank" rel="noopener" sx={{ display: 'inline-block', mt: 1 }}>
                                                Download Attachment
                                            </Link>
                                        )}
                                    </Box>
                                    {profile?.role === 'student' && (
                                        <Button variant="contained" component="label" size="small">
                                            Upload Submission
                                            <input type="file" hidden onChange={(e) => handleStudentSubmit(a.id, e)} />
                                        </Button>
                                    )}
                                </CardContent>
                            </Card>
                        ))}
                    </Stack>
                )}
            </Container>
        </>
    );
}