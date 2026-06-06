
import React, { useState, useEffect } from 'react';
import { orderService } from '../../../services/orderService';
import { CurrentUser, OrderValidation, OrderItem } from '../../../types';
import { Button, Card, Badge, FullScreenImageViewer } from '../../../components/SharedComponents';
import { Camera, CheckCircle, History, ChevronLeft, Image as ImageIcon, Loader2, X, PackageCheck, Coffee, Utensils, Paperclip, Eye } from 'lucide-react';
import { format } from 'date-fns';
import { compressImage } from '../../../services/imageService';
import { fileToGenerativePart, parseOrderImage } from '../../../services/geminiService';

export const OrderCrewView: React.FC<{ currentUser: CurrentUser }> = ({ currentUser }) => {
  const [step, setStep] = useState<'HOME' | 'REVIEW' | 'SUCCESS'>('HOME');
  const [isLoading, setIsLoading] = useState(false);
  const [orderData, setOrderData] = useState<Partial<OrderValidation>>({});
  
  // New Photo State (Multiple)
  const [photos, setPhotos] = useState<Blob[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [history, setHistory] = useState<OrderValidation[]>([]);

  // Detailed View State
  const [viewingOrder, setViewingOrder] = useState<OrderValidation | null>(null);

  useEffect(() => {
     if (step === 'HOME') loadHistory();
  }, [step]);

  const loadHistory = async () => {
     const data = await orderService.getMyHistory(currentUser.uid);
     setHistory(data);
  };

  // INITIAL SCAN (Receipt)
  const handleReceiptCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
     if(!e.target.files?.[0]) return;
     setIsLoading(true);
     try {
        const file = e.target.files[0];
        // Compress before OCR: keeps the upload under the serverless body limit
        // and reduces Gemini token cost. 0.7 quality stays legible for text.
        const compressed = await compressImage(file, 0.7);
        const base64 = await fileToGenerativePart(compressed);
        const aiData = await parseOrderImage(base64);
        
        // Add local validation state to items
        const items = aiData.items.map((i: any) => ({ 
            ...i, 
            validation: { 
                correct: false, 
                packaging: { napkin: false, straw: false, cutlery: false } 
            } 
        }));
        setOrderData({ ...aiData, items });
        
        // Reset photos
        setPhotos([]);
        setPreviewUrls([]);
        
        setStep('REVIEW');
     } catch(e) {
        alert("AI Processing failed. Retrying...");
        setStep('HOME');
     } finally {
        setIsLoading(false);
     }
  };

  // PACKAGING PHOTO CAPTURE (Multi-photo, High Compression)
  const handlePackagingCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
     if(!e.target.files?.[0]) return;
     if(photos.length >= 4) { alert("Max 4 photos allowed."); return; }
     
     setIsLoading(true);
     try {
        const file = e.target.files[0];
        // Reduce size by 90% (quality 0.1)
        const compressed = await compressImage(file, 0.1); 
        
        setPhotos(prev => [...prev, compressed]);
        setPreviewUrls(prev => [...prev, URL.createObjectURL(compressed)]);
     } catch(err) {
        console.error("Compression failed", err);
     } finally {
        setIsLoading(false);
     }
  };

  const removePhoto = (index: number) => {
     setPhotos(prev => prev.filter((_, i) => i !== index));
     setPreviewUrls(prev => prev.filter((_, i) => i !== index));
  };

  // --- ITEM VALIDATION LOGIC ---
  const toggleItemCheck = (idx: number, field: 'correct' | 'napkin' | 'straw' | 'cutlery') => {
      const newItems: OrderItem[] = [...(orderData.items || [])];
      
      if (!newItems[idx].validation) {
          newItems[idx].validation = { correct: false, packaging: { napkin: false } };
      }
      const validation = newItems[idx].validation!;
      const packaging = validation.packaging!;

      if (field === 'correct') {
          validation.correct = !validation.correct;
      } else {
          // Toggle packaging fields
          if (field === 'napkin') packaging.napkin = !packaging.napkin;
          if (field === 'straw') packaging.straw = !packaging.straw;
          if (field === 'cutlery') packaging.cutlery = !packaging.cutlery;
      }
      
      setOrderData({ ...orderData, items: newItems });
  };

  const submit = async () => {
      setIsLoading(true);
      try {
         // Upload all proofs
         const urls = await Promise.all(photos.map(async p => orderService.uploadProof(p)));

         // Aggregate for backward compatibility in Admin Views
         const accessoriesChecked = {
            napkinIncluded: orderData.items?.every(i => i.validation?.packaging?.napkin) || false,
            strawIncluded: orderData.items?.some(i => i.category === 'drink' && i.validation?.packaging?.straw),
            cutleryIncluded: orderData.items?.some(i => i.category === 'food' && i.validation?.packaging?.cutlery),
         };

         const payload = {
             ...orderData,
             photos: urls,
             validatedByCrewId: currentUser.uid,
             validatedByCrewName: currentUser.name || 'Crew',
             status: 'completed',
             outletId: currentUser.outletId || '',
             accessoriesChecked
         } as any; // Cast to bypass ID omission

         await orderService.saveValidation(payload);
         setStep('SUCCESS');
      } catch(e) { 
          alert("Submit failed"); 
      } finally { 
          setIsLoading(false); 
      }
  };

  // Validation Logic for Submit Button
  const canSubmit = () => {
     if (photos.length === 0) return false;
     
     // Check if every item is fully validated
     const allValid = orderData.items?.every(item => {
         const val = item.validation;
         if (!val?.correct) return false; // Item itself must be verified
         
         // Packaging checks
         if (!val.packaging?.napkin) return false; // Napkin mandatory for all
         if (item.category === 'drink' && !val.packaging?.straw) return false; // Straw mandatory for drink
         if (item.category === 'food' && !val.packaging?.cutlery) return false; // Cutlery mandatory for food
         
         return true;
     });

     return allValid;
  };

  // --- DETAILED VIEW FOR HISTORY ---
  if (viewingOrder) return (
     <div className="space-y-4 animate-in slide-in-from-right">
        <div className="flex items-center gap-2">
           <Button variant="secondary" className="!w-auto !p-2" onClick={() => setViewingOrder(null)}><ChevronLeft/></Button>
           <h2 className="text-xl font-bold">Order Details</h2>
        </div>
        
        <Card className="bg-white border border-slate-200">
           <div className="flex justify-between items-start mb-4">
              <div>
                 <div className="text-xl font-bold text-slate-800">#{viewingOrder.orderId}</div>
                 <div className="text-sm text-slate-500">{viewingOrder.validatedAt?.toDate ? format(viewingOrder.validatedAt.toDate(), 'PPP p') : ''}</div>
              </div>
              <Badge variant="success">Completed</Badge>
           </div>
           
           <div className="text-sm font-bold text-slate-600 mb-2">Customer: {viewingOrder.customerName || 'Guest'}</div>
           
           <div className="space-y-3 mt-4">
              {viewingOrder.items.map((item, i) => (
                  <div key={i} className="bg-slate-50 p-3 rounded-lg flex justify-between items-center">
                      <div>
                         <div className="font-bold text-slate-800">{item.quantity}x {item.name}</div>
                         <div className="flex gap-2 mt-1">
                             {item.validation?.packaging?.napkin && <span className="text-[10px] bg-white px-1.5 py-0.5 rounded text-slate-500 border">Napkin</span>}
                             {item.validation?.packaging?.straw && <span className="text-[10px] bg-white px-1.5 py-0.5 rounded text-indigo-500 border border-indigo-100">Straw</span>}
                             {item.validation?.packaging?.cutlery && <span className="text-[10px] bg-white px-1.5 py-0.5 rounded text-orange-500 border border-orange-100">Cutlery</span>}
                         </div>
                      </div>
                      <CheckCircle className="w-5 h-5 text-emerald-500"/>
                  </div>
              ))}
           </div>

           <div className="mt-6">
              <div className="text-xs font-bold text-slate-400 uppercase mb-2">Proof Photos</div>
              <div className="flex gap-2 overflow-x-auto pb-2">
                 {viewingOrder.photos?.map((p, i) => (
                    <FullScreenImageViewer key={i} src={p}>
                        <img src={p} className="w-20 h-20 object-cover rounded-lg border border-slate-200 cursor-pointer"/>
                    </FullScreenImageViewer>
                 ))}
                 {!viewingOrder.photos?.length && <p className="text-xs text-slate-400 italic">No photos attached.</p>}
              </div>
           </div>
        </Card>
     </div>
  );

  if (step === 'SUCCESS') return (
     <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <CheckCircle className="w-16 h-16 text-emerald-500 mb-4"/>
        <h2 className="text-2xl font-bold mb-2">Order Verified!</h2>
        <Button onClick={() => { setStep('HOME'); setOrderData({}); setPhotos([]); setPreviewUrls([]); }} className="w-48">Next Order</Button>
     </div>
  );

  if (step === 'REVIEW') return (
     <div>
        <div className="flex items-center gap-2 mb-4">
           <Button variant="secondary" className="!w-auto !p-2" onClick={() => setStep('HOME')}><ChevronLeft/></Button>
           <h2 className="text-xl font-bold">Review Order</h2>
        </div>
        
        {/* Customer Info Card */}
        <Card className="mb-4 bg-indigo-50 border-indigo-100">
           <div className="flex justify-between items-center">
              <div>
                 <div className="text-xs font-bold text-indigo-400 uppercase">Customer</div>
                 <div className="font-bold text-indigo-900 text-lg">{orderData.customerName || "Guest"}</div>
              </div>
              {orderData.customerOrderCount && orderData.customerOrderCount > 0 && (
                 <div className="text-right">
                    <div className="text-xs font-bold text-indigo-400 uppercase">Visit #</div>
                    <div className="font-bold text-indigo-900 text-lg">{orderData.customerOrderCount}</div>
                 </div>
              )}
           </div>
        </Card>

        {/* ITEMS & PACKAGING LIST */}
        <Card className="mb-4" title="1. Verify Items & Packaging">
           <div className="space-y-6">
               {(orderData.items as OrderItem[])?.map((item, i) => (
                   <div key={i} className="pb-4 border-b last:border-0 last:pb-0">
                      {/* Item Header */}
                      <div className="flex justify-between items-center mb-3">
                         <div>
                            <span className="font-bold text-lg">{item.quantity}x {item.name}</span>
                            <div className="flex gap-2 mt-1">
                                <Badge>{item.category}</Badge>
                            </div>
                         </div>
                         <button 
                            onClick={() => toggleItemCheck(i, 'correct')} 
                            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${item.validation?.correct ? 'bg-emerald-500 text-white shadow-emerald-200 shadow-lg' : 'bg-slate-100 text-slate-300'}`}
                         >
                            <CheckCircle className="w-6 h-6"/>
                         </button>
                      </div>

                      {/* Packaging Essentials for THIS item */}
                      <div className="bg-slate-50 p-3 rounded-xl">
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                             <PackageCheck className="w-3 h-3"/> Required Essentials
                          </div>
                          <div className="flex flex-wrap gap-2">
                             {/* Napkin (Universal) */}
                             <label className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all ${item.validation?.packaging?.napkin ? 'bg-emerald-100 border-emerald-300 text-emerald-700' : 'bg-white border-slate-200 text-slate-500'}`}>
                                <input type="checkbox" className="hidden" checked={item.validation?.packaging?.napkin || false} onChange={() => toggleItemCheck(i, 'napkin')} />
                                <Paperclip className="w-3 h-3"/> 
                                <span className="text-xs font-bold">Napkin</span>
                             </label>

                             {/* Category Specific */}
                             {item.category === 'drink' && (
                                <label className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all ${item.validation?.packaging?.straw ? 'bg-indigo-100 border-indigo-300 text-indigo-700' : 'bg-white border-slate-200 text-slate-500'}`}>
                                    <input type="checkbox" className="hidden" checked={item.validation?.packaging?.straw || false} onChange={() => toggleItemCheck(i, 'straw')} />
                                    <Coffee className="w-3 h-3"/> 
                                    <span className="text-xs font-bold">Straw</span>
                                </label>
                             )}

                             {item.category === 'food' && (
                                <label className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all ${item.validation?.packaging?.cutlery ? 'bg-orange-100 border-orange-300 text-orange-700' : 'bg-white border-slate-200 text-slate-500'}`}>
                                    <input type="checkbox" className="hidden" checked={item.validation?.packaging?.cutlery || false} onChange={() => toggleItemCheck(i, 'cutlery')} />
                                    <Utensils className="w-3 h-3"/> 
                                    <span className="text-xs font-bold">Cutlery</span>
                                </label>
                             )}
                          </div>
                      </div>
                   </div>
               ))}
           </div>
        </Card>

        {/* PHOTO PROOF */}
        <Card className="mb-6" title={`2. Packaging Photos (${photos.length}/4)`}>
           <div className="grid grid-cols-4 gap-2 mb-3">
               {previewUrls.map((u, i) => (
                  <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-slate-200">
                     <img src={u} className="w-full h-full object-cover" />
                     <button onClick={() => removePhoto(i)} className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5"><X className="w-3 h-3"/></button>
                  </div>
               ))}
               {previewUrls.length < 4 && (
                  <label className="aspect-square rounded-lg border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 cursor-pointer hover:bg-slate-50 hover:border-emerald-400 hover:text-emerald-500 transition-all">
                     <Camera className="w-6 h-6 mb-1"/>
                     <span className="text-[10px] font-bold">Add Photo</span>
                     <input type="file" accept="image/*" className="hidden" onChange={handlePackagingCapture} capture="environment" disabled={isLoading} />
                  </label>
               )}
           </div>
           {photos.length === 0 && <p className="text-xs text-red-400 font-bold">* At least 1 photo required</p>}
        </Card>

        <Button onClick={submit} isLoading={isLoading} disabled={!canSubmit()}>
           {isLoading ? 'Uploading...' : 'Complete Validation'}
        </Button>
     </div>
  );

  return (
     <div className="space-y-6">
        <Card className="bg-emerald-600 text-white shadow-emerald-200">
           <div className="flex flex-col items-center py-8 text-center">
              <Camera className="w-12 h-12 mb-4"/>
              <h2 className="text-2xl font-bold mb-2">Verify Order</h2>
              <p className="text-emerald-100 mb-6">Scan receipt to check accuracy</p>
              <label className="bg-white text-emerald-700 px-6 py-3 rounded-xl font-bold cursor-pointer shadow-lg active:scale-95 transition-transform flex items-center gap-2">
                 <ImageIcon className="w-5 h-5"/> Scan Receipt
                 <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleReceiptCapture} disabled={isLoading} />
              </label>
              {isLoading && <p className="mt-4 flex gap-2 items-center animate-pulse"><Loader2 className="w-4 h-4 animate-spin"/> Analyzing AI...</p>}
           </div>
        </Card>
        <div>
           <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2"><History className="w-4 h-4"/> Recent</h3>
           <div className="space-y-2">
              {history.map(h => (
                 <div 
                    key={h.id} 
                    onClick={() => setViewingOrder(h)}
                    className="bg-white p-3 rounded-xl border border-slate-100 flex justify-between items-center cursor-pointer hover:bg-slate-50 hover:border-emerald-200 transition-all"
                 >
                    <div>
                       <div className="font-bold">Order #{h.orderId}</div>
                       <div className="text-xs text-slate-500">{h.validatedAt?.toDate ? format(h.validatedAt.toDate(), 'p') : ''}</div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Badge variant="success">Done</Badge>
                        <Eye className="w-4 h-4 text-slate-300"/>
                    </div>
                 </div>
              ))}
              {history.length === 0 && <p className="text-slate-400 text-sm">No recent scans.</p>}
           </div>
        </div>
     </div>
  );
};
