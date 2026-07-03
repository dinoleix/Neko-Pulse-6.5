
import React, { useState, useEffect } from 'react';
import { firebase } from '../../../firebaseConfig';
import { employeeService } from '../../../services/employeeService';
import { storeService } from '../../../services/storeService';
import { attendanceService } from '../../../services/attendanceService';
import { compressImage } from '../../../services/imageService';
import { CrewMember, RoleDef, Store, CurrentUser, AttendanceConfig } from '../../../types';
import { Button, Card, Input, Select, Badge, Checkbox } from '../../../components/SharedComponents';
// @fix: Added ShieldAlert to imports
import { Trash2, Edit, X, Loader2, Calendar, Globe, Lock, RefreshCcw, Users, ShieldCheck, Search, UserPlus, Info, ChevronRight, MapPin, Shield, Unlock, ShieldAlert, UserX, UserCheck, Camera, Upload } from 'lucide-react';
import { format } from 'date-fns';

interface EmployeeAdminViewProps {
   currentUser: CurrentUser;
}

export const EmployeeAdminView: React.FC<EmployeeAdminViewProps> = ({ currentUser }) => {
   const [activeTab, setActiveTab] = useState<'CREW' | 'MANAGERS'>('CREW');
   const [crew, setCrew] = useState<CrewMember[]>([]);
   const [managers, setManagers] = useState<CrewMember[]>([]);
   const [roles, setRoles] = useState<RoleDef[]>([]);
   const [stores, setStores] = useState<Store[]>([]);
   const [attConfig, setAttConfig] = useState<AttendanceConfig | null>(null);
   const [isLoading, setIsLoading] = useState(true);
   const [searchQuery, setSearchQuery] = useState('');
   const [showInactive, setShowInactive] = useState(false);
   
   // Form State
   const [newCrew, setNewCrew] = useState<Partial<CrewMember>>({
      crewName: '',
      crewCode: '',
      email: '',
      phoneNumber: '',
      photoUrl: '',
      role: '',
      gender: undefined,
      outletId: '',
      isMobile: false,
      dateOfBirth: '',
      dateOfJoining: '',
      dateOfLeaving: '',
      leaveBalanceOverride: undefined
   });
   const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
   
   // Password state for creating Managers
   const [newManagerPassword, setNewManagerPassword] = useState('');

   const [editingId, setEditingId] = useState<string | null>(null);
   const [isCreating, setIsCreating] = useState(false);
   const [newRole, setNewRole] = useState('');
   const [isSavingRole, setIsSavingRole] = useState(false);
   const [deletingId, setDeletingId] = useState<string | null>(null);
   const [isSavingCrew, setIsSavingCrew] = useState(false);

   useEffect(() => { load(); }, []);

   const load = async () => {
      try {
         const [cData, mData, rData, sData, configData] = await Promise.all([
             employeeService.getAllCrew(),
             employeeService.getAllManagers(),
             employeeService.getRoles(),
             storeService.getStores(),
             attendanceService.getConfig()
         ]);
         
         setCrew(cData);
         setManagers(mData);
         setRoles(rData);
         setStores(sData);
         setAttConfig(configData);
      } catch (err) {
         console.error("Load error", err);
      } finally {
         setIsLoading(false);
      }
   };

   // --- HELPERS ---
   // A member is inactive if explicitly marked (active === false) or has a relieving date.
   const isMemberInactive = (m: CrewMember) => m.active === false || !!m.dateOfLeaving;

   const rawList = activeTab === 'CREW' ? crew : managers;
   const inactiveCount = rawList.filter(isMemberInactive).length;
   const currentList = rawList
      .filter(u => showInactive ? isMemberInactive(u) : !isMemberInactive(u))
      .filter(u =>
         u.crewName.toLowerCase().includes(searchQuery.toLowerCase()) ||
         u.crewCode?.toLowerCase().includes(searchQuery.toLowerCase()) ||
         u.role?.toLowerCase().includes(searchQuery.toLowerCase())
      );

   const PROTECTED_ROLES = ['Super Admin', 'System Admin', 'Owner'];

   const isAccountProtected = (member: Partial<CrewMember> | undefined) => {
       return PROTECTED_ROLES.includes(member?.role || '');
   };

   const canModifyAccount = (member: CrewMember) => {
       if (!isAccountProtected(member)) return true;
       return member.id === currentUser.dbId || member.authUid === currentUser.uid;
   };

   // --- ACTIONS ---
   const addRole = async () => {
      if(!newRole.trim()) return;
      setIsSavingRole(true);
      try {
         if(roles.some(r => r.name.toLowerCase() === newRole.toLowerCase())) {
            alert("Role already exists");
            return;
         }
         await employeeService.addRole(newRole.trim());
         setNewRole('');
         const rData = await employeeService.getRoles();
         setRoles(rData);
      } catch (e) {
         alert("Failed to add role");
      } finally {
         setIsSavingRole(false);
      }
   };

   const deleteRole = async (id: string) => {
       if(!window.confirm('Delete role?')) return;
       try {
           await employeeService.deleteRole(id);
           setRoles(prev => prev.filter(r => r.id !== id));
       } catch(err: any) {
           alert("Delete failed: " + err.message);
       }
   };

   const startEdit = (member: CrewMember) => {
      if (!canModifyAccount(member)) {
          alert("Security Alert: You cannot edit another Super Admin or Owner's account.");
          return;
      }

      setNewCrew({
         crewName: member.crewName,
         crewCode: member.crewCode || '',
         email: member.email || '',
         phoneNumber: member.phoneNumber || '',
         photoUrl: member.photoUrl || '',
         role: member.role,
         gender: member.gender,
         outletId: member.outletId,
         isMobile: member.isMobile || false,
         dateOfBirth: member.dateOfBirth || '',
         dateOfJoining: member.dateOfJoining || '',
         dateOfLeaving: member.dateOfLeaving || '',
         leaveBalanceOverride: member.leaveBalanceOverride,
         leaveBalanceOverrideDate: member.leaveBalanceOverrideDate
      });
      setNewManagerPassword(''); 
      setEditingId(member.id!);
      setIsCreating(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
   };

   const cancelEdit = () => {
      setNewCrew({
         crewName: '',
         crewCode: '',
         email: '',
         phoneNumber: '',
         photoUrl: '',
         role: '',
         gender: undefined,
         outletId: '',
         isMobile: false,
         dateOfBirth: '',
         dateOfJoining: '',
         dateOfLeaving: '',
         leaveBalanceOverride: undefined
      });
      setNewManagerPassword('');
      setEditingId(null);
      setIsCreating(false);
   };

   const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setIsUploadingPhoto(true);
      try {
         // Optimize: resize to max 1024px and re-encode as JPEG before upload.
         const compressed = await compressImage(file, 0.6);
         const url = await employeeService.uploadPhoto(compressed);
         setNewCrew(prev => ({ ...prev, photoUrl: url }));
      } catch (err) {
         console.error("Photo upload failed:", err);
         alert("Photo upload failed. Please try a different image.");
      } finally {
         setIsUploadingPhoto(false);
         e.target.value = '';
      }
   };

   const handleSave = async (forceResetAuth = false) => {
      if(!newCrew.crewName || !newCrew.role || !newCrew.outletId) {
         alert("Name, Role, and Outlet are required.");
         return;
      }

      if (editingId) {
          const list = activeTab === 'CREW' ? crew : managers;
          const original = list.find(c => c.id === editingId);
          if (original && !canModifyAccount(original)) {
              alert("Unauthorized operation.");
              return;
          }
      }

      if (activeTab === 'CREW' && (!newCrew.crewCode || newCrew.crewCode.length < 4)) {
          alert("Crew Code must be at least 4 digits for staff.");
          return;
      }

      // Codes must be unique across crew AND managers: the kiosk resolves the
      // first match, and reusing a code would silently link the new profile to
      // the existing account's auth user (the "recover" fallback below succeeds).
      if (newCrew.crewCode) {
          const codeTaken = [...crew, ...managers].some(m =>
              m.id !== editingId && m.crewCode && m.crewCode === newCrew.crewCode);
          if (codeTaken) {
              alert("This Crew Code is already assigned to another staff member. Codes must be unique.");
              return;
          }
      }

      if (activeTab === 'MANAGERS' && !editingId && (!newCrew.email || !newManagerPassword)) {
          alert("Email and Password are required for new managers.");
          return;
      }

      setIsSavingCrew(true);

      try {
         const list = activeTab === 'CREW' ? crew : managers;
         let authUid = editingId ? (list.find(c => c.id === editingId)?.authUid) : undefined;
         
         if (activeTab === 'CREW') {
             const original = list.find(c => c.id === editingId);
             const codeChanged = original && original.crewCode !== newCrew.crewCode;
             const needsAuth = !authUid || forceResetAuth || codeChanged;

             if (needsAuth) {
                 const syntheticEmail = `${newCrew.crewCode}@neko.local`;
                 const syntheticPassword = `neko${newCrew.crewCode}pulse`; 
                 try {
                     authUid = await employeeService.createAuthUser(syntheticEmail, syntheticPassword);
                 } catch (authErr: any) {
                     if (authErr.code === 'auth/email-already-in-use') {
                        try {
                           authUid = await employeeService.recoverAuthUser(syntheticEmail, syntheticPassword);
                        } catch (recoverErr) {
                            alert("This Crew Code is already in use by another account.");
                            setIsSavingCrew(false);
                            return;
                        }
                     } else {
                         throw authErr;
                     }
                 }
             }
         } else {
             if (!editingId) {
                 try {
                     authUid = await employeeService.createAuthUser(newCrew.email!, newManagerPassword);
                 } catch(authErr: any) {
                     alert("Failed to create Manager Login: " + authErr.message);
                     setIsSavingCrew(false);
                     return;
                 }
             }
         }

         // --- NEW LEAVE BALANCE LOGIC ---
         const existingMember = list.find(c => c.id === editingId);
         let finalOverrideDate = newCrew.leaveBalanceOverrideDate || null;
         
         const overrideValue = newCrew.leaveBalanceOverride;
         const hasOverrideEntered = (overrideValue !== undefined && overrideValue !== null && (overrideValue as any) !== '');
         
         if (hasOverrideEntered) {
             const valChanged = existingMember?.leaveBalanceOverride !== Number(overrideValue);
             if (valChanged || !existingMember?.leaveBalanceOverrideDate) {
                 finalOverrideDate = format(new Date(), 'yyyy-MM-dd');
             }
         } else {
             finalOverrideDate = null; 
         }

         const leaveVal = newCrew.leaveBalanceOverride as any;
         const leaveBalancePayload = (leaveVal !== undefined && leaveVal !== null && leaveVal !== '') 
             ? Number(leaveVal) 
             : firebase.firestore.FieldValue.delete();

         const payload = {
            crewName: newCrew.crewName,
            crewCode: newCrew.crewCode || '',
            email: newCrew.email || null,
            phoneNumber: newCrew.phoneNumber || null,
            photoUrl: newCrew.photoUrl || null,
            role: newCrew.role,
            gender: newCrew.gender || null,
            outletId: newCrew.outletId,
            isMobile: newCrew.isMobile || false,
            dateOfBirth: newCrew.dateOfBirth || null,
            birthMMDD: newCrew.dateOfBirth ? newCrew.dateOfBirth.slice(5, 10) : null,
            dateOfJoining: newCrew.dateOfJoining || null,
            dateOfLeaving: newCrew.dateOfLeaving || null,
            leaveBalanceOverride: leaveBalancePayload,
            leaveBalanceOverrideDate: finalOverrideDate,
            active: !newCrew.dateOfLeaving,
            authUid: authUid || null 
         };

         if (activeTab === 'CREW') {
             await employeeService.saveCrew(payload as any, editingId || undefined);
             const updated = await employeeService.getAllCrew();
             setCrew(updated);
         } else {
             await employeeService.saveManager(payload as any, editingId || undefined);
             const updated = await employeeService.getAllManagers();
             setManagers(updated);
         }
         
         cancelEdit();
         if (forceResetAuth) alert("Login Credentials Regenerated.");
      } catch (error) {
         console.error("Error saving member:", error);
         alert("Failed to save. " + (error as any).message);
      } finally {
         setIsSavingCrew(false);
      }
   };

   const deleteMember = async (e: React.MouseEvent, member: CrewMember) => {
      e.stopPropagation(); e.preventDefault();
      const id = member.id;
      if (!id) return;
      
      if (!canModifyAccount(member)) {
          alert("Security Violation: You cannot delete another Super Admin or Owner.");
          return;
      }

      if(window.confirm(`Permanently delete this ${activeTab === 'CREW' ? 'staff member' : 'manager'}?`)) {
         setDeletingId(id);
         try {
            if (activeTab === 'CREW') {
                await employeeService.deleteCrew(id);
                setCrew(prev => prev.filter(c => c.id !== id));
            } else {
                await employeeService.deleteManager(id);
                setManagers(prev => prev.filter(c => c.id !== id));
            }
            if (editingId === id) cancelEdit();
         } catch (error: any) {
            alert("Failed to delete: " + error.message);
         } finally {
             setDeletingId(null);
         }
      }
   };

   if (isLoading) return <div className="p-20 text-center text-emerald-600 font-bold animate-pulse">Opening Directory...</div>;

   // Check if the current member being edited already has a manual balance
   const currentBeingEdited = rawList.find(c => c.id === editingId);
   const hasExistingOverride = currentBeingEdited?.leaveBalanceOverride !== undefined && currentBeingEdited?.leaveBalanceOverride !== null;
   const isOverrideLocked = !!editingId && hasExistingOverride && !attConfig?.allowLeaveOverrideEdit;

   return (
      <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-6">
         {/* TOP TAB CONTROL - SEGMENTED PILL */}
         <div className="bg-slate-100 p-1.5 rounded-2xl flex w-full md:w-fit mx-auto shadow-inner">
             <button 
                onClick={() => { setActiveTab('CREW'); cancelEdit(); setShowInactive(false); }}
                className={`flex-1 md:w-48 py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${activeTab === 'CREW' ? 'bg-white text-emerald-600 shadow-md' : 'text-slate-500 hover:text-slate-600'}`}
             >
                <Users className={`w-4 h-4 ${activeTab === 'CREW' ? 'text-emerald-500' : 'text-slate-400'}`}/> 
                Staff Directory
             </button>
             <button 
                onClick={() => { setActiveTab('MANAGERS'); cancelEdit(); setShowInactive(false); }}
                className={`flex-1 md:w-48 py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${activeTab === 'MANAGERS' ? 'bg-white text-indigo-600 shadow-md' : 'text-slate-500 hover:text-slate-600'}`}
             >
                <ShieldCheck className={`w-4 h-4 ${activeTab === 'MANAGERS' ? 'text-indigo-500' : 'text-slate-400'}`}/> 
                Managers
             </button>
         </div>

         <div className="grid lg:grid-cols-12 gap-8 items-start">
            
            {/* DIRECTORY SECTION */}
            <div className={`space-y-4 lg:col-span-7 ${isCreating ? 'hidden lg:block' : 'block'}`}>
               <div className="flex flex-col md:flex-row gap-3">
                  <div className="relative flex-1">
                     <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                     <input 
                        type="text"
                        placeholder={`Search ${activeTab === 'CREW' ? 'Staff' : 'Managers'}...`}
                        className="w-full pl-12 pr-4 py-4 rounded-3xl bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all text-sm font-medium"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                     />
                  </div>
                  <button
                     onClick={() => setShowInactive(v => !v)}
                     title={showInactive ? 'Show active members' : 'Show inactive members'}
                     className={`!w-auto px-5 rounded-3xl text-sm font-bold flex items-center justify-center gap-2 border transition-all ${
                        showInactive
                           ? 'bg-slate-700 text-white border-slate-700 shadow-md'
                           : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                     }`}
                  >
                     {showInactive ? <UserCheck className="w-5 h-5"/> : <UserX className="w-5 h-5"/>}
                     {showInactive ? 'Show Active' : `Inactive${inactiveCount > 0 ? ` (${inactiveCount})` : ''}`}
                  </button>
                  <Button className="!w-auto !rounded-3xl" onClick={() => setIsCreating(true)}>
                     <UserPlus className="w-5 h-5 mr-2"/> Add New
                  </Button>
               </div>

               <div className="space-y-3">
                  {currentList.map(c => {
                     const isInactive = isMemberInactive(c);
                     const accentColor = activeTab === 'CREW' ? 'emerald' : 'indigo';
                     const isSelf = c.id === currentUser.dbId || c.authUid === currentUser.uid;
                     const isProtected = isAccountProtected(c);
                     const canMod = canModifyAccount(c);
                     
                     return (
                        <div key={c.id} className={`bg-white p-4 rounded-3xl border shadow-sm flex items-center gap-4 group transition-all hover:shadow-md ${editingId === c.id ? `border-${accentColor}-500 ring-4 ring-${accentColor}-50` : isProtected ? 'border-amber-100 bg-amber-50/10' : 'border-slate-100'}`}>
                           <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-bold text-xl flex-shrink-0 relative overflow-hidden ${isInactive ? 'bg-slate-100 text-slate-400 grayscale' : activeTab === 'CREW' ? 'bg-emerald-100 text-emerald-600' : 'bg-indigo-100 text-indigo-600'}`}>
                              {c.photoUrl ? <img src={c.photoUrl} className="w-full h-full object-cover" alt={c.crewName}/> : c.crewName[0]}
                              {c.authUid && !isInactive && (
                                 <div className="absolute -top-1 -right-1 bg-white rounded-full p-1 shadow-sm border border-slate-50">
                                    <Lock className={`w-3 h-3 ${activeTab === 'CREW' ? 'text-emerald-500' : 'text-indigo-500'}`}/>
                                 </div>
                              )}
                           </div>
                           
                           <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                 <h3 className="font-bold text-slate-800 truncate flex items-center gap-1.5">
                                    {c.crewName}
                                    {isProtected && <span title="Protected Account"><Shield className="w-3.5 h-3.5 text-amber-500" /></span>}
                                 </h3>
                                 {isInactive && <Badge variant="danger" className="!py-0 !text-[8px]">Inactive</Badge>}
                                 {c.isMobile && !isInactive && <Badge variant="neutral" className="!py-0 !text-[8px] !bg-blue-50 !text-blue-600">Mobile</Badge>}
                                 {isSelf && <Badge variant="success" className="!py-0 !text-[8px]">You</Badge>}
                                 {c.gender && <Badge variant="neutral" className="!py-0 !text-[8px] !bg-slate-50 !text-slate-400">{c.gender}</Badge>}
                              </div>
                              <div className="flex items-center flex-wrap gap-x-3 gap-y-1">
                                 <span className={`text-xs font-bold ${activeTab === 'CREW' ? 'text-emerald-600' : 'text-indigo-600'}`}>{c.role}</span>
                                 <span className="text-xs text-slate-400 font-medium flex items-center gap-1"><MapPin className="w-3 h-3"/> {c.outletId}</span>
                                 {activeTab === 'CREW' && <span className="text-xs text-slate-400 font-bold bg-slate-50 px-1.5 rounded">ID: {c.crewCode}</span>}
                              </div>
                           </div>

                           <div className="flex gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                              {canMod ? (
                                  <>
                                    <button onClick={() => startEdit(c)} className={`p-3 rounded-2xl text-slate-400 hover:bg-${accentColor}-50 hover:text-${accentColor}-600 transition-colors`}>
                                        <Edit className="w-5 h-5"/>
                                    </button>
                                    <button onClick={(e) => deleteMember(e, c)} className="p-3 rounded-2xl text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors">
                                        <Trash2 className="w-5 h-5"/>
                                    </button>
                                  </>
                              ) : (
                                  <div className="p-3 text-slate-200 cursor-not-allowed" title="System Protected">
                                      <Lock className="w-5 h-5"/>
                                  </div>
                              )}
                           </div>
                        </div>
                     );
                  })}
                  {currentList.length === 0 && (
                     <div className="text-center py-16 bg-slate-50/50 rounded-[40px] border-2 border-dashed border-slate-200">
                        {showInactive
                           ? <UserX className="w-12 h-12 text-slate-200 mx-auto mb-3"/>
                           : <Users className="w-12 h-12 text-slate-200 mx-auto mb-3"/>}
                        <p className="text-slate-400 font-bold">
                           {searchQuery
                              ? 'No records found matching your search.'
                              : showInactive
                                 ? `No inactive ${activeTab === 'CREW' ? 'staff' : 'managers'}.`
                                 : `No active ${activeTab === 'CREW' ? 'staff' : 'managers'} yet.`}
                        </p>
                     </div>
                  )}
               </div>
            </div>

            {/* FORM SECTION */}
            <div className={`lg:col-span-5 ${!isCreating ? 'hidden lg:block' : 'block'}`}>
               <Card 
                  title={editingId ? "Edit Profile" : "Add Profile"} 
                  className={`sticky top-6 border-t-8 shadow-2xl ${activeTab === 'CREW' ? 'border-t-emerald-500' : 'border-t-indigo-500'}`}
               >
                  <div className="space-y-6">
                     {/* GROUP 1: Personal */}
                     <div>
                        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2"><Info className="w-3 h-3"/> Personal Details</h4>
                        <div className="space-y-4">
                           {/* PHOTO */}
                           <div className="flex items-center gap-4">
                              <div className={`w-20 h-20 rounded-2xl flex items-center justify-center overflow-hidden flex-shrink-0 relative ${activeTab === 'CREW' ? 'bg-emerald-100 text-emerald-600' : 'bg-indigo-100 text-indigo-600'}`}>
                                 {isUploadingPhoto ? (
                                    <Loader2 className="w-6 h-6 animate-spin text-slate-400"/>
                                 ) : newCrew.photoUrl ? (
                                    <img src={newCrew.photoUrl} className="w-full h-full object-cover" alt="Employee"/>
                                 ) : newCrew.crewName ? (
                                    <span className="text-2xl font-bold">{newCrew.crewName[0]}</span>
                                 ) : (
                                    <Camera className="w-7 h-7 opacity-40"/>
                                 )}
                              </div>
                              <div className="flex-1 space-y-2">
                                 <div className="flex gap-2">
                                    <label className="flex-1 cursor-pointer bg-white border border-slate-200 hover:bg-slate-50 rounded-xl py-2.5 px-3 text-xs font-bold text-slate-600 flex items-center justify-center gap-1.5 transition-colors">
                                       <Camera className="w-4 h-4"/> Take Photo
                                       <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoSelect} disabled={isUploadingPhoto} />
                                    </label>
                                    <label className="flex-1 cursor-pointer bg-white border border-slate-200 hover:bg-slate-50 rounded-xl py-2.5 px-3 text-xs font-bold text-slate-600 flex items-center justify-center gap-1.5 transition-colors">
                                       <Upload className="w-4 h-4"/> Upload
                                       <input type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} disabled={isUploadingPhoto} />
                                    </label>
                                 </div>
                                 {newCrew.photoUrl && !isUploadingPhoto && (
                                    <button type="button" onClick={() => setNewCrew(prev => ({ ...prev, photoUrl: '' }))} className="text-[10px] font-bold text-red-500 hover:text-red-600 flex items-center gap-1">
                                       <X className="w-3 h-3"/> Remove photo
                                    </button>
                                 )}
                                 <p className="text-[9px] text-slate-400 italic leading-tight">Auto-optimized to keep file size small.</p>
                              </div>
                           </div>
                           <Input placeholder="Full Name *" value={newCrew.crewName} onChange={e => setNewCrew({...newCrew, crewName: e.target.value})} />
                           <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-1">
                                 <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Date of Birth</label>
                                 <Input type="date" value={newCrew.dateOfBirth || ''} onChange={e => setNewCrew({...newCrew, dateOfBirth: e.target.value})} />
                              </div>
                              <div className="space-y-1">
                                 <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Gender</label>
                                 <Select value={newCrew.gender} onChange={e => setNewCrew({...newCrew, gender: e.target.value as any})}>
                                    <option value="">Select Gender</option>
                                    <option value="Male">Male</option>
                                    <option value="Female">Female</option>
                                    <option value="Others">Others</option>
                                 </Select>
                              </div>
                           </div>
                           <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Phone Number</label>
                              <Input type="tel" placeholder="+91..." value={newCrew.phoneNumber} onChange={e => setNewCrew({...newCrew, phoneNumber: e.target.value})} />
                           </div>
                        </div>
                     </div>

                     {/* GROUP 2: Login & Role */}
                     <div className="p-5 bg-slate-50 rounded-3xl border border-slate-100 space-y-4">
                        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2"><Lock className="w-3 h-3"/> Authentication & Access</h4>
                        
                        <div className="grid grid-cols-2 gap-4">
                           <Select value={newCrew.role} onChange={e => setNewCrew({...newCrew, role: e.target.value})} disabled={!!editingId && isAccountProtected(managers.find(m => m.id === editingId) || crew.find(c => c.id === editingId))}>
                              <option value="">Select Role *</option>
                              {roles.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
                           </Select>
                           <Select value={newCrew.outletId} onChange={e => setNewCrew({...newCrew, outletId: e.target.value})}>
                              <option value="">Select Store *</option>
                              {stores.map(s => <option key={s.id} value={s.outletId}>{s.name}</option>)}
                           </Select>
                        </div>

                        {activeTab === 'CREW' ? (
                           <div className="space-y-4">
                              <div className="space-y-1">
                                 <Input placeholder="Crew PIN (Min 4 digits) *" type="number" value={newCrew.crewCode} onChange={e => setNewCrew({...newCrew, crewCode: e.target.value})} />
                                 <p className="text-[9px] text-slate-400 ml-1 italic font-medium">This PIN will be used for both Kiosk and App access.</p>
                              </div>
                              <div className="bg-indigo-50/50 p-3 rounded-2xl border border-indigo-100/50">
                                 <div className="flex items-center justify-between mb-1">
                                    <label className="text-[10px] font-bold text-indigo-400 uppercase ml-1 block">Leave Balance Override</label>
                                    {/* @fix: Fixed incorrect usage of title prop on Lucide icon */}
                                    {isOverrideLocked && <span title="Locked: Enable editing in Attendance Settings"><Lock className="w-3 h-3 text-slate-300" /></span>}
                                 </div>
                                 <Input 
                                    placeholder="Reset balance to..." 
                                    type="number" 
                                    value={newCrew.leaveBalanceOverride ?? ''} 
                                    disabled={isOverrideLocked}
                                    onChange={e => {
                                       const val = e.target.value;
                                       setNewCrew({...newCrew, leaveBalanceOverride: val === '' ? undefined : Number(val)});
                                    }} 
                                    className={`!py-2 !text-sm ${isOverrideLocked ? 'opacity-60 bg-slate-100 border-dashed border-slate-300' : ''}`} 
                                 />
                                 {isOverrideLocked ? (
                                    <p className="text-[8px] text-amber-600 mt-1 italic leading-tight flex items-center gap-1">
                                       <ShieldAlert size={8}/> Safety Lock: Manage this in Attendance Settings.
                                    </p>
                                 ) : (
                                    <p className="text-[9px] text-slate-400 mt-1 italic leading-tight">Setting this replaces existing balance. Accrual continues from today.</p>
                                 )}
                              </div>
                           </div>
                        ) : (
                           <div className="space-y-3">
                              <Input type="email" placeholder="Manager Email *" value={newCrew.email} onChange={e => setNewCrew({...newCrew, email: e.target.value})} disabled={!!editingId} />
                              {!editingId && <Input type="text" placeholder="Set Password *" value={newManagerPassword} onChange={e => setNewManagerPassword(e.target.value)} />}
                           </div>
                        )}

                        <div className="flex items-center justify-between px-1">
                           <span className="text-xs font-bold text-slate-600">Mobile Employee (Any Store)</span>
                           <Checkbox checked={newCrew.isMobile || false} onChange={e => setNewCrew({...newCrew, isMobile: e.target.checked})} />
                        </div>
                     </div>

                     {/* GROUP 3: Employment */}
                     <div>
                        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2"><Calendar className="w-3 h-3"/> Employment Cycle</h4>
                        <div className="grid grid-cols-2 gap-4">
                           <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Joining Date</label>
                              <Input type="date" value={newCrew.dateOfJoining || ''} onChange={e => setNewCrew({...newCrew, dateOfJoining: e.target.value})} />
                           </div>
                           <div className="space-y-1">
                              <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Relieving Date</label>
                              <Input type="date" value={newCrew.dateOfLeaving || ''} onChange={e => setNewCrew({...newCrew, dateOfLeaving: e.target.value})} />
                           </div>
                        </div>
                     </div>

                     <div className="flex flex-col gap-3 pt-4">
                        <Button onClick={() => handleSave(false)} isLoading={isSavingCrew} className="!py-4 shadow-xl">
                           {editingId ? 'Save Changes' : `Add ${activeTab === 'CREW' ? 'Staff' : 'Manager'}`}
                        </Button>
                        
                        <div className="flex gap-2">
                           {editingId && activeTab === 'CREW' && (
                              <button 
                                 onClick={() => handleSave(true)} 
                                 className="flex-1 py-3 rounded-2xl bg-white border border-slate-200 text-slate-500 text-xs font-bold hover:bg-slate-50 flex items-center justify-center gap-2"
                                 title="Repair Login Credentials"
                              >
                                 <RefreshCcw className="w-3 h-3"/> Fix Login
                              </button>
                           )}
                           <button onClick={cancelEdit} className="flex-1 py-3 rounded-2xl bg-slate-100 text-slate-500 text-xs font-bold hover:bg-slate-200">
                              Cancel
                           </button>
                        </div>
                     </div>
                  </div>
               </Card>

               <Card title="Manage System Roles" className="mt-8 border-l-4 border-l-slate-400">
                  <div className="flex gap-2 mb-4">
                     <Input placeholder="New Role..." value={newRole} onChange={e => setNewRole(e.target.value)} disabled={isSavingRole} className="!py-2.5 !text-sm" />
                     <Button className="!w-auto !py-2 !rounded-xl" onClick={addRole} disabled={isSavingRole} isLoading={isSavingRole}>Add</Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                     {roles.map(r => (
                        <div key={r.id} className="bg-slate-50 border border-slate-200 pl-3 pr-1 py-1 rounded-full text-[11px] font-bold text-slate-600 flex items-center gap-2">
                           {r.name}
                           <button onClick={(e) => { e.stopPropagation(); deleteRole(r.id!); }} className="w-5 h-5 hover:text-red-500 flex items-center justify-center rounded-full hover:bg-red-50 transition-colors">×</button>
                        </div>
                     ))}
                  </div>
               </Card>
            </div>
         </div>
      </div>
   );
};
