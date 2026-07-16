
import React, { useState, useEffect } from 'react';
import { accessService } from '../../../services/accessService';
import { AccessConfig, MODULE_IDS } from '../../../types';
import { Button, Card, Checkbox, Badge } from '../../../components/SharedComponents';
import { Save, AlertCircle, Loader2, Info } from 'lucide-react';

export const AccessAdminView: React.FC = () => {
   const [roles, setRoles] = useState<string[]>([]);
   const [config, setConfig] = useState<AccessConfig>({});
   const [isLoading, setIsLoading] = useState(true);
   const [isSaving, setIsSaving] = useState(false);

   useEffect(() => {
      load();
   }, []);

   const load = async () => {
      try {
         const [rolesData, configData] = await Promise.all([
             accessService.getRoles(),
             accessService.getAccessConfig()
         ]);
         
         setRoles(rolesData);
         setConfig(configData);
      } catch (error) {
         console.error("Error loading access config:", error);
         alert("Failed to load access configuration. Please check your connection.");
      } finally {
         setIsLoading(false);
      }
   };

   const toggle = (mod: string, role: string) => {
      const current = config[mod] || [];
      const updated = current.includes(role) 
         ? current.filter(r => r !== role) 
         : [...current, role];
      setConfig({...config, [mod]: updated});
   };

   const save = async () => {
      setIsSaving(true);
      try {
         await accessService.saveAccessConfig(config);
         alert("Configuration Saved Successfully!");
      } catch (error: any) {
         console.error("Save error:", error);
         alert(`Failed to save: ${error.message || "Unknown error"}. Check database permissions.`);
      } finally {
         setIsSaving(false);
      }
   };

   // Define groups for UI clarity
   const adminModules = [
      MODULE_IDS.ACCURACY,
      MODULE_IDS.TASKS,
      MODULE_IDS.EMPLOYEE,
      MODULE_IDS.SHIFTS, 
      MODULE_IDS.HR,
      MODULE_IDS.BLUEBOOK, // Added Bluebook Admin
      MODULE_IDS.RECIPE, // Kitchen Recipes (AdminLayout gates the card on this ID)
      MODULE_IDS.REPORTS,
      MODULE_IDS.EOM, 
      MODULE_IDS.MANAGER_MEET, 
      MODULE_IDS.ATTENDANCE,
      MODULE_IDS.STORES,
      MODULE_IDS.SETTINGS 
   ];

   const crewFeatures = [
      MODULE_IDS.CREW_ORDERS,
      MODULE_IDS.CREW_TASKS,
      MODULE_IDS.CREW_BLUEBOOK, // Added Bluebook Viewer for Crew
      MODULE_IDS.CREW_RECIPE, // Recipe viewer tab in the crew app
      MODULE_IDS.CREW_SHIFTS,
      MODULE_IDS.CREW_EOM
   ];

   // Admin tools exposed inside the CREW app (stored as CREWADMIN_<module>).
   // Kept separate from the manager rows above so granting a manager role a
   // dashboard module doesn't leak admin pages to staff who share the role
   // name. Only the modules CrewLayout can actually render are listed.
   const crewAdminModules = [
      MODULE_IDS.ACCURACY,
      MODULE_IDS.TASKS,
      MODULE_IDS.EMPLOYEE,
      MODULE_IDS.STORES,
      MODULE_IDS.SHIFTS,
      MODULE_IDS.BLUEBOOK,
      MODULE_IDS.EOM,
      MODULE_IDS.ATTENDANCE
   ];

   if (isLoading) return <div className="p-8 text-center text-emerald-600 font-bold flex items-center justify-center gap-2"><Loader2 className="animate-spin"/> Loading Access Matrix...</div>;

   return (
      <div className="max-w-6xl mx-auto p-4 md:p-8">
         <Card title="Access Control Matrix">
            <div className="mb-6 bg-indigo-50 p-4 rounded-xl border border-indigo-100 flex gap-3">
               <Info className="w-5 h-5 text-indigo-500 flex-shrink-0 mt-0.5" />
               <div className="text-sm text-indigo-800">
                  <p className="font-bold mb-1">How this works:</p>
                  <p className="mb-2">1. <strong>Admin Modules:</strong> Grant roles access to dashboard tools (e.g., Manager can see Analytics).</p>
                  <p>2. <strong>Crew Features:</strong> Grant roles access to app tabs (e.g., Social Media Lead can see Order Accuracy).</p>
               </div>
            </div>

            {roles.length === 0 ? (
               <div className="text-center p-12 border-2 border-dashed border-slate-200 rounded-xl">
                  <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-3"/>
                  <h3 className="text-lg font-bold text-slate-600">No Management Roles Found</h3>
                  <p className="text-slate-400 mb-4">Please create roles (e.g., Manager, Supervisor) in the Employees module first.</p>
               </div>
            ) : (
               <>
                  <div className="overflow-x-auto">
                     <table className="w-full text-sm">
                        <thead>
                           <tr className="bg-slate-50 border-b border-slate-100">
                              <th className="text-left p-4 font-bold text-slate-500 uppercase tracking-wider">Module / Feature</th>
                              {roles.map(r => (
                                 <th key={r} className="p-4 text-center font-bold text-slate-700 min-w-[100px]">
                                    <Badge variant="neutral">{r}</Badge>
                                 </th>
                              ))}
                           </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                           {/* ADMIN SECTION */}
                           <tr>
                              <td colSpan={roles.length + 1} className="bg-slate-100 p-2 pl-4 text-xs font-bold text-slate-500 uppercase tracking-widest">
                                 Admin Dashboard Modules
                              </td>
                           </tr>
                           {adminModules.map(mod => (
                              <tr key={mod} className="hover:bg-slate-50 transition-colors">
                                 <td className="p-4 font-bold text-slate-800 flex items-center gap-2">
                                    {mod}
                                 </td>
                                 {roles.map(r => (
                                    <td key={r} className="p-4 text-center">
                                       <div className="flex justify-center">
                                          <Checkbox 
                                             checked={config[mod]?.includes(r) || false} 
                                             onChange={() => toggle(mod, r)} 
                                          />
                                       </div>
                                    </td>
                                 ))}
                              </tr>
                           ))}

                           {/* CREW SECTION */}
                           <tr>
                              <td colSpan={roles.length + 1} className="bg-indigo-50 p-2 pl-4 text-xs font-bold text-indigo-500 uppercase tracking-widest border-t border-indigo-100">
                                 Crew App Features (Tablet)
                              </td>
                           </tr>
                           {crewFeatures.map(mod => (
                              <tr key={mod} className="hover:bg-slate-50 transition-colors">
                                 <td className="p-4 font-bold text-slate-800 flex items-center gap-2">
                                    {mod}
                                 </td>
                                 {roles.map(r => (
                                    <td key={r} className="p-4 text-center">
                                       <div className="flex justify-center">
                                          <Checkbox
                                             checked={config[mod]?.includes(r) || false}
                                             onChange={() => toggle(mod, r)}
                                          />
                                       </div>
                                    </td>
                                 ))}
                              </tr>
                           ))}

                           {/* CREW ADMIN TOOLS SECTION */}
                           <tr>
                              <td colSpan={roles.length + 1} className="bg-rose-50 p-2 pl-4 text-xs font-bold text-rose-500 uppercase tracking-widest border-t border-rose-100">
                                 Crew App: Admin Tools (staff see these admin pages inside their app)
                              </td>
                           </tr>
                           {crewAdminModules.map(mod => {
                              const key = `CREWADMIN_${mod}`;
                              return (
                                 <tr key={key} className="hover:bg-slate-50 transition-colors">
                                    <td className="p-4 font-bold text-slate-800 flex items-center gap-2">
                                       {mod}
                                    </td>
                                    {roles.map(r => (
                                       <td key={r} className="p-4 text-center">
                                          <div className="flex justify-center">
                                             <Checkbox
                                                checked={config[key]?.includes(r) || false}
                                                onChange={() => toggle(key, r)}
                                             />
                                          </div>
                                       </td>
                                    ))}
                                 </tr>
                              );
                           })}
                        </tbody>
                     </table>
                  </div>
                  <div className="mt-8 flex justify-end pt-4 border-t border-slate-100">
                     <Button className="!w-auto min-w-[150px]" onClick={save} isLoading={isSaving}>
                        <Save className="w-4 h-4 mr-2"/> Save Changes
                     </Button>
                  </div>
               </>
            )}
         </Card>
      </div>
   );
};
