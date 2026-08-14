// Seed the Kitchen Recipes module with menu categories and placeholder recipes.
//
// Each product is created as an EMPTY recipe: name + category set, but no
// ingredients/steps and isShared=false. That gives the kitchen team a stub to
// open and fill in later, and keeps blanks hidden from crew until shared.
//
// Safe to re-run: it skips any recipe whose (name + category) already exists,
// and every seeded doc is marked createdBy:'seed-import' so the whole batch can
// be found/removed in one query. It also consolidates categories to the new set
// and moves any existing recipe with an off-list category into 'Others'.
//
// Usage:
//   MANAGER_EMAIL=you@example.com MANAGER_PASSWORD='...' node scripts/seedRecipes.mjs
//   add DRY_RUN=1 to preview without writing.
//
// The manager account must already exist in Firebase Auth AND have a doc in the
// /managers collection (that is what the Firestore rules treat as "manager").

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// --- Menu data (prices intentionally omitted) ---------------------------------

const CATEGORY_ORDER = [
    'Breakfast', 'Ramen', 'Poke Bowls', 'Appetizers', 'Donburi',
    'Tea & Desserts', 'Boba Tea', 'Coffee', 'Desserts', 'Others',
];

const PRODUCTS = {
    'Breakfast': [
        'Avocado Toast (Non Veg)',
        'French Toast Cloud with Fruits / Berry Compote / Whipped Cream Cheese',
        'Cream Cheese Soufflé Pancake',
        'Acai Bowl (Peanut Butter)',
        'Acai Bowl (Yogurt)',
        'Matcha Soufflé Pancake',
        'Chocolate Soufflé Pancake',
        'French Toast Cloud (Plain)',
    ],
    'Ramen': [
        'Pan-Grilled Chicken Ramen',
        'Spicy Chicken Ramen',
        'Tofu Ramen (Veg Broth)',
        'Chicken Tantanmen Ramen',
        'Tofu Tantanmen Ramen',
        'Naruto Ramen',
    ],
    'Poke Bowls': [
        'Shrimp Poke Bowl',
        'Chicken Poke Bowl',
        'Tuna Poke Bowl',
        'Salmon Poke Bowl',
        'Paneer Poke Bowl',
        'Tofu Poke Bowl',
    ],
    'Appetizers': [
        'Takoyaki',
        'Chicken Katsu Finger',
        'Prawn Tempura',
        'Chicken Karaage',
        'Seasonal Vegetable Tempura',
        'Paneer Katsu Finger',
        'Teriyaki Tofu',
        'Teriyaki Paneer',
        'Chicken Teriyaki',
        'Tofu Katsu Finger',
        'Chicken Gyoza / Dumplings',
        'Katsu Chicken Sando',
        'Chicken Onigiri',
        'Tamago Sando',
        'Cheese & Mushroom Gyoza',
        'Paneer Onigiri',
        'Katsu Tofu Sando',
    ],
    'Donburi': [
        'Spicy Chicken Don',
        'Tofu Teriyaki Don',
        'Egg & Vegetable Don',
        'Chicken Teriyaki Don',
    ],
    'Tea & Desserts': [
        'Bubble Waffle',
        'Cookies',
        'Forbidden Rice Tea',
        'Sumac Berry Tea',
        'Fruity Roselle Tea',
    ],
    'Boba Tea': [
        'Thai Tea',
        'Vietnamese Coffee',
        'Matcha Tea',
        'Brown Sugar Milk',
        'Caramel Milk',
        'Chocolate Milk',
        'Strawberry Milk',
        'Mango Milk',
        'Blueberry Milk',
        'Passion Fruit Popping',
        'Lychee Popping',
        'Strawberry Matcha Tea',
        'Strawberry Popping',
        'Mango Popping',
        'Peach Popping',
        'Passion Fruit & Peach Popping',
        'Mango Matcha Popping',
        'Taro Milk',
        'Raspberry Popping',
        'Peachy Fuzz',
        'Blush Fuzz',
    ],
    'Coffee': [
        'Espresso (Single / Double)',
        'Vietnamese Coffee',
        'Americano',
        'Cappuccino',
        'Latte',
        'Mocha',
        'Iced Espresso (Single / Double)',
        'Iced Vietnamese Coffee',
        'Iced Americano',
        'Iced Cappuccino',
        'Iced Latte',
        'Iced Mocha',
        'Iced Orange Coffee',
        'Iced Lime Coffee',
        'Iced Coffee with French Vanilla',
        'Matcha Latte',
        'Matcha Iced Tea',
        'Strawberry Matcha Latte',
        'Mango Matcha',
        'Thai Tea Latte',
    ],
    'Desserts': [
        'Tiramisu',
        'Shu Cream',
        'Choco Filled Éclair',
        'Maritozzo Cream Bun',
    ],
};

