
import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../../firebaseConfig';
import { loginLogService } from '../../../services/loginLogService';
import { LoginLog } from '../../../types';
import { Card, Badge, Input, Select, Button } from '../../../components/SharedComponents';
import { LogIn, RefreshCw, Search, Users, Activity, Shield, Smartphone, MapPin } from 'lucide-react';
import { formatInTimeZone, isTodayInTimeZone, DEFAULT_TIMEZONE } from '../../../utils/dateFormatter';

export const LoginActivityAdminView: React.FC = () => {
    const [logs, setLogs] = useState<LoginLog[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);

    // Filters
    const [search, setSearch] = useState('');
    const [outletFilter, setOutletFilter] = useState('ALL');
    const [roleFilter, setRoleFilter] = useState<'ALL' | 'ADMIN' | 'CREW'>('ALL');

    useEffect(() => {
        db.collection('settings').doc('appConfig').get().then(doc => {
            if (doc.exists) setTimezone(doc.data()?.timezone || DEFAULT_TIMEZONE);
        }).catch(() => {});
        load();
    }, []);

    const load = async () => {
        setIsLoading(true);
        try {
            const data = await loginLogService.getRecent(500);
            setLogs(data);
        } catch (e) {
            console.error('Login activity load error', e);
        } finally {
            setIsLoading(false);
        }
    };

    const outlets = useMemo(
        () => Array.from(new Set(logs.map(l => l.outletId).filter(Boolean))) as string[],
        [logs]
    );

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return logs.filter(l => {
            if (roleFilter !== 'ALL' && l.role !== roleFilter) return false;
            if (outletFilter !== 'ALL' && l.outletId !== outletFilter) return false;
            if (q && !(l.userName || '').toLowerCase().includes(q)) return false;
            return true;
        });
    }, [logs, search, outletFilter, roleFilter]);

    // Stats (based on full dataset, not filters)
    const stats = useMemo(() => {
        const today = logs.filter(l => l.timestamp && isTodayInTimeZone(l.timestamp, timezone));
        const uniqueToday = new Set(today.map(l => l.userId)).size;
        return {
            totalLoaded: logs.length,
            loginsToday: today.length,
            uniqueToday,
        };
    }, [logs, timezone]);

    return (
        <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-6">
            <div className="flex justify-between items-center flex-wrap gap-3">
                <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
                    <div className="w-10 h-10 bg-sky-100 rounded-xl flex items-center justify-center text-sky-600">
                        <LogIn className="w-6 h-6"/>
                    </div>
                    Login Activity
                </h1>
                <Button variant="secondary" className="!w-auto" onClick={load} isLoading={isLoading}>
                    <RefreshCw className="w-4 h-4 mr-2"/> Refresh
                </Button>
            </div>

            {/* STATS */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard icon={<Activity className="w-5 h-5"/>} label="Logins Today" value={stats.loginsToday} color="bg-sky-500"/>
                <StatCard icon={<Users className="w-5 h-5"/>} label="Unique Users Today" value={stats.uniqueToday} color="bg-emerald-500"/>
                <StatCard icon={<LogIn className="w-5 h-5"/>} label="Records Loaded" value={stats.totalLoaded} color="bg-slate-500"/>
            </div>

            {/* FILTERS */}
            <Card>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10"/>
                        <Input
                            placeholder="Search by name..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="!pl-11"
                        />
                    </div>
                    <Select value={roleFilter} onChange={e => setRoleFilter(e.target.value as any)}>
                        <option value="ALL">All Roles</option>
                        <option value="ADMIN">Managers</option>
                        <option value="CREW">Crew</option>
                    </Select>
                    <Select value={outletFilter} onChange={e => setOutletFilter(e.target.value)}>
                        <option value="ALL">All Outlets</option>
                        {outlets.map(o => <option key={o} value={o}>{o}</option>)}
                    </Select>
                </div>
            </Card>

            {/* LIST */}
            {isLoading ? (
                <div className="p-12 text-center text-sky-500 font-bold animate-pulse">Loading login activity...</div>
            ) : (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                    {/* Header row (desktop) */}
                    <div className="hidden md:grid grid-cols-12 gap-3 px-5 py-3 bg-slate-50 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        <div className="col-span-3">User</div>
                        <div className="col-span-2">Role</div>
                        <div className="col-span-2">Outlet</div>
                        <div className="col-span-2">Device / Location</div>
                        <div className="col-span-3 text-right">When</div>
                    </div>

                    {filtered.map((l, idx) => (
                        <div key={l.id} className={`grid grid-cols-2 md:grid-cols-12 gap-2 md:gap-3 px-5 py-3 items-center hover:bg-slate-50 transition-colors ${idx !== 0 ? 'border-t border-slate-100' : ''}`}>
                            {/* User */}
                            <div className="col-span-2 md:col-span-3 min-w-0">
                                <div className="font-bold text-slate-800 truncate">{l.userName || 'Unknown'}</div>
                                <div className="text-[11px] text-slate-400">
                                    {l.loginMethod === 'MANAGER_EMAIL' ? 'Email login' : 'Staff code'}
                                </div>
                            </div>

                            {/* Role */}
                            <div className="md:col-span-2">
                                <Badge variant={l.role === 'ADMIN' ? 'warning' : 'neutral'} className="!text-[10px] inline-flex items-center gap-1">
                                    {l.role === 'ADMIN' ? <Shield className="w-3 h-3"/> : null}
                                    {l.accessRole || (l.role === 'ADMIN' ? 'Manager' : 'Crew')}
                                </Badge>
                            </div>

                            {/* Outlet */}
                            <div className="md:col-span-2 text-sm text-slate-600 truncate">{l.outletId || '—'}</div>

                            {/* Device / Location */}
                            <div className="md:col-span-2 text-xs text-slate-500 min-w-0">
                                <div className="flex items-center gap-1 truncate">
                                    <Smartphone className="w-3 h-3 flex-shrink-0 text-slate-300"/>
                                    <span className="truncate">{l.device || '—'}</span>
                                </div>
                                {l.location && (
                                    <div className="flex items-center gap-1 truncate text-[11px] text-slate-400 mt-0.5">
                                        <MapPin className="w-3 h-3 flex-shrink-0 text-slate-300"/>
                                        <span className="truncate">{l.location}</span>
                                    </div>
                                )}
                            </div>

                            {/* When */}
                            <div className="col-span-2 md:col-span-3 text-right">
                                <div className="text-sm font-mono font-bold text-slate-700">
                                    {l.timestamp ? formatInTimeZone(l.timestamp, 'h:mm a', timezone) : '—'}
                                </div>
                                <div className="text-[11px] text-slate-400">
                                    {l.timestamp ? formatInTimeZone(l.timestamp, 'EEE, MMM d, yyyy', timezone) : ''}
                                </div>
                            </div>
                        </div>
                    ))}

                    {filtered.length === 0 && (
                        <div className="text-center py-16 text-slate-300">
                            <LogIn className="w-12 h-12 mx-auto mb-3 opacity-40"/>
                            <p className="font-bold text-slate-400">No login records found.</p>
                            <p className="text-slate-300 text-sm">Records appear here as users log in.</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

const StatCard = ({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) => (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center gap-4">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-white flex-shrink-0 ${color}`}>
            {icon}
        </div>
        <div>
            <div className="text-2xl font-black text-slate-800 leading-none">{value}</div>
            <div className="text-xs text-slate-400 font-bold uppercase tracking-wide mt-1">{label}</div>
        </div>
    </div>
);
