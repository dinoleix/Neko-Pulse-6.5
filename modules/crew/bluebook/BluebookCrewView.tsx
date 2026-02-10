
import React, { useState, useEffect } from 'react';
import { bluebookService } from '../../../services/bluebookService';
import { BluebookItem, BluebookConfig, CurrentUser } from '../../../types';
import { Card, Badge, FullScreenImageViewer } from '../../../components/SharedComponents';
import { BookOpen, Copy, Check, ChevronRight, Filter, AlignLeft } from 'lucide-react';
import { format } from 'date-fns';

export const BluebookCrewView: React.FC<{ currentUser: CurrentUser }> = ({ currentUser }) => {
    const [items, setItems] = useState<BluebookItem[]>([]);
    const [config, setConfig] = useState<BluebookConfig>({ categories: [] });
    const [selectedCat, setSelectedCat] = useState<string>('ALL');
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    useEffect(() => { load(); }, []);

    const load = async () => {
        try {
            const [itemsData, configData] = await Promise.all([
                bluebookService.getItems(),
                bluebookService.getConfig()
            ]);
            setItems(itemsData);
            setConfig(configData);
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    const copyText = (text: string, id: string) => {
        navigator.clipboard.writeText(text);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const filteredItems = selectedCat === 'ALL' ? items : items.filter(i => i.category === selectedCat);

    if (isLoading) return <div className="p-12 text-center text-indigo-600 font-bold">Opening Bluebook...</div>;

    return (
        <div className="space-y-6 pb-20">
            {/* Header */}
            <div className="bg-gradient-to-br from-indigo-600 to-blue-700 rounded-3xl p-6 text-white shadow-xl shadow-indigo-100">
                <div className="flex items-center gap-4">
                    <div className="bg-white/20 p-3 rounded-2xl backdrop-blur-sm">
                        <BookOpen className="w-8 h-8 text-white"/>
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold">The Bluebook</h2>
                        <p className="text-indigo-100 opacity-90">Micro-learning for Cafe Pro's</p>
                    </div>
                </div>
            </div>

            {/* Category Filter */}
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 px-1">
                <button 
                    onClick={() => setSelectedCat('ALL')}
                    className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all ${selectedCat === 'ALL' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'bg-white text-slate-500 border border-slate-200'}`}
                >
                    All Topics
                </button>
                {config.categories.map(c => (
                    <button 
                        key={c}
                        onClick={() => setSelectedCat(c)}
                        className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all ${selectedCat === c ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'bg-white text-slate-500 border border-slate-200'}`}
                    >
                        {c}
                    </button>
                ))}
            </div>

            {/* Content Feed */}
            <div className="space-y-4">
                {filteredItems.map(item => (
                    <div 
                        key={item.id} 
                        className={`bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden transition-all ${expandedId === item.id ? 'ring-2 ring-indigo-500' : ''}`}
                    >
                        {item.imageUrl && (
                            <FullScreenImageViewer src={item.imageUrl}>
                                <div className="h-48 overflow-hidden">
                                    <img src={item.imageUrl} className="w-full h-full object-cover" />
                                </div>
                            </FullScreenImageViewer>
                        )}
                        <div className="p-6">
                            <div className="flex justify-between items-center mb-3">
                                <Badge variant="neutral" className="!bg-indigo-50 !text-indigo-600 !text-[10px] uppercase border-indigo-100">{item.category}</Badge>
                                <button 
                                    onClick={() => copyText(`${item.title}\n\n${item.shortText}${item.detailedText ? '\n\n' + item.detailedText : ''}`, item.id!)}
                                    className={`p-2 rounded-lg transition-all ${copiedId === item.id ? 'bg-emerald-50 text-emerald-600' : 'text-slate-300 hover:text-indigo-600'}`}
                                >
                                    {copiedId === item.id ? <Check size={16}/> : <Copy size={16}/>}
                                </button>
                            </div>
                            
                            <h3 className="text-xl font-bold text-slate-800 leading-tight mb-2">{item.title}</h3>
                            <p className="text-slate-600 font-medium leading-relaxed">{item.shortText}</p>

                            {expandedId === item.id ? (
                                <div className="mt-6 pt-6 border-t border-slate-100 animate-in slide-in-from-top duration-300">
                                    <div className="text-xs font-bold text-indigo-400 uppercase mb-3 flex items-center gap-2">
                                        <AlignLeft className="w-3 h-3"/> Detailed Content
                                    </div>
                                    <div className="text-slate-700 whitespace-pre-wrap leading-loose">
                                        {item.detailedText || "No detailed instructions provided."}
                                    </div>
                                    <button 
                                        onClick={() => setExpandedId(null)}
                                        className="mt-6 w-full py-3 bg-slate-50 text-slate-500 rounded-2xl text-sm font-bold hover:bg-slate-100"
                                    >
                                        Hide Details
                                    </button>
                                </div>
                            ) : (
                                <button 
                                    onClick={() => setExpandedId(item.id!)}
                                    className="mt-4 flex items-center gap-2 text-indigo-600 font-bold text-sm hover:underline"
                                >
                                    Learn More <ChevronRight size={16}/>
                                </button>
                            )}
                        </div>
                    </div>
                ))}
                {filteredItems.length === 0 && (
                    <div className="text-center py-20 text-slate-400">
                        <Filter className="w-12 h-12 mx-auto mb-2 opacity-10"/>
                        <p>No content in this category yet.</p>
                    </div>
                )}
            </div>
        </div>
    );
};
