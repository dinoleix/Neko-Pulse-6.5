import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, BellRing, Camera, CheckCircle, Clock, Eye, Play, Plus, Save, Settings, SlidersHorizontal } from 'lucide-react';
import { Button, Card, Input, Select } from '../../../components/SharedComponents';
import { db } from '../../../firebaseConfig';
import { tableMonitorService } from '../../../services/tableMonitorService';
import { CameraType, Store, TableAlertDoc, TableMonitorConfig, TableMonitoringDoc, TableSourceType, TableState } from '../../../types';
import { SOUND_LIBRARY } from '../../../utils/soundLibrary';

type TableWithId = TableMonitoringDoc & { id: string };
type AlertWithId = TableAlertDoc & { id: string };
type TabId = 'LIVE' | 'TABLES' | 'ALERTS' | 'SETTINGS';

const DEFAULT_FORM: Partial<TableMonitoringDoc> = {
  tableId: '',
  tableName: '',
  outletId: '',
  sourceType: 'SCREEN',
  rtspUrl: '',
  cameraType: 'EZYKAM',
  screenRegion: { x: 100, y: 200, width: 640, height: 360 },
  isActive: true,
};

const DEFAULT_CONFIG: TableMonitorConfig = {
  alertThresholdMinutes: 3,
  rescanIntervalSeconds: 90,
  motionStillnessSeconds: 60,
  alertSoundId: 'BEEP',
  alertEnabled: true,
};

const stateStyles: Record<TableState, string> = {
  EMPTY: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  OCCUPIED: 'bg-amber-50 border-amber-200 text-amber-700',
  POTENTIALLY_DIRTY: 'bg-orange-50 border-orange-200 text-orange-700',
  DIRTY: 'bg-red-50 border-red-200 text-red-700',
  ALERT_SENT: 'bg-red-600 border-red-700 text-white animate-pulse',
};

const formatTimestamp = (value: any) => {
  if (!value) return 'Not yet';
  const date = value.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not yet' : date.toLocaleString();
};

