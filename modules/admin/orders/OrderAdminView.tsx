import React, { useState, useEffect } from 'react';
import { orderService } from '../../../services/orderService';
import { OrderValidation, OrderItem } from '../../../types';
import { Button, Card, Badge, FullScreenImageViewer, Input, Checkbox, Select } from '../../../components/SharedComponents';
import { CheckCircle, Trash2, Share2, Filter, Sun, Moon } from 'lucide-react';
import { format, isWithinInterval, endOfDay } from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';

// --- HELPERS ---
const parseISO = (str: string) => {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const startOfDay = (d: Date) => {
  const newDate = new Date(d);
  newDate.setHours(0, 0, 0, 0);
  return newDate;
};

const subDays = (d: Date, days: number) => {
  const newDate = new Date(d);
  newDate.setDate(d.getDate() - days);
  return newDate;
};

export const OrderAdminView: React.FC = () => {
  const [validations, setValidations] = useState<OrderValidation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  // Filters
  const [dateRange, setDateRange] = useState({ 
    start: format(subDays(new Date(), 7), 'yyyy-MM-dd'), 
    end: format(new Date(), 'yyyy-MM-dd') 
  });
  const [outletFilter, setOutletFilter] = useState('ALL');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await orderService.getRecentValidations(500);
      setValidations(data);
    } catch (error) {
      console.error("Order load error", error);
    } finally {
      setLoading(false);
    }
  };

  // --- DERIVED DATA ---
  const filteredData = validations.filter(v => {
    if (!v.validatedAt) return false;
    const date = v.validatedAt.toDate ? v.validatedAt.toDate() : new Date(v.validatedAt);
    const start = startOfDay(parseISO(dateRange.start));
    const end = endOfDay(parseISO(dateRange.end));
    
    const inDate = isWithinInterval(date, { start, end });
    const inOutlet = outletFilter === 'ALL' || v.outletId === outletFilter;
    
    return inDate && inOutlet;
  });

  const uniqueOutlets = Array.from(new Set(validations.map(v => v.outletId).filter(Boolean)));

  // Analytics: Volume
  const volumeData = (() => {
    const grouped: any = {};
    filteredData.forEach(v => {
       const date = v.validatedAt?.toDate ? format(v.validatedAt.toDate(), 'MM/dd') : 'N/A';
       if (!grouped[date]) grouped[date] = { date, count: 0 };
       grouped[date].count++;
    });
    return Object.values(grouped).reverse();
  })();

  // Analytics: Time of Day
  const timeOfDayData = (() => {
    let morning = 0;   // < 12
    let afternoon = 0; // 12 - 17
    let evening = 0;   // > 17
    
    filteredData.forEach(v => {
        if (!v.validatedAt) return;
        const date = v.validatedAt.toDate ? v.validatedAt.toDate() : new Date(v.validatedAt);
        const hour = date.getHours();
        
        if (hour < 12) morning++;
        else if (hour < 17) afternoon++;
        else evening++;
    });

    return [
        { name: 'Morning', count: morning, color: '#fbbf24', icon: <Sun className="w-4 h-4"/> },    // Amber
        { name: 'Afternoon', count: afternoon, color: '#fb923c', icon: <Sun className="w-4 h-4"/> }, // Orange
        { name: 'Evening', count: evening, color: '#818cf8', icon: <Moon className="w-4 h-4"/> }     // Indigo
    ];
  })();

  // Analytics: Food vs Drink
  const itemCategoryData = (() => {
    let foodCount = 0;
    let drinkCount = 0;
    filteredData.forEach(v => {
      v.items.forEach(item => {
        if (item.category === 'food') foodCount += item.quantity;
        if (item.category === 'drink') drinkCount += item.quantity;
      });
    });
    const total = foodCount + drinkCount || 1;
    return [
      { name: 'Drinks', value: drinkCount, percentage: ((drinkCount/total)*100).toFixed(1), color: '#8b5cf6' }, // Violet
      { name: 'Food', value: foodCount, percentage: ((foodCount/total)*100).toFixed(1), color: '#f97316' }   // Orange
    ];
  })();

  // Analytics: Top Customers
  const topCustomers = (() => {
    const counts: Record<string, number> = {};
    filteredData.forEach(v => {
      const name = v.customerName || 'Guest';
      if (name !== 'Guest') {
        counts[name] = (counts[name] || 0) + 1;
      }
    });
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(20);
  })();

  // --- ACTIONS ---
  const handleSelectAll = (checked: boolean) => {
    if (checked) setSelectedIds(new Set(filteredData.map(v => v.id!)));
    else setSelectedIds(new Set());
  };

  const handleSelectOne = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const handleDelete = async () => {
    if (!confirm(`Delete ${selectedIds.size} records? This cannot be undone.`)) return;
    try {
      await Promise.all(Array.from(selectedIds).map((id) => orderService.deleteValidation(id as string)));
      setValidations(prev => prev.filter(v => !selectedIds.has(v.id!)));
      setSelectedIds(new Set());
    } catch (e) {
      alert("Delete failed");
    }
  };

  const shareViaWhatsapp = (v: OrderValidation) => {
    const imageUrl = v.photos?.[0] || '';
    const text = `*Order Validation Report*\nOrder ID: ${v.orderId}\nCustomer: ${v.customerName}\nItems: ${v.items.length}\nCrew: ${v.validatedByCrewName}\nTime: ${format(v.validatedAt.toDate(), 'p')}\n\nProof: ${imageUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  if (loading) return <div className="p-12 text-center text-emerald-600 font-bold animate-pulse">Loading analytics...</div>;

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-6">
       
       {/* ANALYTICS ROW 1: Volume & Categories */}
       <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         <Card className="md:col-span-2 bg-white">
            <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2"><CheckCircle className="w-5 h-5 text-emerald-500"/> Order Volume</h3>
            <div className="h-64">
               <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={volumeData}>
                     <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                     <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                     <Tooltip cursor={{fill: '#ecfdf5'}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                     <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} barSize={40} />
                  </BarChart>
               </ResponsiveContainer>
            </div>
         </Card>
         
         <Card className="bg-white">
            <h3 className="font-bold text-slate-700 mb-4">Drink vs. Food</h3>
            <div className="h-48 relative">
               <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                     <Pie data={itemCategoryData} cx="50%" cy="50%" innerRadius={50} outerRadius={70} paddingAngle={5} dataKey="value">
                        {itemCategoryData.map((entry, index) => (
                           <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                     </Pie>
                     <Tooltip />
                  </PieChart>
               </ResponsiveContainer>
               {/* Center Text */}
               <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center">
                    <span className="text-xs text-slate-400 font-bold">Total Items</span>
                    <div className="text-xl font-bold text-slate-700">{itemCategoryData[0].value + itemCategoryData[1].value}</div>
                  </div>
               </div>
            </div>
            <div className="mt-4 space-y-3">
               {itemCategoryData.map(d => (
                 <div key={d.name} className="flex justify-between items-center text-sm">
                    <div className="flex items-center gap-2">
                       <div className="w-3 h-3 rounded-full" style={{backgroundColor: d.color}}></div>
                       <span className="font-medium text-slate-600">{d.name}</span>
                    </div>
                    <div className="font-bold text-slate-800">{d.value} ({d.percentage}%)</div>
                 </div>
               ))}
            </div>
         </Card>
      </div>

      {/* ANALYTICS ROW 2: Time of Day & Top Customers */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Time of Day */}
        <Card title="Time of Day" className="bg-white">
            <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={timeOfDayData} layout="vertical">
                        <XAxis type="number" hide />
                        <YAxis dataKey="name" type="category" width={70} tick={{fontSize: 10, fill: '#64748b'}} axisLine={false} tickLine={false} />
                        <Tooltip cursor={{fill: 'transparent'}} />
                        <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={24}>
                            {timeOfDayData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
            <div className="mt-4 space-y-2">
                {timeOfDayData.map(d => (
                    <div key={d.name} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 text-slate-600">
                           <div className="w-3 h-3 rounded-full" style={{backgroundColor: d.color}}></div>
                           {d.name}
                        </div>
                        <span className="font-bold text-slate-800">{d.count} orders</span>
                    </div>
                ))}
            </div>
        </Card>

        {/* Top Customers */}
        <Card title="Top 20 Customers" className="md:col-span-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {topCustomers.map((c, i) => (
                <div key={c.name} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white ${i < 3 ? 'bg-amber-400 shadow-amber-200 shadow-md' : 'bg-slate-300'}`}>
                        #{i+1}
                    </div>
                    <div className="overflow-hidden">
                        <div className="font-bold text-slate-700 truncate">{c.name}</div>
                        <div className="text-xs text-slate-400">{c.count} orders recorded</div>
                    </div>
                </div>
            ))}
            {topCustomers.length === 0 && <p className="text-slate-400 p-2 text-center col-span-3">No customer data available for this period.</p>}
            </div>
        </Card>
      </div>

      {/* FILTER TOOLBAR */}
      <Card className="bg-white">
         <div className="flex flex-col md:flex-row gap-4 justify-between items-end md:items-center">
            <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto">
               <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 uppercase">Date Range</label>
                  <div className="flex items-center gap-2">
                     <Input type="date" value={dateRange.start} onChange={e => setDateRange({...dateRange, start: e.target.value})} className="!py-2 !px-3" />
                     <span className="text-slate-300">-</span>
                     <Input type="date" value={dateRange.end} onChange={e => setDateRange({...dateRange, end: e.target.value})} className="!py-2 !px-3" />
                  </div>
               </div>
               <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 uppercase">Outlet</label>
                  <Select value={outletFilter} onChange={e => setOutletFilter(e.target.value)} className="!py-2 !px-3">
                     <option value="ALL">All Outlets</option>
                     {uniqueOutlets.map(o => <option key={o} value={o}>{o}</option>)}
                  </Select>
               </div>
            </div>
            
            <div className="flex gap-2 w-full md:w-auto">
               {selectedIds.size > 0 && (
                  <Button variant="danger" onClick={handleDelete} className="!w-auto !py-2.5">
                     <Trash2 className="w-4 h-4"/> Delete ({selectedIds.size})
                  </Button>
               )}
               <Button variant="secondary" onClick={() => loadData()} className="!w-auto !py-2.5">
                  Refesh Data
               </Button>
            </div>
         </div>
      </Card>

      {/* DATA TABLE */}
      <Card title="Validation Logs" className="overflow-hidden">
         <div className="overflow-x-auto">
            <table className="w-full text-sm">
               <thead className="bg-slate-50 text-slate-500 uppercase text-xs font-bold tracking-wider">
                  <tr>
                     <th className="px-4 py-4 w-10 text-center">
                        <Checkbox checked={selectedIds.size === filteredData.length && filteredData.length > 0} onChange={(e) => handleSelectAll(e.target.checked)} />
                     </th>
                     <th className="px-4 py-4 text-left">Order Details</th>
                     <th className="px-4 py-4 text-left">Item Validations</th>
                     <th className="px-4 py-4 text-left">Customer Stats</th>
                     <th className="px-4 py-4 text-left">Photos</th>
                     <th className="px-4 py-4 text-right">Actions</th>
                  </tr>
               </thead>
               <tbody className="divide-y divide-slate-100">
                  {filteredData.map((v) => (
                     <tr key={v.id} className={`hover:bg-slate-50/80 transition-colors ${selectedIds.has(v.id!) ? 'bg-emerald-50/50' : ''}`}>
                        <td className="px-4 py-3 text-center">
                           <Checkbox checked={selectedIds.has(v.id!)} onChange={() => handleSelectOne(v.id!)} />
                        </td>
                        <td className="px-4 py-3">
                           <div className="font-bold text-slate-800">#{v.orderId}</div>
                           <div className="text-xs text-slate-500">{v.validatedAt?.toDate ? format(v.validatedAt.toDate(), 'PPP p') : '-'}</div>
                           <div className="text-xs text-slate-400 mt-1">{v.outletId}</div>
                        </td>
                        <td className="px-4 py-3">
                            <div className="flex flex-col gap-1">
                                {v.items.map((item, idx) => (
                                    <div key={idx} className="flex items-center gap-2 text-xs">
                                        <span className={`w-2 h-2 rounded-full ${item.validation?.correct ? 'bg-emerald-500' : 'bg-red-400'}`}></span>
                                        <span className="font-medium text-slate-700">{item.name}</span>
                                        <div className="flex gap-1 ml-auto">
                                            {item.validation?.packaging?.napkin && <span title="Napkin" className="text-[10px] bg-slate-100 px-1 rounded text-slate-500">NP</span>}
                                            {item.validation?.packaging?.straw && <span title="Straw" className="text-[10px] bg-indigo-50 px-1 rounded text-indigo-500">ST</span>}
                                            {item.validation?.packaging?.cutlery && <span title="Cutlery" className="text-[10px] bg-orange-50 px-1 rounded text-orange-500">CT</span>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                           <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-100">
                              <div className="w-5 h-5 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center text-[10px] font-bold">
                                 {v.validatedByCrewName?.[0]}
                              </div>
                              <span className="text-xs text-slate-400">Checked by {v.validatedByCrewName}</span>
                           </div>
                        </td>
                        <td className="px-4 py-3">
                           <div className="flex flex-col">
                              <span className="font-bold text-slate-700">{v.customerName}</span>
                              {v.customerOrderCount && v.customerOrderCount > 0 && (
                                 <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full w-fit mt-1">
                                    Visit #{v.customerOrderCount}
                                 </span>
                              )}
                           </div>
                        </td>
                        <td className="px-4 py-3">
                           <div className="flex -space-x-2 overflow-hidden">
                              {v.photos?.map((photo, i) => (
                                 <FullScreenImageViewer key={i} src={photo}>
                                    <div className="relative group cursor-pointer w-10 h-10 rounded-full overflow-hidden border-2 border-white shadow-sm ring-1 ring-slate-100">
                                       <img src={photo} className="w-full h-full object-cover" />
                                    </div>
                                 </FullScreenImageViewer>
                              ))}
                              {!v.photos?.length && <span className="text-slate-300 text-xs italic">No Img</span>}
                           </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                           <div className="flex items-center justify-end gap-2">
                              <button 
                                 onClick={() => shareViaWhatsapp(v)}
                                 className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                 title="Share on WhatsApp"
                              >
                                 <Share2 className="w-5 h-5" />
                              </button>
                              <button 
                                 onClick={() => {
                                     if(confirm('Delete single record?')) {
                                         orderService.deleteValidation(v.id!).then(() => setValidations(prev => prev.filter(x => x.id !== v.id)));
                                     }
                                 }}
                                 className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                              >
                                 <Trash2 className="w-5 h-5" />
                              </button>
                           </div>
                        </td>
                     </tr>
                  ))}
               </tbody>
            </table>
            {filteredData.length === 0 && (
               <div className="p-12 text-center text-slate-400 flex flex-col items-center">
                  <Filter className="w-12 h-12 mb-2 opacity-20"/>
                  <p>No orders found for the selected filters.</p>
               </div>
            )}
         </div>
      </Card>
    </div>
  );
};