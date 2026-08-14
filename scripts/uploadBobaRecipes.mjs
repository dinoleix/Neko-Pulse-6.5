// Upload the boba build-sheet recipes (from the kitchen recipe card PDF) into
// the Kitchen Recipes module, in the 'Boba Tea' category.
//
// Per your choices: each drink becomes TWO recipes — "<Drink> (Regular)" and
// "<Drink> (Large)" — with the exact amounts from the sheet, and all are left
// HIDDEN from crew (isShared:false) for you to review and share later.
//
// It also removes the empty single placeholder for each covered drink (the
// blank stubs created by seedRecipes.mjs), since the sized recipes replace them.
// Only EMPTY seed placeholders are deleted — anything with ingredients is left
// alone. The dry run shows every create/delete before you commit.
//
// Safe to re-run: upserts by (name + 'Boba Tea'), so it won't duplicate.
// Seeded docs are tagged createdBy:'boba-import' for easy find/undo.
//
// Usage:
//   MANAGER_EMAIL=you@example.com MANAGER_PASSWORD='...' node scripts/uploadBobaRecipes.mjs
//   add DRY_RUN=1 to preview without writing.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CATEGORY = 'Boba Tea';

// ing(name, amount, unit)
const i = (name, amount, unit) => ({ name, amount, unit });

const NOTE = 'Boba milk tea — build sheet from the kitchen recipe card. Method/steps to be added.';
const MATCHA_NOTE = NOTE + ' Matcha is prepared from the listed matcha powder + sugar + water.';
const STRAW_MATCHA_NOTE = NOTE + ' Matcha prepared as in Matcha Tea (amounts assumed identical — please verify).';

