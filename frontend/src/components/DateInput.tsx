import dayjs, { type Dayjs } from 'dayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';

interface DateInputProps {
    label: string;
    value: string;
    onChange: (value: string) => void;
    required?: boolean;
}

export default function DateInput({
    label,
    value,
    onChange,
    required = false,
}: DateInputProps) {
    return (
        <DatePicker
            label={label}
            value={value ? dayjs(value) : null}
            onChange={(newValue: Dayjs | null) => {
                onChange(newValue && newValue.isValid() ? newValue.format('YYYY-MM-DD') : '');
            }}
            format="DD/MM/YYYY"
            slotProps={{
                textField: {
                    required,
                },
            }}
        />
    );
}