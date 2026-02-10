
import { format } from 'date-fns';

export const DEFAULT_TIMEZONE = 'Asia/Kolkata';

// Helper to shift a UTC date to the target timezone's "face value"
// Example: 12:00 UTC -> 17:30 Face Value (for IST)
export const getShiftedDate = (date: Date | any, timezone: string = DEFAULT_TIMEZONE) => {
    if (!date) return new Date();
    const d = date.toDate ? date.toDate() : new Date(date);
    
    try {
        // Get the date string in the target timezone
        // We use en-US to ensure specific format for parsing
        const tzString = d.toLocaleString('en-US', { timeZone: timezone });
        return new Date(tzString);
    } catch (e) {
        console.error("Timezone shift error", e);
        return d;
    }
};

export const formatInTimeZone = (date: Date | any, fmt: string, timezone: string = DEFAULT_TIMEZONE) => {
    if (!date) return '-';
    const shifted = getShiftedDate(date, timezone);
    return format(shifted, fmt);
};

// Check if a date is "Today" in the target timezone
export const isTodayInTimeZone = (date: Date | any, timezone: string = DEFAULT_TIMEZONE) => {
    const targetDate = getShiftedDate(date, timezone);
    const nowInTz = getShiftedDate(new Date(), timezone);
    
    return targetDate.getDate() === nowInTz.getDate() &&
           targetDate.getMonth() === nowInTz.getMonth() &&
           targetDate.getFullYear() === nowInTz.getFullYear();
};

export const getCurrentTimeInTimeZone = (timezone: string = DEFAULT_TIMEZONE) => {
    return getShiftedDate(new Date(), timezone);
};
