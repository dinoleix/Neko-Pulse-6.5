
import React, { useState, useEffect } from 'react';
import { recipeService } from '../../../services/recipeService';
import { compressImage } from '../../../services/imageService';
import { accessService } from '../../../services/accessService';
import { employeeService } from '../../../services/employeeService';
import { Recipe, RecipeIngredient, RecipeConfig, CrewMember } from '../../../types';
import { Button, Card, Input, TextArea, Select, Badge } from '../../../components/SharedComponents';
import { ChefHat, Plus, Trash2, Edit, Upload, X, Loader2, Save, Eye, EyeOff, Clock, Users, Copy, Check, LayoutList, LayoutGrid, Printer, CheckSquare, Square, Globe, Search } from 'lucide-react';

const UNITS = ['g', 'kg', 'ml', 'L', 'pcs', 'tbsp', 'tsp', 'cup', 'pinch', 'slice', 'to taste'];

const emptyForm = (defaultCategory = ''): Partial<Recipe> => ({
    name: '',
    category: defaultCategory,
    description: '',
    ingredients: [],
    steps: [''],
    imageUrl: '',
    isShared: false,
    shareScope: 'ALL',
    sharedRoles: [],
    sharedCrewIds: [],
    prepTime: undefined,
    cookTime: undefined,
    servingSize: undefined,
    createdBy: ''
});

