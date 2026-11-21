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

interface AcademicYear { id: string; name: string }
interface ClassItem { id: string; name: string }
interface StudentItem { id: string; full_name: string; email: string }

interface FeeStructure {
    id: string;
    name: string;
    amount: number;
    due_date: string;
    academic_year: { id: string; name: string } | null;
    class: { id: string; name: string } | null;
}

interface FeePayment {
    id: string;
    amount_paid: number;
    status: 'pending' | 'partial' | 'paid';
    payment_date: string;
    receipt_number: string;
    remarks: string | null;
    student: { id: string; full_name: string } | null;
    fee_structure: { id: string; name: string; amount: number; due_date: string } | null;
}

export default function FeesPage() {
    const { session, profile } = useAuth();
    const token = session?.access_token ?? '';
    const isAdmin = profile?.role === 'admin';

    const [tab, setTab] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // Data
    const [years, setYears] = useState<AcademicYear[]>([]);
    const [classes, setClasses] = useState<ClassItem[]>([]);
    const [students, setStudents] = useState<StudentItem[]>([]);
    const [structures, setStructures] = useState<FeeStructure[]>([]);
    const [payments, setPayments] = useState<FeePayment[]>([]);

    // Fee Structure form
    const [feeName, setFeeName] = useState('');
    const [feeYearId, setFeeYearId] = useState('');
    const [feeClassId, setFeeClassId] = useState('');
    const [feeAmount, setFeeAmount] = useState('');
    const [feeDueDate, setFeeDueDate] = useState('');

    // Payment form
    const [payStudentId, setPayStudentId] = useState('');
    const [payStructureId, setPayStructureId] = useState('');
    const [payAmount, setPayAmount] = useState('');
    const [payRemarks, setPayRemarks] = useState('');

    const loadData = async () => {
        if (!token) return;
        try {
            setError(null);
            const [st, pay] = await Promise.all([
                apiFetch<FeeStructure[]>('/api/v1/fees/structures', token),
                apiFetch<FeePayment[]>('/api/v1/fees/payments', token),
            ]);
            setStructures(st);
            setPayments(pay);

            if (isAdmin) {
                const [y, c, stu] = await Promise.all([
                    apiFetch<AcademicYear[]>('/api/v1/academics/academic-years', token),
                    apiFetch<ClassItem[]>('/api/v1/academics/classes', token),
                    apiFetch<StudentItem[]>('/api/v1/users?role=student', token),
                ]);
                setYears(y);
                setClasses(c);
                setStudents(stu);
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to load fee data');
        }
    };

    useEffect(() => {
        loadData();
    }, [token, isAdmin]);

    const handleCreateStructure = async (e: SyntheticEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);
        try {
            await apiFetch('/api/v1/fees/structures', token, {
                method: 'POST',
                body: JSON.stringify({
                    name: feeName,
                    academic_year_id: feeYearId,
                    class_id: feeClassId,
                    amount: Number(feeAmount),
                    due_date: feeDueDate,
                }),
            });
            setFeeName('');
            setFeeAmount('');
            setSuccess('Fee structure created.');
            loadData();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to create fee structure');
        }
    };

    const handleRecordPayment = async (e: SyntheticEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError(null);
        setSuccess(null);
        try {
            const res = await apiFetch<{ receipt_number: string }>('/api/v1/fees/payments', token, {
                method: 'POST',
                body: JSON.stringify({
                    student_id: payStudentId,
                    fee_structure_id: payStructureId,
                    amount_paid: Number(payAmount),
                    remarks: payRemarks || null,
                }),
            });
            setPayAmount('');
            setPayRemarks('');
            setSuccess(`Payment recorded. Receipt: ${res.receipt_number}`);
            loadData();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to record payment');
        }
    };

    return (
        <>
            <AppBar position="static">
                <Toolbar>
                    <Typography variant="h6" sx={{ flexGrow: 1 }}>
                        Fee Management
                    </Typography>
                    <Button color="inherit" component={RouterLink} to="/dashboard">
                        Back to Dashboard
                    </Button>
                </Toolbar>
            </AppBar>

            <Container maxWidth="lg" sx={{ mt: 4 }}>
                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

                {isAdmin ? (
                    <>
                        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
                            <Tab label="Fee Structures" />
                            <Tab label="Payments & Receipts" />
                        </Tabs>

                        {tab === 0 && (
                            <Stack spacing={3}>
                                <Card>
                                    <CardContent>
                                        <Typography variant="h6" gutterBottom>Add Fee Structure</Typography>
                                        <Box component="form" onSubmit={handleCreateStructure} sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                                            <TextField label="Fee Name (e.g. Term 1 Tuition)" value={feeName} onChange={(e) => setFeeName(e.target.value)} required />
                                            <TextField select label="Academic Year" value={feeYearId} onChange={(e) => setFeeYearId(e.target.value)} required sx={{ minWidth: 150 }}>
                                                {years.map((y) => <MenuItem key={y.id} value={y.id}>{y.name}</MenuItem>)}
                                            </TextField>
                                            <TextField select label="Class" value={feeClassId} onChange={(e) => setFeeClassId(e.target.value)} required sx={{ minWidth: 150 }}>
                                                {classes.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                                            </TextField>
                                            <TextField label="Amount" type="number" value={feeAmount} onChange={(e) => setFeeAmount(e.target.value)} required sx={{ width: 130 }} />
                                            <TextField label="Due Date" type="date" value={feeDueDate} onChange={(e) => setFeeDueDate(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} required />
                                            <Button type="submit" variant="contained">Create</Button>
                                        </Box>
                                    </CardContent>
                                </Card>

                                <TableContainer component={Paper}>
                                    <Table>
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>Fee Name</TableCell>
                                                <TableCell>Academic Year</TableCell>
                                                <TableCell>Class</TableCell>
                                                <TableCell>Amount</TableCell>
                                                <TableCell>Due Date</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {structures.map((s) => (
                                                <TableRow key={s.id}>
                                                    <TableCell>{s.name}</TableCell>
                                                    <TableCell>{s.academic_year?.name}</TableCell>
                                                    <TableCell>{s.class?.name}</TableCell>
                                                    <TableCell>₹{s.amount}</TableCell>
                                                    <TableCell>{s.due_date}</TableCell>
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
                                        <Typography variant="h6" gutterBottom>Record Fee Payment</Typography>
                                        <Box component="form" onSubmit={handleRecordPayment} sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                                            <TextField select label="Student" value={payStudentId} onChange={(e) => setPayStudentId(e.target.value)} required sx={{ minWidth: 200 }}>
                                                {students.map((stu) => <MenuItem key={stu.id} value={stu.id}>{stu.full_name}</MenuItem>)}
                                            </TextField>
                                            <TextField select label="Fee Structure" value={payStructureId} onChange={(e) => setPayStructureId(e.target.value)} required sx={{ minWidth: 220 }}>
                                                {structures.map((st) => (
                                                    <MenuItem key={st.id} value={st.id}>
                                                        {st.name} (₹{st.amount})
                                                    </MenuItem>
                                                ))}
                                            </TextField>
                                            <TextField label="Amount Paid" type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} required sx={{ width: 140 }} />
                                            <TextField label="Remarks (optional)" value={payRemarks} onChange={(e) => setPayRemarks(e.target.value)} />
                                            <Button type="submit" variant="contained">Record Payment</Button>
                                        </Box>
                                    </CardContent>
                                </Card>

                                <TableContainer component={Paper}>
                                    <Table>
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>Receipt No.</TableCell>
                                                <TableCell>Date</TableCell>
                                                <TableCell>Student</TableCell>
                                                <TableCell>Fee</TableCell>
                                                <TableCell>Amount Paid</TableCell>
                                                <TableCell>Status</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {payments.map((p) => (
                                                <TableRow key={p.id}>
                                                    <TableCell><strong>{p.receipt_number}</strong></TableCell>
                                                    <TableCell>{p.payment_date}</TableCell>
                                                    <TableCell>{p.student?.full_name}</TableCell>
                                                    <TableCell>{p.fee_structure?.name}</TableCell>
                                                    <TableCell>₹{p.amount_paid} / ₹{p.fee_structure?.amount}</TableCell>
                                                    <TableCell>
                                                        <Chip
                                                            label={p.status.toUpperCase()}
                                                            color={p.status === 'paid' ? 'success' : 'warning'}
                                                            size="small"
                                                        />
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            </Stack>
                        )}
                    </>
                ) : (
                    <Stack spacing={3}>
                        <Typography variant="h5">My Fee Payments &amp; Receipts</Typography>
                        <TableContainer component={Paper}>
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Receipt No.</TableCell>
                                        <TableCell>Date</TableCell>
                                        <TableCell>Fee</TableCell>
                                        <TableCell>Amount Paid</TableCell>
                                        <TableCell>Status</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {payments.map((p) => (
                                        <TableRow key={p.id}>
                                            <TableCell><strong>{p.receipt_number}</strong></TableCell>
                                            <TableCell>{p.payment_date}</TableCell>
                                            <TableCell>{p.fee_structure?.name}</TableCell>
                                            <TableCell>₹{p.amount_paid} / ₹{p.fee_structure?.amount}</TableCell>
                                            <TableCell>
                                                <Chip
                                                    label={p.status.toUpperCase()}
                                                    color={p.status === 'paid' ? 'success' : 'warning'}
                                                    size="small"
                                                />
                                            </TableCell>
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