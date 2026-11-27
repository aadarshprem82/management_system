import { useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Checkbox,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControlLabel,
    FormGroup,
    MenuItem,
    Paper,
    Stack,
    Step,
    StepLabel,
    Stepper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Typography,
} from '@mui/material';
import { apiFetch } from '../../lib/api';
import DateInput from '../DateInput';
import { formatDate } from '../../lib/date';

interface AcademicYearOption {
    id: string;
    name: string;
    start_date: string;
    end_date: string;
}

interface CampusOption {
    id: string;
    name: string;
    code: string;
}

interface PreviewResponse {
    source_year: AcademicYearOption;
    target_year: {
        name: string;
        start_date: string;
        end_date: string;
        is_current: boolean;
        campus_id: string | null;
    };
    warnings: string[];
    has_conflicts: boolean;
    records_to_clone: {
        terms: Array<{ name: string; source_start_date: string; source_end_date: string; start_date: string; end_date: string }>;
        calendar_days: Array<{ title: string; day_type: string; source_day_date: string; day_date: string }>;
        fee_structures: Array<{ name: string; amount: number; source_due_date: string; due_date: string }>;
        numbering_sequences: Array<{ sequence_type: string; prefix: string; reset_policy: string }>;
        exams: Array<{ name: string; source_start_date: string; start_date: string; end_date: string }>;
    };
    counts: {
        terms: number;
        calendar_days: number;
        fee_structures: number;
        numbering_sequences: number;
        exams: number;
    };
    excluded_student_transactions: {
        enrollments: number;
        attendance: number;
        fee_payments: number;
        exam_marks: number;
        copied: number;
    };
}

interface CloneExecuteResponse {
    academic_year: AcademicYearOption;
    created_counts: {
        terms: number;
        calendar_days: number;
        fee_structures: number;
        numbering_sequences: number;
        exams: number;
    };
    excluded_student_transactions: {
        enrollments: number;
        attendance: number;
        fee_payments: number;
        exam_marks: number;
        copied: number;
    };
}

interface YearCloneWizardDialogProps {
    open: boolean;
    onClose: () => void;
    token: string;
    academicYears: AcademicYearOption[];
    campuses: CampusOption[];
    onCloned: () => void;
}

const STEPS = ['Configure Target Year', 'Preview Records', 'Confirm & Clone'];

