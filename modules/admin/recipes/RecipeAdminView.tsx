
import React, { useState, useEffect } from 'react';
import { recipeService } from '../../../services/recipeService';
import { compressImage } from '../../../services/imageService';
import { Recipe, RecipeIngredient, RecipeConfig } from '../../../types';
import { Button, Card, Input, TextArea, Select, Badge } from '../../../components/SharedComponents';
import { ChefHat, Plus, Trash2, Edit, Upload, X, Loader2, Save, Eye, EyeOff, Clock, Users, Copy, Check, LayoutList, LayoutGrid } from 'lucide-react';

const UNITS = ['g', 'kg', 'ml', 'L', 'pcs', 'tbsp', 'tsp', 'cup', 'pinch', 'slice', 'to taste'];

const emptyForm = (defaultCategory = ''): Partial<Recipe> => ({
    name: '',
    category: defaultCategory,
    description: '',
    ingredients: [],
    steps: [''],
    imageUrl: '',
    isShared: false,
    prepTime: undefined,
    cookTime: undefined,
    servingSize: undefined,
    createdBy: ''
});

export const RecipeAdminView: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'RECIPES' | 'CATEGORIES'>('RECIPES');
    const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
    const [recipes, setRecipes] = useState<Recipe[]>([]);
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

    const [form, setForm] = useState<Partial<Recipe>>(emptyForm());

    useEffect(() => { load(); }, []);

    const load = async () => {
        setIsLoading(true);
        try {
            const [recipesData, configData] = await Promise.all([
                recipeService.getAll(),
                recipeService.getConfig()
            ]);
            setRecipes(recipesData);
            setConfig(configData);
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
        setForm({ ...recipe, steps: recipe.steps?.length ? recipe.steps : [''] });
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

                                {/* SHARE TOGGLE */}
                                <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                    <button
                                        onClick={() => setForm(p => ({ ...p, isShared: !p.isShared }))}
                                        className={`w-12 h-6 rounded-full transition-colors flex items-center px-0.5 flex-shrink-0 ${form.isShared ? 'bg-emerald-500 justify-end' : 'bg-slate-300 justify-start'}`}
                                    >
                                        <span className="w-5 h-5 bg-white rounded-full shadow block"/>
                                    </button>
                                    <div>
                                        <div className="font-bold text-slate-700 text-sm">Share with Kitchen Staff</div>
                                        <div className="text-xs text-slate-400">{form.isShared ? 'Visible to kitchen crew in their app' : 'Admin-only — not visible to crew'}</div>
                                    </div>
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

                    {/* LIST VIEW */}
                    {viewMode === 'list' && (
                        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                            {recipes.map((recipe, idx) => (
                                <div key={recipe.id} className={`flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors ${idx !== 0 ? 'border-t border-slate-100' : ''}`}>
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
                                            {recipe.isShared ? 'Shared' : 'Share'}
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
                            {recipes.length === 0 && !isCreating && (
                                <div className="text-center py-16 text-slate-300">
                                    <ChefHat className="w-12 h-12 mx-auto mb-3 opacity-40"/>
                                    <p className="font-bold text-slate-400">No recipes yet.</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* GRID VIEW */}
                    {viewMode === 'grid' && (
                        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {recipes.map(recipe => (
                                <div key={recipe.id} className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow group flex flex-col">
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
                                            <Badge variant="neutral" className="!text-[10px] !bg-orange-50 !text-orange-600 border-orange-100">{recipe.category}</Badge>
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
                                                {recipe.isShared ? 'Shared' : 'Share'}
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
                            {recipes.length === 0 && !isCreating && (
                                <div className="col-span-3 text-center py-20 text-slate-300">
                                    <ChefHat className="w-16 h-16 mx-auto mb-3 opacity-40"/>
                                    <p className="font-bold text-slate-400">No recipes yet.</p>
                                    <p className="text-slate-300 text-sm">Click "Add New Recipe" to get started.</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