export const RecipeAdminView: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'RECIPES' | 'CATEGORIES'>('RECIPES');
    const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
    const [recipes, setRecipes] = useState<Recipe[]>([]);
    const [selectedCat, setSelectedCat] = useState<string>('ALL');
    const [config, setConfig] = useState<RecipeConfig>({ categories: [] });
    const [isLoading, setIsLoading] = useState(true);

    const [isCreating, setIsCreating] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [togglingId, setTogglingId] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [newCategory, setNewCategory] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [printCols, setPrintCols] = useState<1 | 2 | 3>(2);
    const [printCompact, setPrintCompact] = useState(false);
    const [roles, setRoles] = useState<string[]>([]);
    const [crew, setCrew] = useState<CrewMember[]>([]);
    const [peopleSearch, setPeopleSearch] = useState('');

    const [form, setForm] = useState<Partial<Recipe>>(emptyForm());

    useEffect(() => { load(); }, []);

    const load = async () => {
        setIsLoading(true);
        try {
            const [recipesData, configData, rolesData, crewData] = await Promise.all([
                recipeService.getAll(),
                recipeService.getConfig(),
                accessService.getRoles().catch(() => [] as string[]),
                employeeService.getAllCrew().catch(() => [] as CrewMember[])
            ]);
            setRecipes(recipesData);
            setConfig(configData);
            setRoles(rolesData);
            setCrew(crewData.filter(c => c.active !== false));
            setForm(emptyForm(configData.categories[0] || ''));
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = async () => {
        if (!form.name?.trim() || !form.category) {
            alert("Recipe name and category are required.");
            return;
        }
        if (!form.ingredients?.length) {
            alert("Add at least one ingredient.");
            return;
        }
        if (!form.steps?.some(s => s.trim())) {
            alert("Add at least one step.");
            return;
        }
        setIsSaving(true);
        try {
            const cleanSteps = form.steps!.filter(s => s.trim());
            await recipeService.save({ ...form, steps: cleanSteps }, editingId || undefined);
            resetForm();
            setRecipes(await recipeService.getAll());
        } catch (e) {
            alert("Failed to save recipe.");
        } finally {
            setIsSaving(false);
        }
    };

    const resetForm = () => {
        setEditingId(null);
        setIsCreating(false);
        setForm(emptyForm(config.categories[0] || ''));
    };

    const handleEdit = (recipe: Recipe) => {
        setForm({
            ...recipe,
            steps: recipe.steps?.length ? recipe.steps : [''],
            shareScope: recipe.shareScope || 'ALL',
            sharedRoles: recipe.sharedRoles || [],
            sharedCrewIds: recipe.sharedCrewIds || [],
        });
        setEditingId(recipe.id!);
        setIsCreating(false);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm("Delete this recipe?")) return;
        setDeletingId(id);
        try {
            await recipeService.delete(id);
            setRecipes(prev => prev.filter(r => r.id !== id));
        } catch (e) {
            alert("Delete failed.");
        } finally {
            setDeletingId(null);
        }
    };

    const handleToggleShare = async (recipe: Recipe) => {
        setTogglingId(recipe.id!);
        try {
            const next = !recipe.isShared;
            await recipeService.toggleShare(recipe.id!, next);
            setRecipes(prev => prev.map(r => r.id === recipe.id ? { ...r, isShared: next } : r));
        } catch (e) {
            alert("Failed to update sharing.");
        } finally {
            setTogglingId(null);
        }
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsUploading(true);
        try {
            const compressed = await compressImage(file, 0.1);
            const url = await recipeService.uploadImage(compressed);
            setForm(prev => ({ ...prev, imageUrl: url }));
        } catch (e) {
            alert("Upload failed.");
        } finally {
            setIsUploading(false);
            e.target.value = '';
        }
    };

    // --- INGREDIENTS ---
    const addIngredient = () => {
        setForm(prev => ({
            ...prev,
            ingredients: [...(prev.ingredients || []), { name: '', amount: '', unit: 'g' }]
        }));
    };

    const updateIngredient = (i: number, field: keyof RecipeIngredient, value: string) => {
        setForm(prev => {
            const updated = [...(prev.ingredients || [])];
            updated[i] = { ...updated[i], [field]: value };
            return { ...prev, ingredients: updated };
        });
    };

    const removeIngredient = (i: number) => {
        setForm(prev => ({ ...prev, ingredients: prev.ingredients!.filter((_, idx) => idx !== i) }));
    };

    // --- STEPS ---
    const addStep = () => {
        setForm(prev => ({ ...prev, steps: [...(prev.steps || []), ''] }));
    };

    const updateStep = (i: number, value: string) => {
        setForm(prev => {
            const updated = [...(prev.steps || [])];
            updated[i] = value;
            return { ...prev, steps: updated };
        });
    };

    const removeStep = (i: number) => {
        if ((form.steps || []).length <= 1) return;
        setForm(prev => ({ ...prev, steps: prev.steps!.filter((_, idx) => idx !== i) }));
    };

    // --- CATEGORIES ---
    const addCategory = async () => {
        if (!newCategory.trim()) return;
        const updated = { ...config, categories: [...config.categories, newCategory.trim()] };
        await recipeService.saveConfig(updated);
        setConfig(updated);
        setNewCategory('');
    };

    const removeCategory = async (cat: string) => {
        if (!confirm(`Delete category "${cat}"?`)) return;
        const updated = { ...config, categories: config.categories.filter(c => c !== cat) };
        await recipeService.saveConfig(updated);
        setConfig(updated);
    };

    const copyForWhatsApp = (recipe: Recipe) => {
        let text = `*🍽️ RECIPE: ${recipe.name.toUpperCase()}*\n_${recipe.category}_\n`;
        const meta = [
            recipe.servingSize ? `Serves ${recipe.servingSize}` : '',
            recipe.prepTime ? `Prep ${recipe.prepTime}m` : '',
            recipe.cookTime ? `Cook ${recipe.cookTime}m` : ''
        ].filter(Boolean).join(' · ');
        if (meta) text += `${meta}\n`;
        if (recipe.description) text += `\n${recipe.description}\n`;
        text += `\n*INGREDIENTS:*\n`;
        recipe.ingredients.forEach(ing => { text += `• ${ing.amount} ${ing.unit} ${ing.name}\n`; });
        text += `\n*STEPS:*\n`;
        recipe.steps.forEach((step, i) => { text += `${i + 1}. ${step}\n`; });
        navigator.clipboard.writeText(text);
        setCopiedId(recipe.id!);
        setTimeout(() => setCopiedId(null), 2000);
    };

    // Category filter for the recipe list. Show categories in config order that
    // actually have recipes, then any leftover categories on recipes that aren't
    // in config (e.g. legacy values), so nothing becomes unreachable.
    const recipeCats = Array.from(new Set(recipes.map(r => r.category).filter(Boolean)));
    const filterCategories = [
        ...config.categories.filter(c => recipeCats.includes(c)),
        ...recipeCats.filter(c => !config.categories.includes(c)),
    ];
    const filteredRecipes = selectedCat === 'ALL' ? recipes : recipes.filter(r => r.category === selectedCat);

    // --- SELECTION + PRINT ---
    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };
    const selectAllVisible = () => setSelectedIds(new Set(filteredRecipes.map(r => r.id!)));
    const clearSelection = () => setSelectedIds(new Set());

    // --- SHARING TARGET (form) ---
    const toggleFormRole = (role: string) => setForm(p => {
        const cur = p.sharedRoles || [];
        return { ...p, sharedRoles: cur.includes(role) ? cur.filter(x => x !== role) : [...cur, role] };
    });
    const toggleFormPerson = (id: string) => setForm(p => {
        const cur = p.sharedCrewIds || [];
        return { ...p, sharedCrewIds: cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id] };
    });
    const shareLabel = (r: Recipe) => {
        if (!r.isShared) return 'Share';
        const scope = r.shareScope || 'ALL';
        if (scope === 'ROLES') return `Roles (${(r.sharedRoles || []).length})`;
        if (scope === 'PEOPLE') return `People (${(r.sharedCrewIds || []).length})`;
        return 'Shared';
    };

    const handlePrint = () => {
        // Keep on-screen order; selection persists across category filters, so a
        // user can gather recipes from several categories into one printout.
        const chosen = recipes.filter(r => selectedIds.has(r.id!));
        if (!chosen.length) return;

        const esc = (s: any) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const compact = printCompact;

        // Cards flow through CSS columns and pack tightly (no forced heights), so
        // short recipes don't waste space. break-inside:avoid keeps a card whole.
        const cardHtml = (r: Recipe) => {
            const meta = [
                r.servingSize ? `Serves ${r.servingSize}` : '',
                r.prepTime ? `Prep ${r.prepTime}m` : '',
                r.cookTime ? `Cook ${r.cookTime}m` : '',
            ].filter(Boolean).join(' &middot; ');
            const ings = (r.ingredients || []).map(g =>
                `<li><span class="i-name">${esc(g.name)}</span><span class="i-amt">${esc(g.amount)} ${esc(g.unit)}</span></li>`).join('');
            const steps = (r.steps || []).filter(s => s && s.trim());
            const stepsHtml = steps.length
                ? `<div class="steps"><h3>Steps</h3><ol>${steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol></div>` : '';
            return `<div class="card">
                <div class="head"><h2>${esc(r.name)}</h2><span class="cat">${esc(r.category)}</span></div>
                ${(!compact && meta) ? `<div class="meta">${meta}</div>` : ''}
                ${(!compact && r.description) ? `<p class="desc">${esc(r.description)}</p>` : ''}
                <div class="ings"><h3>Ingredients</h3><ul>${ings || '<li class="empty">No ingredients yet</li>'}</ul></div>
                ${stepsHtml}
            </div>`;
        };

        // Sizes scale with density so 3 columns / compact packs the most per page.
        const base = compact ? 8.5 : 10.5;
        const h2 = compact ? 12 : 15;
        const pad = compact ? '3mm 3.5mm' : '5mm';
        const gap = compact ? '4mm' : '6mm';
        const cardMargin = compact ? '3.5mm' : '5mm';

        const html = `<!doctype html><html><head><meta charset="utf-8"><title>Recipes</title><style>
            @page { size: A4; margin: 8mm; }
            * { box-sizing: border-box; }
            html, body { margin: 0; padding: 0; }
            body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1e293b; font-size: ${base}px; line-height: 1.3; }
            .wrap { column-count: ${printCols}; column-gap: ${gap}; }
            .card { break-inside: avoid; -webkit-column-break-inside: avoid; page-break-inside: avoid; display: inline-block; width: 100%;
                    border: 1.25px solid #e2e8f0; border-radius: 8px; padding: ${pad}; margin: 0 0 ${cardMargin}; }
            .head { display: flex; align-items: baseline; justify-content: space-between; gap: 6px; border-bottom: 1.5px solid #f1f5f9; padding-bottom: 3px; margin-bottom: 4px; }
            .head h2 { font-size: ${h2}px; margin: 0; line-height: 1.1; }
            .cat { font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: .03em; color: #ea580c; background: #fff7ed; border: 1px solid #fed7aa; border-radius: 999px; padding: 1px 6px; white-space: nowrap; }
            .meta { color: #64748b; font-size: ${base - 1}px; margin-bottom: 3px; }
            .desc { color: #475569; font-size: ${base - 1}px; margin: 0 0 4px; font-style: italic; }
            h3 { font-size: ${base - 1.5}px; text-transform: uppercase; letter-spacing: .05em; color: #ea580c; margin: 4px 0 2px; }
            ul { list-style: none; margin: 0; padding: 0; }
            ul li { display: flex; justify-content: space-between; gap: 8px; padding: 1px 0; border-bottom: 1px dotted #e2e8f0; }
            .i-name { font-weight: 600; } .i-amt { color: #475569; white-space: nowrap; font-variant-numeric: tabular-nums; }
            .empty { color: #94a3b8; font-style: italic; border: 0; }
            ol { margin: 0; padding-left: 15px; } ol li { padding: 1px 0; }
        </style></head><body onload="window.print()"><div class="wrap">${chosen.map(cardHtml).join('')}</div></body></html>`;

        const w = window.open('', '_blank');
        if (!w) { alert('Please allow pop-ups for this site to print recipes.'); return; }
        w.document.write(html);
        w.document.close();
    };

    if (isLoading) return <div className="p-12 text-center text-orange-500 font-bold animate-pulse">Loading Recipes...</div>;

    return (
        <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
                    <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center text-orange-600">
                        <ChefHat className="w-6 h-6"/>
                    </div>
                    Kitchen Recipes
                </h1>
                <div className="flex items-center gap-2">
                    {activeTab === 'RECIPES' && (
                        <div className="flex bg-slate-100 p-1 rounded-xl">
                            <button onClick={() => setViewMode('list')} className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-orange-600' : 'text-slate-400 hover:text-slate-600'}`}><LayoutList className="w-4 h-4"/></button>
                            <button onClick={() => setViewMode('grid')} className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-orange-600' : 'text-slate-400 hover:text-slate-600'}`}><LayoutGrid className="w-4 h-4"/></button>
                        </div>
                    )}
                    <div className="flex bg-slate-100 p-1 rounded-xl">
                        <button onClick={() => setActiveTab('RECIPES')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'RECIPES' ? 'bg-white shadow-sm text-orange-600' : 'text-slate-500'}`}>Recipes</button>
                        <button onClick={() => setActiveTab('CATEGORIES')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'CATEGORIES' ? 'bg-white shadow-sm text-orange-600' : 'text-slate-500'}`}>Categories</button>
                    </div>
                </div>
            </div>

            {activeTab === 'CATEGORIES' ? (
                <Card title="Manage Categories">
                    <div className="space-y-6">
                        <div className="flex gap-2">
                            <Input
                                placeholder="New category name..."
                                value={newCategory}
                                onChange={e => setNewCategory(e.target.value)}
                                onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && addCategory()}
                            />
                            <Button className="!w-auto" onClick={addCategory}><Plus className="w-4 h-4"/></Button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {config.categories.map(c => (
                                <Badge key={c} variant="neutral" className="flex items-center gap-2 pl-3 py-1.5">
                                    {c}
                                    <button onClick={() => removeCategory(c)} className="text-slate-400 hover:text-red-500"><X className="w-3 h-3"/></button>
                                </Badge>
                            ))}
                            {config.categories.length === 0 && <p className="text-slate-400 text-sm">No categories yet. Add one above.</p>}
                        </div>
                    </div>
                </Card>
            ) : (
                <div className="space-y-6">
                    {/* CREATE / EDIT FORM */}
                    {!isCreating && !editingId ? (
                        <Button className="!w-auto !bg-orange-500 hover:!bg-orange-600 shadow-orange-200" onClick={() => setIsCreating(true)}>
                            <Plus className="w-4 h-4 mr-2"/> Add New Recipe
                        </Button>
                    ) : (
                        <Card title={editingId ? "Edit Recipe" : "New Recipe"}>
                            <div className="space-y-6">
                                {/* BASIC INFO */}
                                <div className="grid md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Recipe Name *</label>
                                        <Input value={form.name || ''} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Classic Neko Burger" />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Category *</label>
                                        <Select value={form.category || ''} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
                                            <option value="">Select Category</option>
                                            {config.categories.map(c => <option key={c} value={c}>{c}</option>)}
                                        </Select>
                                    </div>
                                </div>

                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Description</label>
                                    <TextArea value={form.description || ''} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} className="!min-h-[60px]" placeholder="Brief description of this dish..." />
                                </div>

                                {/* TIMINGS */}
                                <div className="grid grid-cols-3 gap-4">
                                    <div>
                                        <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Prep (min)</label>
                                        <Input type="number" value={form.prepTime ?? ''} onChange={e => setForm(p => ({ ...p, prepTime: Number(e.target.value) || undefined }))} placeholder="0" />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Cook (min)</label>
                                        <Input type="number" value={form.cookTime ?? ''} onChange={e => setForm(p => ({ ...p, cookTime: Number(e.target.value) || undefined }))} placeholder="0" />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Serves</label>
                                        <Input type="number" value={form.servingSize ?? ''} onChange={e => setForm(p => ({ ...p, servingSize: Number(e.target.value) || undefined }))} placeholder="1" />
                                    </div>
                                </div>

                                {/* PHOTO */}
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Photo</label>
                                    <div className="flex gap-2">
                                        <Input value={form.imageUrl || ''} onChange={e => setForm(p => ({ ...p, imageUrl: e.target.value }))} placeholder="https://... or upload below" />
                                        <label className="bg-slate-100 hover:bg-slate-200 p-3 rounded-2xl cursor-pointer transition-colors border border-slate-200 flex-shrink-0">
                                            {isUploading ? <Loader2 className="w-5 h-5 animate-spin text-slate-400"/> : <Upload className="w-5 h-5 text-orange-500"/>}
                                            <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} disabled={isUploading} />
                                        </label>
                                    </div>
                                    {form.imageUrl && (
                                        <div className="mt-2 relative w-20 h-20 rounded-xl overflow-hidden border border-slate-200">
                                            <img src={form.imageUrl} className="w-full h-full object-cover" />
                                            <button onClick={() => setForm(p => ({ ...p, imageUrl: '' }))} className="absolute top-0 right-0 bg-red-500 text-white p-0.5 rounded-bl-lg"><X size={12}/></button>
                                        </div>
                                    )}
                                </div>

                                {/* INGREDIENTS */}
                                <div>
                                    <div className="flex justify-between items-center mb-3">
                                        <label className="text-xs font-bold text-slate-400 uppercase">Ingredients *</label>
                                        <button onClick={addIngredient} className="text-orange-500 hover:text-orange-700 text-xs font-bold flex items-center gap-1 px-3 py-1.5 bg-orange-50 rounded-lg">
                                            <Plus size={13}/> Add Ingredient
                                        </button>
                                    </div>
                                    {!(form.ingredients || []).length && (
                                        <div className="text-slate-400 text-sm text-center py-6 border-2 border-dashed border-slate-200 rounded-2xl">
                                            No ingredients yet — click Add Ingredient
                                        </div>
                                    )}
                                    <div className="space-y-2">
                                        {(form.ingredients || []).map((ing, i) => (
                                            <div key={i} className="flex gap-2 items-center">
                                                <Input
                                                    value={ing.amount}
                                                    onChange={e => updateIngredient(i, 'amount', e.target.value)}
                                                    placeholder="Amt"
                                                    className="!w-20 !min-w-0 text-center"
                                                />
                                                <select
                                                    value={ing.unit}
                                                    onChange={e => updateIngredient(i, 'unit', e.target.value)}
                                                    className="border border-slate-200 rounded-2xl px-2 py-3 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-orange-300 flex-shrink-0"
                                                >
                                                    {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                                                </select>
                                                <Input
                                                    value={ing.name}
                                                    onChange={e => updateIngredient(i, 'name', e.target.value)}
                                                    placeholder="Ingredient name"
                                                    className="flex-1"
                                                />
                                                <button onClick={() => removeIngredient(i)} className="text-slate-300 hover:text-red-500 p-2 flex-shrink-0">
                                                    <X size={16}/>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* STEPS */}
                                <div>
                                    <div className="flex justify-between items-center mb-3">
                                        <label className="text-xs font-bold text-slate-400 uppercase">Steps *</label>
                                        <button onClick={addStep} className="text-orange-500 hover:text-orange-700 text-xs font-bold flex items-center gap-1 px-3 py-1.5 bg-orange-50 rounded-lg">
                                            <Plus size={13}/> Add Step
                                        </button>
                                    </div>
                                    <div className="space-y-2">
                                        {(form.steps || ['']).map((step, i) => (
                                            <div key={i} className="flex gap-3 items-start">
                                                <div className="w-7 h-7 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xs font-black flex-shrink-0 mt-3">
                                                    {i + 1}
                                                </div>
                                                <TextArea
                                                    value={step}
                                                    onChange={e => updateStep(i, e.target.value)}
                                                    placeholder={`Step ${i + 1}...`}
                                                    className="flex-1 !min-h-[60px]"
                                                />
                                                <button
                                                    onClick={() => removeStep(i)}
                                                    disabled={(form.steps || []).length <= 1}
                                                    className="text-slate-300 hover:text-red-500 p-2 mt-2 flex-shrink-0 disabled:opacity-30"
                                                >
                                                    <X size={16}/>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* SHARING */}
                                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-4">
                                    <div className="flex items-center gap-4">
                                        <button
                                            onClick={() => setForm(p => ({ ...p, isShared: !p.isShared }))}
                                            className={`w-12 h-6 rounded-full transition-colors flex items-center px-0.5 flex-shrink-0 ${form.isShared ? 'bg-emerald-500 justify-end' : 'bg-slate-300 justify-start'}`}
                                        >
                                            <span className="w-5 h-5 bg-white rounded-full shadow block"/>
                                        </button>
                                        <div>
                                            <div className="font-bold text-slate-700 text-sm">Share with Kitchen Staff</div>
                                            <div className="text-xs text-slate-400">{form.isShared ? 'Visible in the crew app to the audience below' : 'Admin-only — not visible to crew'}</div>
                                        </div>
                                    </div>

                                    {form.isShared && (
                                        <div className="space-y-3 pt-1 pl-1">
                                            {/* Scope */}
                                            <div className="flex flex-wrap bg-white p-1 rounded-xl border border-slate-200 gap-1">
                                                {([
                                                    { key: 'ALL', label: 'Everyone', icon: <Globe size={14}/> },
                                                    { key: 'ROLES', label: 'Specific roles', icon: <Users size={14}/> },
                                                    { key: 'PEOPLE', label: 'Specific people', icon: <Check size={14}/> },
                                                ] as const).map(s => {
                                                    const active = (form.shareScope || 'ALL') === s.key;
                                                    return (
                                                        <button
                                                            key={s.key}
                                                            onClick={() => setForm(p => ({ ...p, shareScope: s.key }))}
                                                            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${active ? 'bg-orange-500 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                                                        >
                                                            {s.icon} {s.label}
                                                        </button>
                                                    );
                                                })}
                                            </div>

                                            {/* Roles picker */}
                                            {(form.shareScope || 'ALL') === 'ROLES' && (
                                                <div>
                                                    {roles.length === 0 ? (
                                                        <p className="text-xs text-slate-400">No roles defined yet — add roles in the Employees module first.</p>
                                                    ) : (
                                                        <div className="flex flex-wrap gap-2">
                                                            {roles.map(r => {
                                                                const on = (form.sharedRoles || []).includes(r);
                                                                return (
                                                                    <button
                                                                        key={r}
                                                                        onClick={() => toggleFormRole(r)}
                                                                        className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${on ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-slate-500 border-slate-200 hover:border-orange-300'}`}
                                                                    >
                                                                        {r}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                    {(form.sharedRoles || []).length === 0 && roles.length > 0 && (
                                                        <p className="text-[11px] text-amber-600 mt-2">Pick at least one role, or no one will see this recipe.</p>
                                                    )}
                                                </div>
                                            )}

                                            {/* People picker */}
                                            {(form.shareScope || 'ALL') === 'PEOPLE' && (
                                                <div>
                                                    <div className="relative mb-2">
                                                        <Search className="w-4 h-4 text-slate-300 absolute left-3 top-1/2 -translate-y-1/2"/>
                                                        <Input value={peopleSearch} onChange={e => setPeopleSearch(e.target.value)} placeholder="Search staff…" className="!pl-9" />
                                                    </div>
                                                    {crew.length === 0 ? (
                                                        <p className="text-xs text-slate-400">No staff found.</p>
                                                    ) : (
                                                        <div className="max-h-52 overflow-y-auto rounded-xl border border-slate-200 bg-white divide-y divide-slate-50">
                                                            {crew
                                                                .filter(c => c.crewName?.toLowerCase().includes(peopleSearch.toLowerCase()))
                                                                .map(c => {
                                                                    const on = (form.sharedCrewIds || []).includes(c.id!);
                                                                    return (
                                                                        <button
                                                                            key={c.id}
                                                                            onClick={() => toggleFormPerson(c.id!)}
                                                                            className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${on ? 'bg-orange-50' : 'hover:bg-slate-50'}`}
                                                                        >
                                                                            {on ? <CheckSquare className="w-4 h-4 text-orange-500 flex-shrink-0"/> : <Square className="w-4 h-4 text-slate-300 flex-shrink-0"/>}
                                                                            <span className="text-sm font-semibold text-slate-700 flex-1 truncate">{c.crewName}</span>
                                                                            {c.role && <span className="text-[10px] font-bold text-slate-400 uppercase">{c.role}</span>}
                                                                        </button>
                                                                    );
                                                                })}
                                                        </div>
                                                    )}
                                                    {(form.sharedCrewIds || []).length === 0 && crew.length > 0 && (
                                                        <p className="text-[11px] text-amber-600 mt-2">Pick at least one person, or no one will see this recipe.</p>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="flex gap-3">
                                    <Button variant="secondary" className="!w-auto" onClick={resetForm}>Cancel</Button>
                                    <Button className="!w-auto !bg-orange-500 hover:!bg-orange-600 shadow-orange-200" onClick={handleSave} isLoading={isSaving}>
                                        <Save className="w-4 h-4 mr-2"/> {editingId ? 'Update Recipe' : 'Save Recipe'}
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    )}

                    {/* PRINT / SELECTION TOOLBAR */}
                    {recipes.length > 0 && (
                        <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-100 rounded-2xl p-3 shadow-sm">
                            <div className="flex items-center gap-2 flex-wrap">
                                <button
                                    onClick={selectAllVisible}
                                    className="text-xs font-bold px-3 py-2 rounded-lg bg-slate-100 text-slate-600 hover:bg-orange-50 hover:text-orange-600 transition-colors"
                                >
                                    Select all{selectedCat !== 'ALL' ? ` in ${selectedCat}` : ''}
                                </button>
                                {selectedIds.size > 0 && (
                                    <button
                                        onClick={clearSelection}
                                        className="text-xs font-bold px-3 py-2 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"
                                    >
                                        Clear
                                    </button>
                                )}
                                <span className="text-sm text-slate-500 font-semibold">{selectedIds.size} selected</span>
                            </div>
                            <div className="flex items-center gap-3 flex-wrap">
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase">Columns</span>
                                    <div className="flex bg-slate-100 p-1 rounded-lg">
                                        {[1, 2, 3].map(n => (
                                            <button
                                                key={n}
                                                onClick={() => setPrintCols(n as 1 | 2 | 3)}
                                                className={`px-3 py-1 rounded-md text-sm font-bold transition-all ${printCols === n ? 'bg-white shadow-sm text-orange-600' : 'text-slate-500 hover:text-slate-700'}`}
                                            >
                                                {n}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <button
                                    onClick={() => setPrintCompact(v => !v)}
                                    title="Compact hides serving/prep info and descriptions and shrinks type to fit more per page"
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${printCompact ? 'bg-orange-500 text-white border-orange-500 shadow-sm shadow-orange-200' : 'bg-white text-slate-500 border-slate-200 hover:border-orange-200'}`}
                                >
                                    Compact
                                </button>
                                <button
                                    onClick={handlePrint}
                                    disabled={selectedIds.size === 0}
                                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white bg-orange-500 hover:bg-orange-600 shadow-sm shadow-orange-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
                                >
                                    <Printer className="w-4 h-4"/> Print ({selectedIds.size})
                                </button>
                            </div>
                        </div>
                    )}

                    {/* CATEGORY FILTER */}
                    {filterCategories.length > 0 && (
                        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                            <button
                                onClick={() => setSelectedCat('ALL')}
                                className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all ${selectedCat === 'ALL' ? 'bg-orange-500 text-white shadow-lg shadow-orange-200' : 'bg-white text-slate-500 border border-slate-200 hover:border-orange-200'}`}
                            >
                                All ({recipes.length})
                            </button>
                            {filterCategories.map(c => (
                                <button
                                    key={c}
                                    onClick={() => setSelectedCat(c)}
                                    className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all ${selectedCat === c ? 'bg-orange-500 text-white shadow-lg shadow-orange-200' : 'bg-white text-slate-500 border border-slate-200 hover:border-orange-200'}`}
                                >
                                    {c} ({recipes.filter(r => r.category === c).length})
                                </button>
                            ))}
                        </div>
                    )}

                    {/* LIST VIEW */}
                    {viewMode === 'list' && (
                        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                            {filteredRecipes.map((recipe, idx) => (
                                <div key={recipe.id} className={`flex items-center gap-4 px-5 py-4 transition-colors ${idx !== 0 ? 'border-t border-slate-100' : ''} ${selectedIds.has(recipe.id!) ? 'bg-orange-50/60' : 'hover:bg-slate-50'}`}>
                                    {/* Select */}
                                    <button
                                        onClick={() => toggleSelect(recipe.id!)}
                                        className="flex-shrink-0 text-slate-300 hover:text-orange-500 transition-colors"
                                        title="Select for printing"
                                    >
                                        {selectedIds.has(recipe.id!) ? <CheckSquare className="w-5 h-5 text-orange-500"/> : <Square className="w-5 h-5"/>}
                                    </button>

                                    {/* Thumbnail */}
                                    <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-orange-50 flex items-center justify-center">
                                        {recipe.imageUrl
                                            ? <img src={recipe.imageUrl} className="w-full h-full object-cover" alt={recipe.name}/>
                                            : <ChefHat className="w-6 h-6 text-orange-200"/>
                                        }
                                    </div>

                                    {/* Name + meta */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-bold text-slate-800 truncate">{recipe.name}</span>
                                            <Badge variant="neutral" className="!text-[10px] !bg-orange-50 !text-orange-600 border-orange-100 flex-shrink-0">{recipe.category}</Badge>
                                        </div>
                                        <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-400">
                                            <span>{recipe.ingredients.length} ingredients</span>
                                            {recipe.steps.length > 0 && <span>· {recipe.steps.length} steps</span>}
                                            {recipe.prepTime && <span className="flex items-center gap-1"><Clock size={10}/> {recipe.prepTime}m prep</span>}
                                            {recipe.cookTime && <span className="flex items-center gap-1"><Clock size={10}/> {recipe.cookTime}m cook</span>}
                                            {recipe.servingSize && <span className="flex items-center gap-1"><Users size={10}/> {recipe.servingSize}</span>}
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                        <button
                                            onClick={() => handleToggleShare(recipe)}
                                            disabled={togglingId === recipe.id}
                                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                                recipe.isShared
                                                    ? 'bg-emerald-500 text-white'
                                                    : 'bg-slate-100 text-slate-500 hover:bg-orange-50 hover:text-orange-600'
                                            }`}
                                        >
                                            {togglingId === recipe.id ? <Loader2 size={13} className="animate-spin"/> : recipe.isShared ? <Eye size={13}/> : <EyeOff size={13}/>}
                                            {shareLabel(recipe)}
                                        </button>
                                        <button
                                            onClick={() => copyForWhatsApp(recipe)}
                                            className={`p-2 rounded-lg transition-all ${copiedId === recipe.id ? 'text-emerald-600 bg-emerald-50' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
                                        >
                                            {copiedId === recipe.id ? <Check size={15}/> : <Copy size={15}/>}
                                        </button>
                                        <button onClick={() => handleEdit(recipe)} className="p-2 text-slate-400 hover:text-orange-500 hover:bg-orange-50 rounded-lg transition-all">
                                            <Edit size={15}/>
                                        </button>
                                        <button onClick={() => handleDelete(recipe.id!)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all">
                                            {deletingId === recipe.id ? <Loader2 size={15} className="animate-spin"/> : <Trash2 size={15}/>}
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {filteredRecipes.length === 0 && !isCreating && (
                                <div className="text-center py-16 text-slate-300">
                                    <ChefHat className="w-12 h-12 mx-auto mb-3 opacity-40"/>
                                    <p className="font-bold text-slate-400">{selectedCat === 'ALL' ? 'No recipes yet.' : `No recipes in ${selectedCat}.`}</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* GRID VIEW */}
                    {viewMode === 'grid' && (
                        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {filteredRecipes.map(recipe => (
                                <div key={recipe.id} className={`bg-white rounded-3xl border shadow-sm overflow-hidden hover:shadow-md transition-shadow group flex flex-col ${selectedIds.has(recipe.id!) ? 'border-orange-300 ring-2 ring-orange-200' : 'border-slate-100'}`}>
                                    {recipe.imageUrl ? (
                                        <div className="h-44 overflow-hidden bg-slate-100">
                                            <img src={recipe.imageUrl} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt={recipe.name}/>
                                        </div>
                                    ) : (
                                        <div className="h-44 bg-gradient-to-br from-orange-50 to-amber-100 flex items-center justify-center">
                                            <ChefHat className="w-16 h-16 text-orange-200"/>
                                        </div>
                                    )}
                                    <div className="p-5 flex-1 flex flex-col">
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <button
                                                    onClick={() => toggleSelect(recipe.id!)}
                                                    className="flex-shrink-0 text-slate-300 hover:text-orange-500 transition-colors"
                                                    title="Select for printing"
                                                >
                                                    {selectedIds.has(recipe.id!) ? <CheckSquare className="w-5 h-5 text-orange-500"/> : <Square className="w-5 h-5"/>}
                                                </button>
                                                <Badge variant="neutral" className="!text-[10px] !bg-orange-50 !text-orange-600 border-orange-100">{recipe.category}</Badge>
                                            </div>
                                            <div className="flex gap-1">
                                                <button onClick={() => handleEdit(recipe)} className="p-1.5 text-slate-300 hover:text-orange-500 hover:bg-orange-50 rounded-lg transition-all"><Edit size={16}/></button>
                                                <button onClick={() => handleDelete(recipe.id!)} className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all">
                                                    {deletingId === recipe.id ? <Loader2 size={16} className="animate-spin"/> : <Trash2 size={16}/>}
                                                </button>
                                            </div>
                                        </div>
                                        <h3 className="font-bold text-slate-800 text-lg leading-tight mb-1">{recipe.name}</h3>
                                        {recipe.description && <p className="text-sm text-slate-500 line-clamp-2 mb-2">{recipe.description}</p>}
                                        <div className="flex gap-3 text-xs text-slate-400 mb-2">
                                            {recipe.prepTime && <span className="flex items-center gap-1"><Clock size={11}/> Prep {recipe.prepTime}m</span>}
                                            {recipe.cookTime && <span className="flex items-center gap-1"><Clock size={11}/> Cook {recipe.cookTime}m</span>}
                                            {recipe.servingSize && <span className="flex items-center gap-1"><Users size={11}/> {recipe.servingSize} servings</span>}
                                        </div>
                                        <p className="text-xs text-slate-300 mb-3">{recipe.ingredients.length} ingredients · {recipe.steps.length} steps</p>
                                        <div className="pt-4 border-t border-slate-50 flex gap-2 mt-auto">
                                            <button
                                                onClick={() => handleToggleShare(recipe)}
                                                disabled={togglingId === recipe.id}
                                                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all border ${
                                                    recipe.isShared
                                                        ? 'bg-emerald-500 text-white border-emerald-500 shadow-sm shadow-emerald-200'
                                                        : 'bg-slate-100 text-slate-500 border-transparent hover:bg-orange-50 hover:text-orange-600'
                                                }`}
                                            >
                                                {togglingId === recipe.id ? <Loader2 size={14} className="animate-spin"/> : recipe.isShared ? <Eye size={14}/> : <EyeOff size={14}/>}
                                                {shareLabel(recipe)}
                                            </button>
                                            <button
                                                onClick={() => copyForWhatsApp(recipe)}
                                                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all border border-transparent ${
                                                    copiedId === recipe.id ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                                }`}
                                            >
                                                {copiedId === recipe.id ? <Check size={14}/> : <Copy size={14}/>}
                                                {copiedId === recipe.id ? 'Copied!' : 'Copy WA'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {filteredRecipes.length === 0 && !isCreating && (
                                <div className="col-span-3 text-center py-20 text-slate-300">
                                    <ChefHat className="w-16 h-16 mx-auto mb-3 opacity-40"/>
                                    <p className="font-bold text-slate-400">{selectedCat === 'ALL' ? 'No recipes yet.' : `No recipes in ${selectedCat}.`}</p>
                                    <p className="text-slate-300 text-sm">{selectedCat === 'ALL' ? 'Click "Add New Recipe" to get started.' : 'Try another category or clear the filter.'}</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
