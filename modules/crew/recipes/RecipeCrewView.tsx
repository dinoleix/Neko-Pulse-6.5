
import React, { useState, useEffect } from 'react';
import { recipeService } from '../../../services/recipeService';
import { Recipe, RecipeConfig, CurrentUser } from '../../../types';
import { Badge } from '../../../components/SharedComponents';
import { ChefHat, Clock, Users, ChevronDown, ChevronUp } from 'lucide-react';

export const RecipeCrewView: React.FC<{ currentUser: CurrentUser }> = ({ currentUser }) => {
    const [recipes, setRecipes] = useState<Recipe[]>([]);
    const [config, setConfig] = useState<RecipeConfig>({ categories: [] });
    const [selectedCat, setSelectedCat] = useState('ALL');
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            try {
                const [recipesData, configData] = await Promise.all([
                    recipeService.getShared(),
                    recipeService.getConfig()
                ]);
                setRecipes(recipesData);
                setConfig(configData);
            } catch (e) {
                console.error(e);
            } finally {
                setIsLoading(false);
            }
        };
        load();
    }, []);

    const filtered = selectedCat === 'ALL' ? recipes : recipes.filter(r => r.category === selectedCat);
    const activeCategories = config.categories.filter(c => recipes.some(r => r.category === c));

    if (isLoading) return <div className="p-12 text-center text-orange-500 font-bold animate-pulse">Loading Recipes...</div>;

    return (
        <div className="space-y-6 pb-20">
            {/* Header */}
            <div className="bg-gradient-to-br from-orange-500 to-amber-500 rounded-3xl p-6 text-white shadow-xl shadow-orange-100">
                <div className="flex items-center gap-4">
                    <div className="bg-white/20 p-3 rounded-2xl backdrop-blur-sm">
                        <ChefHat className="w-8 h-8 text-white"/>
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold">Kitchen Recipes</h2>
                        <p className="text-orange-100 opacity-90">
                            {recipes.length} recipe{recipes.length !== 1 ? 's' : ''} available
                        </p>
                    </div>
                </div>
            </div>

            {/* Category Filter */}
            {activeCategories.length > 0 && (
                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 px-1">
                    <button
                        onClick={() => setSelectedCat('ALL')}
                        className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all ${selectedCat === 'ALL' ? 'bg-orange-500 text-white shadow-lg shadow-orange-200' : 'bg-white text-slate-500 border border-slate-200'}`}
                    >
                        All
                    </button>
                    {activeCategories.map(c => (
                        <button
                            key={c}
                            onClick={() => setSelectedCat(c)}
                            className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all ${selectedCat === c ? 'bg-orange-500 text-white shadow-lg shadow-orange-200' : 'bg-white text-slate-500 border border-slate-200'}`}
                        >
                            {c}
                        </button>
                    ))}
                </div>
            )}

            {/* Recipe List */}
            <div className="space-y-4">
                {filtered.map(recipe => (
                    <div
                        key={recipe.id}
                        className={`bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden transition-all ${expandedId === recipe.id ? 'ring-2 ring-orange-400' : ''}`}
                    >
                        {recipe.imageUrl && (
                            <div className="h-48 overflow-hidden">
                                <img src={recipe.imageUrl} className="w-full h-full object-cover" alt={recipe.name}/>
                            </div>
                        )}
                        <div className="p-5">
                            <div className="flex justify-between items-start mb-2">
                                <Badge variant="neutral" className="!bg-orange-50 !text-orange-600 !text-[10px] uppercase border-orange-100">
                                    {recipe.category}
                                </Badge>
                                <button
                                    onClick={() => setExpandedId(expandedId === recipe.id ? null : recipe.id!)}
                                    className="text-slate-400 hover:text-orange-500 p-1 transition-colors"
                                >
                                    {expandedId === recipe.id ? <ChevronUp size={20}/> : <ChevronDown size={20}/>}
                                </button>
                            </div>

                            <h3 className="text-xl font-bold text-slate-800 leading-tight mb-2">{recipe.name}</h3>

                            <div className="flex flex-wrap gap-4 text-xs text-slate-400">
                                {recipe.prepTime && <span className="flex items-center gap-1"><Clock size={11}/> Prep {recipe.prepTime}m</span>}
                                {recipe.cookTime && <span className="flex items-center gap-1"><Clock size={11}/> Cook {recipe.cookTime}m</span>}
                                {recipe.servingSize && <span className="flex items-center gap-1"><Users size={11}/> Serves {recipe.servingSize}</span>}
                            </div>

                            {recipe.description && (
                                <p className="text-slate-500 text-sm mt-2 leading-relaxed">{recipe.description}</p>
                            )}

                            {expandedId === recipe.id && (
                                <div className="mt-5 pt-5 border-t border-slate-100 space-y-6 animate-in slide-in-from-top duration-300">
                                    {/* Ingredients */}
                                    <div>
                                        <h4 className="text-xs font-bold text-orange-500 uppercase tracking-wider mb-3">
                                            Ingredients
                                        </h4>
                                        <div className="space-y-1">
                                            {recipe.ingredients.map((ing, i) => (
                                                <div key={i} className="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0">
                                                    <div className="w-2 h-2 rounded-full bg-orange-300 flex-shrink-0"/>
                                                    <span className="font-semibold text-slate-700 text-sm flex-1">{ing.name}</span>
                                                    <span className="text-slate-500 text-sm font-mono tabular-nums">
                                                        {ing.amount} {ing.unit}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Steps */}
                                    <div>
                                        <h4 className="text-xs font-bold text-orange-500 uppercase tracking-wider mb-3">
                                            Steps
                                        </h4>
                                        <div className="space-y-4">
                                            {recipe.steps.map((step, i) => (
                                                <div key={i} className="flex gap-3">
                                                    <div className="w-7 h-7 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xs font-black flex-shrink-0 mt-0.5">
                                                        {i + 1}
                                                    </div>
                                                    <p className="text-slate-700 leading-relaxed">{step}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => setExpandedId(null)}
                                        className="w-full py-3 bg-slate-50 text-slate-500 rounded-2xl text-sm font-bold hover:bg-slate-100 transition-colors"
                                    >
                                        Hide Recipe
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                ))}

                {filtered.length === 0 && (
                    <div className="text-center py-20 text-slate-300">
                        <ChefHat className="w-16 h-16 mx-auto mb-3 opacity-40"/>
                        <p className="text-slate-400 font-bold">No recipes shared yet.</p>
                        <p className="text-slate-300 text-sm">Check back later!</p>
                    </div>
                )}
            </div>
        </div>
    );
};
