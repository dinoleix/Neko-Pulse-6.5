
import React, { useState, useEffect } from 'react';
import { bluebookService } from '../../../services/bluebookService';
import { compressImage } from '../../../services/imageService';
import { BluebookItem, BluebookConfig } from '../../../types';
import { Button, Card, Input, TextArea, Select, Badge } from '../../../components/SharedComponents';
import { BookOpen, Plus, Trash2, Edit, Share2, Upload, X, Loader2, Save, Settings, MessageCircle, Copy, Check } from 'lucide-react';
import { format } from 'date-fns';

export const BluebookAdminView: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'LESSONS' | 'CONFIG'>('LESSONS');
    const [items, setItems] = useState<BluebookItem[]>([]);
    const [config, setConfig] = useState<BluebookConfig>({ categories: [] });
    const [isLoading, setIsLoading] = useState(true);
    
    // Form State
    const [isCreating, setIsCreating] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const [form, setForm] = useState<Partial<BluebookItem>>({
        title: '',
        category: '',
        shortText: '',
        detailedText: '',
        imageUrl: ''
    });

    const [newCategory, setNewCategory] = useState('');

    useEffect(() => { load(); }, []);

    const load = async () => {
        setIsLoading(true);
        try {
            const [itemsData, configData] = await Promise.all([
                bluebookService.getItems(),
                bluebookService.getConfig()
            ]);
            setItems(itemsData);
            setConfig(configData);
            if (configData.categories.length > 0) setForm(prev => ({...prev, category: configData.categories[0]}));
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = async () => {
        if (!form.title || !form.category || !form.shortText) {
            alert("Title, Category and Short Text are required.");
            return;
        }
        setIsSaving(true);
        try {
            await bluebookService.saveItem(form, editingId || undefined);
            setEditingId(null);
            setIsCreating(false);
            setForm({ title: '', category: config.categories[0], shortText: '', detailedText: '', imageUrl: '' });
            const updated = await bluebookService.getItems();
            setItems(updated);
        } catch (e) {
            alert("Failed to save.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsUploading(true);
        try {
            // Maximum optimization: Resize to 1024px max and 10% JPEG quality
            const compressed = await compressImage(file, 0.1);
            const url = await bluebookService.uploadImage(compressed, file.name);
            setForm({ ...form, imageUrl: url });
        } catch (e) {
            console.error("Bluebook image compression/upload failed:", e);
            alert("Upload failed. The image might be too large or corrupted.");
        } finally {
            setIsUploading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm("Delete this training item?")) return;
        setDeletingId(id);
        try {
            await bluebookService.deleteItem(id);
            setItems(prev => prev.filter(i => i.id !== id));
        } catch (e) {
            alert("Delete failed.");
        } finally {
            setDeletingId(null);
        }
    };

    const copyForWhatsApp = (item: BluebookItem) => {
        let text = `*📘 BLUEBOOK: ${item.title.toUpperCase()}*\n`;
        text += `_${item.category}_\n\n`;
        text += `*Summary:*\n${item.shortText}\n\n`;
        
        if (item.detailedText) {
            text += `*Details:*\n${item.detailedText}\n\n`;
        }

        if (item.imageUrl) {
            text += `🖼️ Image: ${item.imageUrl}\n`;
        }

        navigator.clipboard.writeText(text);
        setCopiedId(item.id!);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const addCategory = async () => {
        if (!newCategory.trim()) return;
        const updated = { ...config, categories: [...config.categories, newCategory.trim()] };
        await bluebookService.saveConfig(updated);
        setConfig(updated);
        setNewCategory('');
    };

    const removeCategory = async (cat: string) => {
        if (!confirm(`Delete category "${cat}"?`)) return;
        const updated = { ...config, categories: config.categories.filter(c => c !== cat) };
        await bluebookService.saveConfig(updated);
        setConfig(updated);
    };

    if (isLoading) return <div className="p-12 text-center text-indigo-600 font-bold animate-pulse">Loading Bluebook...</div>;

    return (
        <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600">
                        <BookOpen className="w-6 h-6"/>
                    </div>
                    Bluebook Training
                </h1>
                <div className="flex bg-slate-100 p-1 rounded-xl">
                    <button onClick={() => setActiveTab('LESSONS')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'LESSONS' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}>Lessons</button>
                    <button onClick={() => setActiveTab('CONFIG')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'CONFIG' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500'}`}>Categories</button>
                </div>
            </div>

            {activeTab === 'CONFIG' ? (
                <Card title="Manage Categories">
                    <div className="space-y-6">
                        <div className="flex gap-2">
                            <Input placeholder="New Category Name..." value={newCategory} onChange={e => setNewCategory(e.target.value)} />
                            <Button className="!w-auto" onClick={addCategory}><Plus className="w-4 h-4"/></Button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {config.categories.map(c => (
                                <Badge key={c} variant="neutral" className="flex items-center gap-2 pl-3 py-1.5">
                                    {c}
                                    <button onClick={() => removeCategory(c)} className="text-slate-400 hover:text-red-500"><X className="w-3 h-3"/></button>
                                </Badge>
                            ))}
                        </div>
                    </div>
                </Card>
            ) : (
                <div className="space-y-6">
                    {/* CREATION FORM */}
                    {!isCreating && !editingId ? (
                        <Button className="!w-auto !bg-indigo-600 hover:!bg-indigo-700" onClick={() => setIsCreating(true)}>
                            <Plus className="w-4 h-4 mr-2"/> Add New Training
                        </Button>
                    ) : (
                        <Card title={editingId ? "Edit Lesson" : "New Training Item"}>
                            <div className="grid md:grid-cols-2 gap-8">
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Title</label>
                                        <Input value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="e.g. Greeting Customers" />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Category</label>
                                        <Select value={form.category} onChange={e => setForm({...form, category: e.target.value})}>
                                            <option value="">Select Category</option>
                                            {config.categories.map(c => <option key={c} value={c}>{c}</option>)}
                                        </Select>
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Short Summary (1-2 lines)</label>
                                        <TextArea value={form.shortText} onChange={e => setForm({...form, shortText: e.target.value})} className="!min-h-[80px]" placeholder="Make it catchy and precise..." />
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Detailed Content (Optional)</label>
                                        <TextArea value={form.detailedText} onChange={e => setForm({...form, detailedText: e.target.value})} placeholder="Step by step instructions or deeper logic..." />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Image URL or Upload</label>
                                        <div className="flex gap-2">
                                            <Input value={form.imageUrl} onChange={e => setForm({...form, imageUrl: e.target.value})} placeholder="https://..." />
                                            <label className="bg-slate-100 hover:bg-slate-200 p-3 rounded-2xl cursor-pointer transition-colors border border-slate-200">
                                                {isUploading ? <Loader2 className="w-5 h-5 animate-spin"/> : <Upload className="w-5 h-5 text-indigo-600"/>}
                                                <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} disabled={isUploading} />
                                            </label>
                                        </div>
                                        {form.imageUrl && (
                                            <div className="mt-2 relative w-20 h-20 rounded-xl overflow-hidden border">
                                                <img src={form.imageUrl} className="w-full h-full object-cover" />
                                                <button onClick={() => setForm({...form, imageUrl: ''})} className="absolute top-0 right-0 bg-red-500 text-white p-0.5 rounded-bl-lg"><X size={12}/></button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="mt-8 flex gap-3">
                                <Button variant="secondary" className="!w-auto" onClick={() => { setIsCreating(false); setEditingId(null); setForm({title: '', shortText: '', category: config.categories[0]}); }}>Cancel</Button>
                                <Button className="!w-auto !bg-indigo-600 shadow-indigo-200" onClick={handleSave} isLoading={isSaving}>
                                    <Save className="w-4 h-4 mr-2"/> {editingId ? 'Update Lesson' : 'Publish Lesson'}
                                </Button>
                            </div>
                        </Card>
                    )}

                    {/* LESSONS LIST */}
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {items.map(item => (
                            <div key={item.id} className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow group flex flex-col">
                                {item.imageUrl && (
                                    <div className="h-40 overflow-hidden bg-slate-100">
                                        <img src={item.imageUrl} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                    </div>
                                )}
                                <div className="p-5 flex-1 flex flex-col">
                                    <div className="flex justify-between items-start mb-2">
                                        <Badge variant="neutral" className="!text-[10px] !bg-indigo-50 !text-indigo-600 border-indigo-100">{item.category}</Badge>
                                        <div className="flex gap-1">
                                            <button onClick={() => { setEditingId(item.id!); setForm(item); window.scrollTo({top: 0, behavior: 'smooth'}); }} className="p-1.5 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"><Edit size={16}/></button>
                                            <button onClick={() => handleDelete(item.id!)} className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all">{deletingId === item.id ? <Loader2 size={16} className="animate-spin"/> : <Trash2 size={16}/>}</button>
                                        </div>
                                    </div>
                                    <h3 className="font-bold text-slate-800 text-lg leading-tight mb-2">{item.title}</h3>
                                    <p className="text-sm text-slate-500 flex-1 line-clamp-3 mb-4">{item.shortText}</p>
                                    
                                    <div className="pt-4 border-t border-slate-50 flex gap-2">
                                        <button 
                                            onClick={() => copyForWhatsApp(item)}
                                            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold transition-all ${copiedId === item.id ? 'bg-emerald-500 text-white shadow-emerald-200' : 'bg-slate-100 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-100 border border-transparent'}`}
                                        >
                                            {copiedId === item.id ? <Check size={14}/> : <MessageCircle size={14}/>}
                                            {copiedId === item.id ? 'Copied!' : 'Copy for WA'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                    {items.length === 0 && <p className="text-center py-12 text-slate-400">No training items published yet.</p>}
                </div>
            )}
        </div>
    );
};
