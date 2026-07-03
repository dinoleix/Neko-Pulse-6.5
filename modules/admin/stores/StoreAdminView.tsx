
import React, { useState, useEffect } from 'react';
import { Store, AppConfig } from '../../../types';
import { storeService } from '../../../services/storeService';
import { Button, Card, Input, TextArea } from '../../../components/SharedComponents';
import { Store as StoreIcon, MapPin, FileText, Upload, Trash2, Edit, Eye, Loader2, Save, Globe, X } from 'lucide-react';

const TIMEZONES = [
    { value: 'Asia/Kolkata', label: 'India (IST) - GMT+5:30' },
    { value: 'Asia/Dubai', label: 'Dubai (GST) - GMT+4:00' },
    { value: 'America/New_York', label: 'New York (EST) - GMT-5:00' },
    { value: 'Europe/London', label: 'London (GMT) - GMT+0:00' },
    { value: 'Asia/Singapore', label: 'Singapore (SGT) - GMT+8:00' },
    { value: 'Australia/Sydney', label: 'Sydney (AEDT) - GMT+11:00' },
];

export const StoreAdminView: React.FC = () => {
   const [stores, setStores] = useState<Store[]>([]);
   const [loading, setLoading] = useState(true);
   
   // Form State
   const [formStore, setFormStore] = useState<Partial<Store>>({ 
      name: '', 
      outletId: '',
      address: '',
      fassaiNumber: '',
      gstNumber: '',
      fassaiCertUrl: '',
      gstCertUrl: ''
   });
   const [editingId, setEditingId] = useState<string | null>(null);
   
   // App Config State
   const [appConfig, setAppConfig] = useState<AppConfig>({ timezone: 'Asia/Kolkata' });
   const [isSavingConfig, setIsSavingConfig] = useState(false);

   // Upload State
   const [isUploading, setIsUploading] = useState<'FSSAI' | 'GST' | null>(null);
   const [isSaving, setIsSaving] = useState(false);

   useEffect(() => {
      load();
   }, []);

   const load = async () => {
      try {
         const [storesData, configData] = await Promise.all([
             storeService.getStores(),
             storeService.getAppConfig()
         ]);
         
         setStores(storesData);
         if (configData) {
             setAppConfig(configData);
         }
      } catch (error) {
         console.error(error);
      } finally {
         setLoading(false);
      }
   };

   const saveAppConfig = async () => {
       setIsSavingConfig(true);
       try {
           await storeService.updateAppConfig(appConfig);
           alert("Global Settings Saved! (Reload to apply changes)");
       } catch (e) {
           alert("Failed to save settings");
       } finally {
           setIsSavingConfig(false);
       }
   };

   const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'FSSAI' | 'GST') => {
      if (!e.target.files?.[0]) return;
      setIsUploading(type);
      try {
         const url = await storeService.uploadCert(e.target.files[0], type);
         
         if (type === 'FSSAI') {
            setFormStore(prev => ({ ...prev, fassaiCertUrl: url }));
         } else {
            setFormStore(prev => ({ ...prev, gstCertUrl: url }));
         }
      } catch (err) {
         alert("Upload failed");
      } finally {
         setIsUploading(null);
      }
   };

   const handleSaveStore = async () => {
      if(!formStore.name || !formStore.outletId) {
         alert("Store Name and Outlet ID are required.");
         return;
      }
      setIsSaving(true);
      try {
         if (editingId) {
            await storeService.updateStore(editingId, formStore);
         } else {
            await storeService.addStore(formStore);
         }
         resetForm();
         load();
      } catch (e) {
         alert("Failed to save store");
      } finally {
         setIsSaving(false);
      }
   };

   const resetForm = () => {
      setFormStore({ 
         name: '', 
         outletId: '', 
         address: '', 
         fassaiNumber: '', 
         gstNumber: '', 
         fassaiCertUrl: '', 
         gstCertUrl: '' 
      });
      setEditingId(null);
   };

   const startEdit = (store: Store) => {
      setFormStore({
         name: store.name,
         outletId: store.outletId,
         address: store.address || '',
         fassaiNumber: store.fassaiNumber || '',
         gstNumber: store.gstNumber || '',
         fassaiCertUrl: store.fassaiCertUrl || '',
         gstCertUrl: store.gstCertUrl || ''
      });
      setEditingId(store.id!);
      window.scrollTo({ top: 0, behavior: 'smooth' });
   };

   const deleteStore = async (id: string) => {
      if(confirm("Are you sure? This will not delete associated data (employees, tasks) but will remove the store definition.")) {
         await storeService.deleteStore(id);
         load();
      }
   };

   if (loading) return <div className="p-8 text-center text-slate-400">Loading Stores...</div>;

   return (
      <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-6">
         <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center text-purple-600">
               <StoreIcon className="w-6 h-6"/>
            </div>
            <h1 className="text-2xl font-bold text-slate-800">Store Management</h1>
         </div>

         {/* GLOBAL SETTINGS */}
         <Card className="bg-gradient-to-r from-slate-800 to-slate-900 text-white border-0 shadow-lg shadow-slate-300">
             <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                 <div className="flex items-center gap-4">
                     <div className="p-3 bg-white/10 rounded-full">
                         <Globe className="w-6 h-6 text-emerald-400"/>
                     </div>
                     <div>
                         <h3 className="font-bold text-lg">Global App Configuration</h3>
                         <p className="text-slate-400 text-sm">Settings apply to all stores and devices.</p>
                     </div>
                 </div>
                 
                 <div className="flex items-center gap-3 bg-white/5 p-2 rounded-xl border border-white/10">
                     <label className="text-xs font-bold text-slate-400 uppercase ml-2">Timezone</label>
                     <select 
                        value={appConfig.timezone} 
                        onChange={e => setAppConfig({...appConfig, timezone: e.target.value})}
                        className="bg-slate-800 text-white border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
                     >
                         {TIMEZONES.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
                     </select>
                     <Button onClick={saveAppConfig} isLoading={isSavingConfig} className="!w-auto !py-2 !bg-emerald-500 hover:!bg-emerald-600">
                         Save
                     </Button>
                 </div>
             </div>
         </Card>

         {/* ADD/EDIT STORE FORM */}
         <Card title={editingId ? "Edit Outlet" : "Add New Outlet"} className={`border-t-4 ${editingId ? 'border-t-indigo-500' : 'border-t-purple-500'}`}>
            <div className="grid md:grid-cols-2 gap-6">
               <div className="space-y-4">
                  <div>
                     <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Store Basics</label>
                     <div className="flex gap-4">
                        <div className="flex-1">
                           <Input placeholder="Store Name" value={formStore.name} onChange={e => setFormStore({...formStore, name: e.target.value})} />
                        </div>
                        <div className="w-32">
                           <Input placeholder="Outlet ID" value={formStore.outletId} onChange={e => setFormStore({...formStore, outletId: e.target.value})} />
                        </div>
                     </div>
                  </div>
                  <div>
                     <label className="text-xs font-bold text-slate-400 uppercase mb-1 flex items-center gap-1">
                        <MapPin className="w-3 h-3"/> Full Address
                     </label>
                     <TextArea placeholder="Street, City, Zip Code..." value={formStore.address} onChange={e => setFormStore({...formStore, address: e.target.value})} className="h-24 !min-h-0"/>
                  </div>
               </div>

               <div className="space-y-4">
                   <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                      <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">Regulatory Information</label>
                      
                      {/* FSSAI */}
                      <div className="mb-4">
                         <div className="flex items-center gap-2 mb-2">
                            <span className="text-sm font-bold text-slate-700 w-16">FSSAI</span>
                            <Input placeholder="License Number" value={formStore.fassaiNumber} onChange={e => setFormStore({...formStore, fassaiNumber: e.target.value})} className="!py-2 text-sm" />
                         </div>
                         <div className="flex justify-end">
                            {formStore.fassaiCertUrl ? (
                               <div className="flex items-center gap-2 text-xs text-emerald-600 font-bold bg-emerald-50 px-3 py-1 rounded-full">
                                  <FileText className="w-3 h-3"/> Certificate Uploaded
                                  <button onClick={() => setFormStore({...formStore, fassaiCertUrl: ''})} className="text-red-400 hover:text-red-600"><Trash2 className="w-3 h-3"/></button>
                               </div>
                            ) : (
                               <label className="cursor-pointer text-xs font-bold text-purple-600 flex items-center gap-1 hover:underline">
                                  {isUploading === 'FSSAI' ? <Loader2 className="w-3 h-3 animate-spin"/> : <Upload className="w-3 h-3"/>}
                                  Upload FSSAI Cert
                                  <input type="file" className="hidden" accept="image/*,.pdf" onChange={(e) => handleFileUpload(e, 'FSSAI')} disabled={!!isUploading} />
                               </label>
                            )}
                         </div>
                      </div>

                      {/* GST */}
                      <div>
                         <div className="flex items-center gap-2 mb-2">
                            <span className="text-sm font-bold text-slate-700 w-16">GSTIN</span>
                            <Input placeholder="GST Number" value={formStore.gstNumber} onChange={e => setFormStore({...formStore, gstNumber: e.target.value})} className="!py-2 text-sm" />
                         </div>
                         <div className="flex justify-end">
                            {formStore.gstCertUrl ? (
                               <div className="flex items-center gap-2 text-xs text-emerald-600 font-bold bg-emerald-50 px-3 py-1 rounded-full">
                                  <FileText className="w-3 h-3"/> Certificate Uploaded
                                  <button onClick={() => setFormStore({...formStore, gstCertUrl: ''})} className="text-red-400 hover:text-red-600"><Trash2 className="w-3 h-3"/></button>
                               </div>
                            ) : (
                               <label className="cursor-pointer text-xs font-bold text-purple-600 flex items-center gap-1 hover:underline">
                                  {isUploading === 'GST' ? <Loader2 className="w-3 h-3 animate-spin"/> : <Upload className="w-3 h-3"/>}
                                  Upload GST Cert
                                  <input type="file" className="hidden" accept="image/*,.pdf" onChange={(e) => handleFileUpload(e, 'GST')} disabled={!!isUploading} />
                               </label>
                            )}
                         </div>
                      </div>
                   </div>

                   <div className="flex justify-end gap-3">
                      {editingId && (
                         <Button variant="secondary" onClick={resetForm} className="!w-auto">
                            <X className="w-4 h-4 mr-2"/> Cancel
                         </Button>
                      )}
                      <Button onClick={handleSaveStore} isLoading={isSaving} className="!w-auto">
                         <Save className="w-4 h-4 mr-2"/> {editingId ? 'Update Store' : 'Save Store'}
                      </Button>
                   </div>
               </div>
            </div>
         </Card>

         {/* STORE LIST */}
         <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {stores.map((s) => (
               <div key={s.id} className={`bg-white rounded-2xl p-6 shadow-sm border transition-all relative group ${editingId === s.id ? 'border-indigo-500 ring-2 ring-indigo-50' : 'border-slate-100 hover:shadow-md'}`}>
                  <div className="flex justify-between items-start mb-4">
                     <div>
                        <h3 className="font-bold text-lg text-slate-800">{s.name}</h3>
                        <span className="text-xs font-bold bg-slate-100 text-slate-500 px-2 py-1 rounded-md">{s.outletId}</span>
                     </div>
                     <div className="flex gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                        <button 
                           onClick={() => startEdit(s)}
                           className="p-2 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        >
                           <Edit className="w-4 h-4"/>
                        </button>
                        <button 
                           onClick={() => deleteStore(s.id!)}
                           className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        >
                           <Trash2 className="w-4 h-4"/>
                        </button>
                     </div>
                  </div>
                  
                  <div className="space-y-3">
                     {s.address && (
                        <div className="flex gap-2 text-sm text-slate-600">
                           <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5"/>
                           <p className="leading-tight">{s.address}</p>
                        </div>
                     )}
                     
                     <div className="border-t border-slate-50 pt-3 mt-3 grid grid-cols-2 gap-2">
                        <div className="bg-purple-50 p-2 rounded-lg">
                           <div className="text-[10px] font-bold text-purple-400 uppercase mb-1">FSSAI License</div>
                           <div className="text-xs font-mono font-bold text-purple-900 truncate">{s.fassaiNumber || '-'}</div>
                           {s.fassaiCertUrl && (
                              <a href={s.fassaiCertUrl} target="_blank" className="text-[10px] flex items-center gap-1 text-purple-600 mt-1 hover:underline">
                                 <Eye className="w-3 h-3"/> View Cert
                              </a>
                           )}
                        </div>
                        <div className="bg-indigo-50 p-2 rounded-lg">
                           <div className="text-[10px] font-bold text-indigo-400 uppercase mb-1">GST Number</div>
                           <div className="text-xs font-mono font-bold text-indigo-900 truncate">{s.gstNumber || '-'}</div>
                           {s.gstCertUrl && (
                              <a href={s.gstCertUrl} target="_blank" className="text-[10px] flex items-center gap-1 text-indigo-600 mt-1 hover:underline">
                                 <Eye className="w-3 h-3"/> View Cert
                              </a>
                           )}
                        </div>
                     </div>
                  </div>
               </div>
            ))}
         </div>
      </div>
   );
};