export const TableMonitorAdminView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('LIVE');
  const [tables, setTables] = useState<TableWithId[]>([]);
  const [alerts, setAlerts] = useState<AlertWithId[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [outletFilter, setOutletFilter] = useState('ALL');
  const [form, setForm] = useState<Partial<TableMonitoringDoc>>(DEFAULT_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [config, setConfig] = useState<TableMonitorConfig>(DEFAULT_CONFIG);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const unsubTables = db.collection('tableMonitoring').onSnapshot(snapshot => {
      setTables(snapshot.docs.map(doc => ({ ...(doc.data() as TableMonitoringDoc), id: doc.id })));
    });
    const unsubAlerts = db.collection('tableAlerts').onSnapshot(snapshot => {
      const rows = snapshot.docs.map(doc => ({ ...(doc.data() as TableAlertDoc), id: doc.id }));
      rows.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setAlerts(rows);
    });
    db.collection('stores').where('isActive', '==', true).get().then(snapshot => {
      setStores(snapshot.docs.map(doc => ({ ...(doc.data() as Store), id: doc.id })));
    });
    tableMonitorService.getConfig().then(setConfig);

    return () => {
      unsubTables();
      unsubAlerts();
    };
  }, []);

  const outletOptions = useMemo(() => {
    const ids = new Set<string>();
    stores.forEach(store => ids.add(store.outletId));
    tables.forEach(table => ids.add(table.outletId));
    alerts.forEach(alert => ids.add(alert.outletId));
    return Array.from(ids).sort();
  }, [alerts, stores, tables]);

  const visibleTables = tables.filter(table => outletFilter === 'ALL' || table.outletId === outletFilter);
  const visibleAlerts = alerts.filter(alert => outletFilter === 'ALL' || alert.outletId === outletFilter);
  const activeAlertCount = visibleAlerts.filter(alert => alert.status === 'ACTIVE').length;

  const saveTable = async () => {
    if (!form.tableId || !form.tableName || !form.outletId) {
      alert('Table ID, name, and outlet are required.');
      return;
    }
    if ((form.sourceType || 'RTSP') === 'RTSP' && !form.rtspUrl) {
      alert('RTSP URL is required for RTSP monitoring.');
      return;
    }
    if (form.sourceType === 'SCREEN' && !form.screenRegion) {
      alert('Screen region is required for desktop client monitoring.');
      return;
    }
    setIsSaving(true);
    try {
      await tableMonitorService.saveTableConfig(form, editingId || undefined);
      setForm(DEFAULT_FORM);
      setEditingId(null);
    } catch (error: any) {
      alert(error.message || 'Failed to save table.');
    } finally {
      setIsSaving(false);
    }
  };

  const editTable = (table: TableWithId) => {
    setForm({
      tableId: table.tableId,
      tableName: table.tableName,
      outletId: table.outletId,
      sourceType: table.sourceType || 'RTSP',
      rtspUrl: table.rtspUrl,
      screenRegion: table.screenRegion || { x: 100, y: 200, width: 640, height: 360 },
      cameraType: table.cameraType,
      isActive: table.isActive,
    });
    setEditingId(table.id);
    setActiveTab('TABLES');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const saveConfig = async () => {
    setIsSaving(true);
    try {
      await tableMonitorService.saveConfig(config);
      alert('Table monitor settings saved.');
    } finally {
      setIsSaving(false);
    }
  };

  const previewSound = () => {
    const sound = SOUND_LIBRARY.find(item => item.id === config.alertSoundId);
    if (sound) new Audio(sound.url).play().catch(() => alert('Sound preview blocked by browser.'));
  };

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-violet-100 rounded-xl flex items-center justify-center text-violet-600">
            <Camera className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Table Monitor</h1>
            <p className="text-sm text-slate-500">{activeAlertCount} active clearing alerts</p>
          </div>
        </div>
        <div className="flex gap-2">
          <select value={outletFilter} onChange={e => setOutletFilter(e.target.value)} className="px-4 py-3 rounded-2xl bg-white border border-slate-200 text-sm font-bold text-slate-700">
            <option value="ALL">All outlets</option>
            {outletOptions.map(id => <option key={id} value={id}>{id}</option>)}
          </select>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {[
          ['LIVE', Eye],
          ['TABLES', Camera],
          ['ALERTS', BellRing],
          ['SETTINGS', Settings],
        ].map(([tab, Icon]: any) => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-3 rounded-2xl text-sm font-bold flex items-center gap-2 whitespace-nowrap ${activeTab === tab ? 'bg-slate-900 text-white' : 'bg-white text-slate-500 border border-slate-100'}`}>
            <Icon className="w-4 h-4" />
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'LIVE' && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleTables.map(table => <TableStatusCard key={table.id} table={table} onEdit={() => editTable(table)} />)}
          {visibleTables.length === 0 && <EmptyPanel label="No tables configured yet." />}
        </div>
      )}

      {activeTab === 'TABLES' && (
        <div className="grid lg:grid-cols-[420px_1fr] gap-6">
          <Card title={editingId ? 'Edit Table Camera' : 'Add Table Camera'}>
            <div className="space-y-4">
              <Input placeholder="Table ID, e.g. T1" value={form.tableId || ''} onChange={e => setForm({ ...form, tableId: e.target.value.trim() })} />
              <Input placeholder="Table Name" value={form.tableName || ''} onChange={e => setForm({ ...form, tableName: e.target.value })} />
              <Input placeholder="Outlet ID" value={form.outletId || ''} onChange={e => setForm({ ...form, outletId: e.target.value.trim() })} />
              <Select value={form.sourceType || 'SCREEN'} onChange={e => setForm({ ...form, sourceType: e.target.value as TableSourceType })}>
                <option value="SCREEN">Desktop camera client crop</option>
                <option value="RTSP">Direct RTSP camera</option>
              </Select>
              <Select value={form.cameraType || 'EZYKAM'} onChange={e => setForm({ ...form, cameraType: e.target.value as CameraType })}>
                <option value="EZYKAM">Ezykam+</option>
                <option value="XIAOMI">Xiaomi</option>
              </Select>
              {(form.sourceType || 'SCREEN') === 'RTSP' ? (
                <Input placeholder="rtsp://admin:password@camera-ip:554/Streaming/Channels/101" value={form.rtspUrl || ''} onChange={e => setForm({ ...form, rtspUrl: e.target.value })} />
              ) : (
                <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                  <Input type="number" placeholder="X" value={form.screenRegion?.x ?? 0} onChange={e => setForm({ ...form, screenRegion: { ...(form.screenRegion || { x: 0, y: 0, width: 640, height: 360 }), x: Number(e.target.value) } })} />
                  <Input type="number" placeholder="Y" value={form.screenRegion?.y ?? 0} onChange={e => setForm({ ...form, screenRegion: { ...(form.screenRegion || { x: 0, y: 0, width: 640, height: 360 }), y: Number(e.target.value) } })} />
                  <Input type="number" placeholder="Width" value={form.screenRegion?.width ?? 640} onChange={e => setForm({ ...form, screenRegion: { ...(form.screenRegion || { x: 0, y: 0, width: 640, height: 360 }), width: Number(e.target.value) } })} />
                  <Input type="number" placeholder="Height" value={form.screenRegion?.height ?? 360} onChange={e => setForm({ ...form, screenRegion: { ...(form.screenRegion || { x: 0, y: 0, width: 640, height: 360 }), height: Number(e.target.value) } })} />
                </div>
              )}
              <Button onClick={saveTable} isLoading={isSaving}>
                <Save className="w-4 h-4" />
                Save Table
              </Button>
              {editingId && (
                <Button variant="secondary" onClick={() => { setEditingId(null); setForm(DEFAULT_FORM); }}>
                  Cancel Edit
                </Button>
              )}
            </div>
          </Card>

          <div className="space-y-3">
            {visibleTables.map(table => (
              <div key={table.id} className="bg-white border border-slate-100 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="font-bold text-slate-800">{table.tableName}</div>
                  <div className="text-xs text-slate-500">{table.outletId} · {table.tableId} · {table.cameraType} · {table.sourceType || 'RTSP'}</div>
                  <div className="text-xs text-slate-400 truncate max-w-xl mt-1">
                    {(table.sourceType || 'RTSP') === 'SCREEN'
                      ? `Screen x:${table.screenRegion?.x} y:${table.screenRegion?.y} ${table.screenRegion?.width}x${table.screenRegion?.height}`
                      : table.rtspUrl}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" className="!w-auto !py-2" onClick={() => editTable(table)}>Edit</Button>
                  <Button variant={table.isActive ? 'danger' : 'secondary'} className="!w-auto !py-2" onClick={() => tableMonitorService.toggleTableActive(table.id, !table.isActive)}>
                    {table.isActive ? 'Pause' : 'Resume'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'ALERTS' && (
        <div className="space-y-3">
          {visibleAlerts.map(alert => (
            <div key={alert.id} className="bg-white border border-slate-100 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded-lg text-xs font-bold ${alert.status === 'ACTIVE' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>{alert.status}</span>
                  <span className="font-bold text-slate-800">{alert.tableName}</span>
                </div>
                <p className="text-sm text-slate-500 mt-1">{alert.geminiReason || 'Dirty table detected.'}</p>
                <p className="text-xs text-slate-400 mt-1">{alert.outletId} · Created {formatTimestamp(alert.createdAt)}</p>
              </div>
              {alert.status === 'ACTIVE' && (
                <Button className="!w-auto !py-2" onClick={() => tableMonitorService.acknowledgeAlert(alert.id, 'admin')}>
                  <CheckCircle className="w-4 h-4" />
                  Mark Done
                </Button>
              )}
            </div>
          ))}
          {visibleAlerts.length === 0 && <EmptyPanel label="No alerts recorded yet." />}
        </div>
      )}

      {activeTab === 'SETTINGS' && (
        <Card title="Alert Settings">
          <div className="grid md:grid-cols-2 gap-5">
            <SettingInput label="Alert after minutes" value={config.alertThresholdMinutes} min={1} max={20} onChange={value => setConfig({ ...config, alertThresholdMinutes: value })} />
            <SettingInput label="Stillness seconds" value={config.motionStillnessSeconds} min={15} max={300} onChange={value => setConfig({ ...config, motionStillnessSeconds: value })} />
            <SettingInput label="Rescan seconds" value={config.rescanIntervalSeconds} min={30} max={600} onChange={value => setConfig({ ...config, rescanIntervalSeconds: value })} />
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">Alert Sound</label>
              <div className="flex gap-2">
                <Select value={config.alertSoundId} onChange={e => setConfig({ ...config, alertSoundId: e.target.value })}>
                  {SOUND_LIBRARY.map(sound => <option key={sound.id} value={sound.id}>{sound.name}</option>)}
                </Select>
                <Button variant="secondary" className="!w-auto" onClick={previewSound}>
                  <Play className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <label className="flex items-center gap-3 bg-slate-50 rounded-2xl p-4 border border-slate-100">
              <input type="checkbox" checked={config.alertEnabled} onChange={e => setConfig({ ...config, alertEnabled: e.target.checked })} className="w-5 h-5" />
              <span className="font-bold text-slate-700">Play sound on kiosk alerts</span>
            </label>
          </div>
          <Button className="mt-6 !w-auto" onClick={saveConfig} isLoading={isSaving}>
            <Save className="w-4 h-4" />
            Save Settings
          </Button>
        </Card>
      )}
    </div>
  );
};

const TableStatusCard: React.FC<{ table: TableWithId; onEdit: () => void }> = ({ table, onEdit }) => (
  <button onClick={onEdit} className={`text-left rounded-2xl border p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${stateStyles[table.state] || stateStyles.EMPTY}`}>
    <div className="flex items-start justify-between gap-3">
      <div>
        <h3 className="text-lg font-bold">{table.tableName}</h3>
        <p className="text-xs opacity-75">{table.outletId} · {table.cameraType} · {table.sourceType || 'RTSP'}</p>
      </div>
      {table.state === 'ALERT_SENT' ? <AlertCircle className="w-6 h-6" /> : <Clock className="w-5 h-5 opacity-70" />}
    </div>
    <div className="mt-5 text-2xl font-black tracking-wide">{table.state.replace('_', ' ')}</div>
    <p className="mt-3 text-sm opacity-80 line-clamp-2">{table.lastGeminiReason || 'Waiting for camera signal.'}</p>
    <p className="mt-4 text-xs opacity-70">Updated {formatTimestamp(table.lastUpdatedAt)}</p>
  </button>
);

const SettingInput = ({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) => (
  <div>
    <label className="text-xs font-bold text-slate-400 uppercase mb-2 flex items-center gap-2">
      <SlidersHorizontal className="w-3 h-3" />
      {label}
    </label>
    <Input type="number" min={min} max={max} value={value} onChange={e => onChange(Number(e.target.value))} />
  </div>
);

const EmptyPanel = ({ label }: { label: string }) => (
  <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-8 text-center text-slate-400 font-bold">
    <Plus className="w-8 h-8 mx-auto mb-2 opacity-50" />
    {label}
  </div>
);