// --- Firebase config from .env.local ------------------------------------------

function loadEnv() {
    const raw = readFileSync(join(ROOT, '.env.local'), 'utf8');
    const env = {};
    for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq === -1) continue;
        env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
    return env;
}

async function main() {
    const DRY_RUN = !!process.env.DRY_RUN;
    const email = process.env.MANAGER_EMAIL;
    const password = process.env.MANAGER_PASSWORD;
    if (!email || !password) {
        console.error('Set MANAGER_EMAIL and MANAGER_PASSWORD env vars (a Firebase account with a /managers doc).');
        process.exit(1);
    }

    const env = loadEnv();
    firebase.initializeApp({
        apiKey: env.VITE_FIREBASE_API_KEY,
        authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: env.VITE_FIREBASE_PROJECT_ID,
        storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
        appId: env.VITE_FIREBASE_APP_ID,
    });

    await firebase.auth().signInWithEmailAndPassword(email, password);
    console.log(`Signed in as ${email}`);
    const db = firebase.firestore();

    // 1) Consolidate categories to exactly the new set (Others included). Any
    //    existing recipe whose category is not in that set is moved to Others.
    const recipesSnap = await db.collection('recipes').get();
    const existing = recipesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const validCats = new Set(CATEGORY_ORDER);
    const toRecategorize = existing.filter(r => r.category && !validCats.has(r.category));
    const merged = [...CATEGORY_ORDER];

    console.log(`Categories -> ${merged.join(', ')}`);
    console.log(`Existing recipes to move to 'Others': ${toRecategorize.length}`);

    // 2) Placeholder recipes, skipping any (name+category) that already exists.
    const seen = new Set(existing.map(r => `${r.name}|||${r.category}`));
    const toCreate = [];
    for (const category of CATEGORY_ORDER) {
        for (const name of (PRODUCTS[category] || [])) {
            const key = `${name}|||${category}`;
            if (seen.has(key)) continue;
            seen.add(key);
            toCreate.push({ name, category });
        }
    }

    console.log(`Recipes to create: ${toCreate.length} (skipped ${existing.length ? 'existing duplicates' : 'none'})`);

    if (DRY_RUN) {
        toRecategorize.forEach(r => console.log(`  ~ move to Others: [${r.category}] ${r.name}`));
        toCreate.forEach(r => console.log(`  + [${r.category}] ${r.name}`));
        console.log('DRY_RUN set — nothing written.');
        process.exit(0);
    }

    // Write config + recipes. Sequential createdAt (newest = top of admin list)
    // keeps the seeded list reading top-to-bottom in menu order.
    await db.collection('settings').doc('recipeConfig').set({ categories: merged }, { merge: true });

    const base = Date.now();
    const batch = db.batch();
    toRecategorize.forEach(r => {
        batch.update(db.collection('recipes').doc(r.id), { category: 'Others' });
    });
    toCreate.forEach((r, i) => {
        const ref = db.collection('recipes').doc();
        batch.set(ref, {
            name: r.name,
            category: r.category,
            description: '',
            ingredients: [],
            steps: [],
            imageUrl: '',
            isShared: false,
            createdBy: 'seed-import',
            createdAt: firebase.firestore.Timestamp.fromMillis(base - i * 1000),
        });
    });
    await batch.commit();

    console.log(`Done. Created ${toCreate.length} placeholder recipes, moved ${toRecategorize.length} existing recipe(s) to 'Others', and updated categories.`);
    process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