const DRINKS = [
    {
        base: 'Thai Tea', description: NOTE,
        regular: [i('Milk', '100', 'ml'), i('Condensed milk', '30', 'ml'), i('Thickener powder', '1', 'tsp'), i('Boba', '1', 'scoop'), i('Ice', '6-7', 'cubes'), i('Thai tea', '100', 'ml')],
        large: [i('Milk', '200', 'ml'), i('Condensed milk', '45', 'ml'), i('Thickener powder', '2', 'tsp'), i('Boba', '1', 'scoop'), i('Ice', '6-7', 'cubes'), i('Thai tea', '100', 'ml')],
    },
    {
        base: 'Vietnamese Coffee', description: NOTE,
        regular: [i('Milk', '100', 'ml'), i('Condensed milk', '30', 'ml'), i('Thickener powder', '1', 'tsp'), i('Boba', '1', 'scoop'), i('Ice', '6-7', 'cubes'), i('Vietnamese coffee', '100', 'ml')],
        large: [i('Milk', '200', 'ml'), i('Condensed milk', '45', 'ml'), i('Thickener powder', '2', 'tsp'), i('Boba', '1', 'scoop'), i('Ice', '6-7', 'cubes'), i('Vietnamese coffee', '100', 'ml')],
    },
    {
        base: 'Matcha Tea', description: MATCHA_NOTE,
        regular: [i('Milk', '100', 'ml'), i('Condensed milk', '30', 'ml'), i('Thickener powder', '1', 'tsp'), i('Boba', '1', 'scoop'), i('Ice', '6-7', 'cubes'), i('Matcha powder', '1', 'tsp'), i('Sugar', '1', 'tsp'), i('Water', '45', 'ml')],
        large: [i('Milk', '200', 'ml'), i('Condensed milk', '45', 'ml'), i('Thickener powder', '2', 'tsp'), i('Boba', '1', 'scoop'), i('Ice', '6-7', 'cubes'), i('Matcha powder', '2', 'tsp'), i('Sugar', '2', 'tsp'), i('Water', '80', 'ml')],
    },
    {
        base: 'Strawberry Matcha Tea', description: STRAW_MATCHA_NOTE,
        regular: [i('Milk', '100', 'ml'), i('Condensed milk', '15', 'ml'), i('Boba', '1', 'scoop'), i('Strawberry compote', '15', 'g'), i('Ice', '6-7', 'cubes'), i('Matcha powder', '1', 'tsp'), i('Sugar', '1', 'tsp'), i('Water', '45', 'ml')],
        large: [i('Milk', '200', 'ml'), i('Condensed milk', '30', 'ml'), i('Boba', '1', 'scoop'), i('Strawberry compote', '30', 'g'), i('Ice', '6-7', 'cubes'), i('Matcha powder', '2', 'tsp'), i('Sugar', '2', 'tsp'), i('Water', '80', 'ml')],
    },
    {
        base: 'Blueberry Milk', description: NOTE,
        regular: [i('Milk', '150', 'ml'), i('Syrup', '25', 'ml'), i('Condensed milk', '15', 'ml'), i('Thickener powder', '1', 'tsp'), i('Boba', '1', 'scoop'), i('Ice', '6-7', 'cubes'), i('Compote', '5', 'g')],
        large: [i('Milk', '250', 'ml'), i('Syrup', '45', 'ml'), i('Condensed milk', '30', 'ml'), i('Thickener powder', '2', 'tsp'), i('Boba', '1', 'scoop'), i('Ice', '6-7', 'cubes'), i('Compote', '5', 'g')],
    },
    {
        // PDF "Strawberry boba" (milk-based, with compote) -> menu "Strawberry Milk".
        base: 'Strawberry Milk', description: NOTE,
        regular: [i('Milk', '150', 'ml'), i('Syrup', '25', 'ml'), i('Condensed milk', '15', 'ml'), i('Thickener powder', '1', 'tsp'), i('Boba', '1', 'scoop'), i('Ice', '6-7', 'cubes'), i('Compote', '5', 'g')],
        large: [i('Milk', '250', 'ml'), i('Syrup', '45', 'ml'), i('Condensed milk', '30', 'ml'), i('Thickener powder', '2', 'tsp'), i('Boba', '1', 'scoop'), i('Ice', '6-7', 'cubes'), i('Compote', '5', 'g')],
    },
    {
        base: 'Brown Sugar Milk', description: NOTE,
        regular: [i('Milk', '150', 'ml'), i('Syrup', '25', 'ml'), i('Condensed milk', '15', 'ml'), i('Thickener powder', '1', 'tsp'), i('Boba', '1', 'scoop'), i('Ice', '6-7', 'cubes')],
        large: [i('Milk', '250', 'ml'), i('Syrup', '45', 'ml'), i('Condensed milk', '30', 'ml'), i('Thickener powder', '2', 'tsp'), i('Boba', '1', 'scoop'), i('Ice', '6-7', 'cubes')],
    },
    {
        base: 'Caramel Milk', description: NOTE,
        regular: [i('Milk', '150', 'ml'), i('Syrup', '25', 'ml'), i('Condensed milk', '15', 'ml'), i('Thickener powder', '1', 'tsp'), i('Boba', '1', 'scoop'), i('Ice', '6-7', 'cubes')],
        large: [i('Milk', '250', 'ml'), i('Syrup', '45', 'ml'), i('Condensed milk', '30', 'ml'), i('Thickener powder', '2', 'tsp'), i('Boba', '1', 'scoop'), i('Ice', '6-7', 'cubes')],
    },
    {
        base: 'Chocolate Milk', description: NOTE,
        regular: [i('Milk', '150', 'ml'), i('Chocolate sauce', '25', 'ml'), i('Condensed milk', '15', 'ml'), i('Thickener powder', '1', 'tsp'), i('Coco powder', '1', 'tsp'), i('Boba', '1', 'scoop'), i('Ice', '6-7', 'cubes')],
        large: [i('Milk', '250', 'ml'), i('Chocolate sauce', '45', 'ml'), i('Condensed milk', '30', 'ml'), i('Thickener powder', '2', 'tsp'), i('Coco powder', '2', 'tsp'), i('Boba', '1', 'scoop'), i('Ice', '6-7', 'cubes')],
    },
    {
        // NOTE: PDF lists Thickener 1 tsp for Mango LARGE (others use 2 tsp).
        base: 'Mango Milk', description: NOTE,
        regular: [i('Milk', '150', 'ml'), i('Syrup', '25', 'ml'), i('Condensed milk', '15', 'ml'), i('Thickener powder', '1', 'tsp'), i('Compote', '5', 'g'), i('Boba', '1', 'scoop'), i('Ice', '6-7', 'cubes')],
        large: [i('Milk', '250', 'ml'), i('Syrup', '45', 'ml'), i('Condensed milk', '30', 'ml'), i('Thickener powder', '1', 'tsp'), i('Compote', '5', 'g'), i('Boba', '1', 'scoop'), i('Ice', '6-7', 'cubes')],
    },
    {
        // NOTE: PDF lists Thickener 1 tsp for Taro LARGE (others use 2 tsp).
        base: 'Taro Milk', description: NOTE,
        regular: [i('Milk', '150', 'ml'), i('Taro powder', '1', 'tbsp'), i('Condensed milk', '15', 'ml'), i('Thickener powder', '1', 'tsp'), i('Boba', '1', 'scoop'), i('Ice', '6-7', 'cubes')],
        large: [i('Milk', '250', 'ml'), i('Taro powder', '2', 'tbsp'), i('Condensed milk', '30', 'ml'), i('Thickener powder', '1', 'tsp'), i('Boba', '1', 'scoop'), i('Ice', '6-7', 'cubes')],
    },
];