export default function YearCloneWizardDialog({
    open,
    onClose,
    token,
    academicYears,
    campuses,
    onCloned,
}: YearCloneWizardDialogProps) {
    const [activeStep, setActiveStep] = useState(0);
    const [sourceYearId, setSourceYearId] = useState('');
    const [targetName, setTargetName] = useState('');
    const [targetStartDate, setTargetStartDate] = useState('');
    const [targetEndDate, setTargetEndDate] = useState('');
    const [campusId, setCampusId] = useState('');
    const [targetIsCurrent, setTargetIsCurrent] = useState(false);

    const [includeTerms, setIncludeTerms] = useState(true);
    const [includeCalendarDays, setIncludeCalendarDays] = useState(true);
    const [includeFeeStructures, setIncludeFeeStructures] = useState(true);
    const [includeSequences, setIncludeSequences] = useState(true);
    const [includeExams, setIncludeExams] = useState(false);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [preview, setPreview] = useState<PreviewResponse | null>(null);
    const [result, setResult] = useState<CloneExecuteResponse | null>(null);

    const resetWizard = () => {
        setActiveStep(0);
        setError(null);
        setPreview(null);
        setResult(null);
    };

    const handleClose = () => {
        resetWizard();
        onClose();
    };

    const buildPayload = () => ({
        target_name: targetName.trim(),
        target_start_date: targetStartDate,
        target_end_date: targetEndDate,
        target_is_current: targetIsCurrent,
        campus_id: campusId || null,
        include_terms: includeTerms,
        include_calendar_days: includeCalendarDays,
        include_fee_structures: includeFeeStructures,
        include_sequences: includeSequences,
        include_exams: includeExams,
    });

    const handlePreview = async () => {
        if (!sourceYearId || !targetName.trim() || !targetStartDate || !targetEndDate) {
            setError('Please select a source academic year and fill in the target year name and dates.');
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const data = await apiFetch<PreviewResponse>(
                `/api/v1/config/academic-years/${sourceYearId}/clone/preview`,
                token,
                {
                    method: 'POST',
                    body: JSON.stringify(buildPayload()),
                }
            );
            setPreview(data);
            setActiveStep(1);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to generate clone preview');
        } finally {
            setLoading(false);
        }
    };

    const handleExecuteClone = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await apiFetch<CloneExecuteResponse>(
                `/api/v1/config/academic-years/${sourceYearId}/clone`,
                token,
                {
                    method: 'POST',
                    body: JSON.stringify(buildPayload()),
                }
            );
            setResult(data);
            setActiveStep(2);
            onCloned();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to clone academic year');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
            <DialogTitle>Academic Year Cloning Wizard</DialogTitle>
            <DialogContent dividers>
                <Stepper activeStep={activeStep} sx={{ mb: 3 }}>
                    {STEPS.map((label) => (
                        <Step key={label}>
                            <StepLabel>{label}</StepLabel>
                        </Step>
                    ))}
                </Stepper>

                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                {activeStep === 0 && (
                    <Stack spacing={2.5}>
                        <Alert severity="info">
                            Cloning copies structural templates (terms, calendar holidays/events, fee structures,
                            and numbering rules) with shifted dates. Student transactions (enrollments, attendance,
                            exam marks, submissions, and fee payments) are <strong>never</strong> copied.
                        </Alert>

                        <TextField
                            select
                            label="Source Academic Year"
                            value={sourceYearId}
                            onChange={(e) => setSourceYearId(e.target.value)}
                            required
                            fullWidth
                        >
                            {academicYears.map((y) => (
                                <MenuItem key={y.id} value={y.id}>
                                    {y.name} ({formatDate(y.start_date)} – {formatDate(y.end_date)})
                                </MenuItem>
                            ))}
                        </TextField>

                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                            <TextField
                                label="Target Academic Year Name"
                                placeholder="e.g. 2027-2028"
                                value={targetName}
                                onChange={(e) => setTargetName(e.target.value)}
                                required
                                fullWidth
                            />
                            <TextField
                                select
                                label="Campus Scope (Optional)"
                                value={campusId}
                                onChange={(e) => setCampusId(e.target.value)}
                                fullWidth
                            >
                                <MenuItem value="">All / Inherit</MenuItem>
                                {campuses.map((c) => (
                                    <MenuItem key={c.id} value={c.id}>
                                        {c.name} ({c.code})
                                    </MenuItem>
                                ))}
                            </TextField>
                        </Stack>

                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                            <DateInput
                                label="Target Start Date"
                                value={targetStartDate}
                                onChange={setTargetStartDate}
                                required
                            />
                            <DateInput
                                label="Target End Date"
                                value={targetEndDate}
                                onChange={setTargetEndDate}
                                required
                            />
                        </Stack>

                        <FormGroup row>
                            <FormControlLabel
                                control={<Checkbox checked={includeTerms} onChange={(e) => setIncludeTerms(e.target.checked)} />}
                                label="Terms"
                            />
                            <FormControlLabel
                                control={<Checkbox checked={includeCalendarDays} onChange={(e) => setIncludeCalendarDays(e.target.checked)} />}
                                label="Calendar Holidays & Events"
                            />
                            <FormControlLabel
                                control={<Checkbox checked={includeFeeStructures} onChange={(e) => setIncludeFeeStructures(e.target.checked)} />}
                                label="Fee Structures"
                            />
                            <FormControlLabel
                                control={<Checkbox checked={includeSequences} onChange={(e) => setIncludeSequences(e.target.checked)} />}
                                label="Yearly Sequences (Reset to 1)"
                            />
                            <FormControlLabel
                                control={<Checkbox checked={includeExams} onChange={(e) => setIncludeExams(e.target.checked)} />}
                                label="Exam Templates"
                            />
                            <FormControlLabel
                                control={<Checkbox checked={targetIsCurrent} onChange={(e) => setTargetIsCurrent(e.target.checked)} />}
                                label="Set Target as Current Year"
                            />
                        </FormGroup>
                    </Stack>
                )}

                {activeStep === 1 && preview && (
                    <Stack spacing={2.5}>
                        {preview.warnings.length > 0 && (
                            <Alert severity="error">
                                {preview.warnings.map((w) => (
                                    <div key={w}>{w}</div>
                                ))}
                            </Alert>
                        )}

                        <Paper variant="outlined" sx={{ p: 2 }}>
                            <Typography variant="subtitle1" gutterBottom>
                                Clone Summary: {preview.source_year.name} → {preview.target_year.name}
                            </Typography>
                            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
                                <Chip label={`Terms: ${preview.counts.terms}`} color="primary" size="small" />
                                <Chip label={`Calendar Days: ${preview.counts.calendar_days}`} color="primary" size="small" />
                                <Chip label={`Fee Structures: ${preview.counts.fee_structures}`} color="primary" size="small" />
                                <Chip label={`Sequences: ${preview.counts.numbering_sequences}`} color="primary" size="small" />
                                <Chip label={`Exams: ${preview.counts.exams}`} color="primary" size="small" />
                            </Stack>
                        </Paper>

                        <Alert severity="success">
                            <strong>Excluded Student Transactions (0 copied):</strong>{' '}
                            {preview.excluded_student_transactions.enrollments} enrollments,{' '}
                            {preview.excluded_student_transactions.attendance} attendance records,{' '}
                            {preview.excluded_student_transactions.fee_payments} fee payments, and{' '}
                            {preview.excluded_student_transactions.exam_marks} exam marks will NOT be copied.
                        </Alert>

                        {preview.records_to_clone.terms.length > 0 && (
                            <Box>
                                <Typography variant="subtitle2" gutterBottom>Terms Preview</Typography>
                                <TableContainer component={Paper} variant="outlined">
                                    <Table size="small">
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>Term</TableCell>
                                                <TableCell>Source Dates</TableCell>
                                                <TableCell>New Shifted Dates</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {preview.records_to_clone.terms.map((t, idx) => (
                                                <TableRow key={idx}>
                                                    <TableCell>{t.name}</TableCell>
                                                    <TableCell>{formatDate(t.source_start_date)} – {formatDate(t.source_end_date)}</TableCell>
                                                    <TableCell>{formatDate(t.start_date)} – {formatDate(t.end_date)}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            </Box>
                        )}

                        {preview.records_to_clone.fee_structures.length > 0 && (
                            <Box>
                                <Typography variant="subtitle2" gutterBottom>Fee Structures Preview</Typography>
                                <TableContainer component={Paper} variant="outlined">
                                    <Table size="small">
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>Fee Name</TableCell>
                                                <TableCell>Amount</TableCell>
                                                <TableCell>Source Due Date</TableCell>
                                                <TableCell>New Due Date</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {preview.records_to_clone.fee_structures.map((fs, idx) => (
                                                <TableRow key={idx}>
                                                    <TableCell>{fs.name}</TableCell>
                                                    <TableCell>{fs.amount}</TableCell>
                                                    <TableCell>{formatDate(fs.source_due_date)}</TableCell>
                                                    <TableCell>{formatDate(fs.due_date)}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            </Box>
                        )}

                        {preview.records_to_clone.calendar_days.length > 0 && (
                            <Box>
                                <Typography variant="subtitle2" gutterBottom>Calendar Days Preview</Typography>
                                <TableContainer component={Paper} variant="outlined">
                                    <Table size="small">
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>Title</TableCell>
                                                <TableCell>Type</TableCell>
                                                <TableCell>Source Date</TableCell>
                                                <TableCell>New Date</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {preview.records_to_clone.calendar_days.map((c, idx) => (
                                                <TableRow key={idx}>
                                                    <TableCell>{c.title}</TableCell>
                                                    <TableCell>{c.day_type}</TableCell>
                                                    <TableCell>{formatDate(c.source_day_date)}</TableCell>
                                                    <TableCell>{formatDate(c.day_date)}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            </Box>
                        )}
                    </Stack>
                )}

                {activeStep === 2 && result && (
                    <Stack spacing={2}>
                        <Alert severity="success">
                            Successfully cloned academic year <strong>{result.academic_year.name}</strong>!
                        </Alert>
                        <Paper variant="outlined" sx={{ p: 2 }}>
                            <Typography variant="subtitle2" gutterBottom>Created Records</Typography>
                            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
                                <Chip label={`Terms: ${result.created_counts.terms}`} size="small" />
                                <Chip label={`Calendar Days: ${result.created_counts.calendar_days}`} size="small" />
                                <Chip label={`Fee Structures: ${result.created_counts.fee_structures}`} size="small" />
                                <Chip label={`Sequences: ${result.created_counts.numbering_sequences}`} size="small" />
                                <Chip label={`Exams: ${result.created_counts.exams}`} size="small" />
                            </Stack>
                        </Paper>
                        <Typography variant="body2" color="text.secondary">
                            Student transactions copied: {result.excluded_student_transactions.copied} (all historical
                            student enrollments, attendance, marks, and payments were preserved strictly in the source year).
                        </Typography>
                    </Stack>
                )}
            </DialogContent>
            <DialogActions>
                {activeStep === 0 && (
                    <>
                        <Button onClick={handleClose}>Cancel</Button>
                        <Button variant="contained" onClick={handlePreview} disabled={loading}>
                            {loading ? 'Generating Preview...' : 'Preview Clone'}
                        </Button>
                    </>
                )}
                {activeStep === 1 && (
                    <>
                        <Button onClick={() => setActiveStep(0)} disabled={loading}>Back</Button>
                        <Button
                            variant="contained"
                            color="primary"
                            onClick={handleExecuteClone}
                            disabled={loading || Boolean(preview?.has_conflicts)}
                        >
                            {loading ? 'Cloning...' : 'Confirm & Clone Year'}
                        </Button>
                    </>
                )}
                {activeStep === 2 && (
                    <Button variant="contained" onClick={handleClose}>
                        Done
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
}
