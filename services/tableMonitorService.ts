import { db, firebase } from '../firebaseConfig';
import { TableAlertDoc, TableMonitorConfig, TableMonitoringDoc } from '../types';

const DEFAULT_CONFIG: TableMonitorConfig = {
  alertThresholdMinutes: 3,
  rescanIntervalSeconds: 90,
  motionStillnessSeconds: 60,
  alertSoundId: 'BEEP',
  alertEnabled: true,
};

const tableDocId = (outletId: string, tableId: string) => `${outletId}_${tableId}`;

export const tableMonitorService = {
  saveTableConfig: async (table: Partial<TableMonitoringDoc>, docId?: string) => {
    if (!table.outletId || !table.tableId) {
      throw new Error('Outlet ID and Table ID are required.');
    }
    if ((table.sourceType || 'RTSP') === 'RTSP' && !table.rtspUrl) {
      throw new Error('RTSP URL is required for RTSP tables.');
    }
    if (table.sourceType === 'SCREEN' && !table.screenRegion) {
      throw new Error('Screen region is required for screen capture tables.');
    }

    const id = docId || tableDocId(table.outletId, table.tableId);
    const payload = {
      sourceType: 'RTSP',
      state: 'EMPTY',
      occupiedSince: null,
      dirtySince: null,
      lastGeminiReason: '',
      lastGeminiAt: null,
      activeAlertId: null,
      isActive: true,
      ...table,
      lastUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };

    return db.collection('tableMonitoring').doc(id).set(payload, { merge: true });
  },

  toggleTableActive: async (docId: string, isActive: boolean) => {
    return db.collection('tableMonitoring').doc(docId).update({
      isActive,
      lastUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  },

  acknowledgeAlert: async (alertId: string, crewId: string) => {
    const alertRef = db.collection('tableAlerts').doc(alertId);
    const alertSnap = await alertRef.get();
    if (!alertSnap.exists) return;

    const alert = alertSnap.data() as TableAlertDoc;
    await alertRef.update({
      status: 'ACKNOWLEDGED',
      acknowledgedAt: firebase.firestore.FieldValue.serverTimestamp(),
      acknowledgedBy: crewId,
    });

    await db.collection('tableMonitoring').doc(tableDocId(alert.outletId, alert.tableId)).set({
      activeAlertId: null,
      state: 'EMPTY',
      occupiedSince: null,
      dirtySince: null,
      lastUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  },

  getConfig: async (): Promise<TableMonitorConfig> => {
    const snap = await db.collection('settings').doc('tableMonitorConfig').get();
    return snap.exists ? { ...DEFAULT_CONFIG, ...(snap.data() as Partial<TableMonitorConfig>) } : DEFAULT_CONFIG;
  },

  saveConfig: async (config: TableMonitorConfig) => {
    return db.collection('settings').doc('tableMonitorConfig').set(config, { merge: true });
  },

  subscribeToActiveTables: (outletId: string, cb: (tables: (TableMonitoringDoc & { id: string })[]) => void) => {
    return db.collection('tableMonitoring')
      .where('outletId', '==', outletId)
      .where('isActive', '==', true)
      .onSnapshot(snapshot => {
        cb(snapshot.docs.map(doc => ({ ...(doc.data() as TableMonitoringDoc), id: doc.id })));
      });
  },

  subscribeToActiveAlerts: (outletId: string, cb: (alerts: (TableAlertDoc & { id: string })[]) => void) => {
    return db.collection('tableAlerts')
      .where('outletId', '==', outletId)
      .where('status', '==', 'ACTIVE')
      .onSnapshot(snapshot => {
        cb(snapshot.docs.map(doc => ({ ...(doc.data() as TableAlertDoc), id: doc.id })));
      });
  },
};