function loadEnv() {
    const raw = readFileSync(join(ROOT, '.env.local'), 'utf8');
    const env = {};
    for (const line of raw.split('\n')) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        const eq = t.indexOf('=');
        if (eq === -1) continue;
        env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
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

    const snap = await db.collection('recipes').where('category', '==', CATEGORY).get();
    const existing = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const byName = new Map(existing.map(r => [r.name, r]));

    // Build the plan: sized recipe upserts + empty-placeholder deletes.
    const plan = []; // {op:'create'|'update', name, ingredients, description, id?}
    const deletes = []; // {id, name}

    for (const drink of DRINKS) {
        for (const [size, ingredients] of [['Regular', drink.regular], ['Large', drink.large]]) {
            const name = `${drink.base} (${size})`;
            const cur = byName.get(name);
            plan.push({
                op: cur ? 'update' : 'create',
                id: cur?.id,
                name,
                description: drink.description,
                ingredients,
            });
        }
        // Remove the empty single placeholder that the sized recipes replace.
        const bare = byName.get(drink.base);
        if (bare && (bare.ingredients?.length || 0) === 0 && bare.createdBy === 'seed-import') {
            deletes.push({ id: bare.id, name: drink.base });
        }
    }

    const creates = plan.filter(p => p.op === 'create').length;
    const updates = plan.filter(p => p.op === 'update').length;
    console.log(`Plan: ${creates} create, ${updates} update, ${deletes.length} placeholder delete`);

    if (DRY_RUN) {
        plan.forEach(p => {
            console.log(`  ${p.op === 'create' ? '+' : '~'} ${p.name}`);
            p.ingredients.forEach(g => console.log(`        ${g.name}: ${g.amount} ${g.unit}`));
        });
        deletes.forEach(d => console.log(`  - delete empty placeholder: ${d.name}`));
        console.log('DRY_RUN set — nothing written.');
        process.exit(0);
    }

    const base = Date.now();
    const batch = db.batch();
    plan.forEach((p, idx) => {
        if (p.op === 'update') {
            batch.update(db.collection('recipes').doc(p.id), {
                ingredients: p.ingredients,
                description: p.description,
            });
        } else {
            const ref = db.collection('recipes').doc();
            batch.set(ref, {
                name: p.name,
                category: CATEGORY,
                description: p.description,
                ingredients: p.ingredients,
                steps: [],
                imageUrl: '',
                isShared: false,
                createdBy: 'boba-import',
                createdAt: firebase.firestore.Timestamp.fromMillis(base - idx * 1000),
            });
        }
    });
    deletes.forEach(d => batch.delete(db.collection('recipes').doc(d.id)));
    await batch.commit();

    console.log(`Done. ${creates} created, ${updates} updated, ${deletes.length} empty placeholder(s) removed. All kept hidden (isShared:false).`);
    process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
