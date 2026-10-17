import type { AttendanceLog, CrewMember, LeaveRequest, ShiftAssignment } from '../types';

export function notScannedAttendance(assignments: ShiftAssignment[], logs: AttendanceLog[], crew: CrewMember[], leaves: LeaveRequest[], startDate: string, endDate: string, timezone: string, now = new Date(), selectedEmployee = 'ALL') {
  const day = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  const today = day(now);
  const clock = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  const seen = new Set<string>();
  return assignments.filter(assignment => {
    const person = crew.find(c => c.id === assignment.crewId || c.authUid === assignment.crewId);
    if (!person || person.active === false || assignment.isDayOff || !/^([01]\d|2[0-3]):[0-5]\d$/.test(assignment.startTime || '')) return false;
    const ids = new Set([person.id, person.authUid, assignment.crewId].filter(Boolean));
    if (selectedEmployee !== 'ALL' && !ids.has(selectedEmployee)) return false;
    if (assignment.date < startDate || assignment.date > endDate || assignment.date > today || (assignment.date === today && assignment.startTime! > clock)) return false;
    if (leaves.some(l => ids.has(l.crewId) && l.status === 'APPROVED' && l.startDate <= assignment.date && l.endDate >= assignment.date)) return false;
    // Any recorded event means this is not a completely unscanned day. Do not
    // mislabel checkout-only records or a scan at another outlet as absence.
    if (logs.some(log => {
      if (!ids.has(log.crewId)) return false;
      const date = log.timestamp?.toDate ? log.timestamp.toDate() : new Date(log.timestamp);
      return Number.isFinite(date.getTime()) && day(date) === assignment.date;
    })) return false;
    const key = `${person.id}_${assignment.date}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
