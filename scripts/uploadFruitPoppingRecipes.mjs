// Upload the Fruit Popping build-sheet recipes (from the Fruit popping card PDF)
// into the Kitchen Recipes module. These are the popping-boba fruit teas, which
// live in the 'Boba Tea' category (matching the seed menu's "... Popping" items).
//
// Same conventions as the other uploads: each drink becomes TWO recipes —
// "<Drink> (Regular)" and "<Drink> (Large)" — with the exact amounts from the
// card, all left HIDDEN from crew (isShared:false) for review. It also removes
// the empty single "... Popping" placeholder for each covered drink.
//
// Safe to re-run: upserts by (name + 'Boba Tea'). Tagged createdBy:'fruit-popping-import'.
//
// Usage:
//   MANAGER_EMAIL=you@example.com MANAGER_PASSWORD='...' node scripts/uploadFruitPoppingRecipes.mjs
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

const i = (name, amount, unit) => ({ name, amount, unit });

const NOTE = 'Fruit popping tea — build sheet from the kitchen recipe card. Method/steps to be added.';
const MATCHA_NOTE = NOTE + ' Matcha is prepared from the listed matcha powder + sugar + water.';
const LYCHEE_NOTE = NOTE + ' (Card lists no popping boba for Lychee — please confirm.)';

// Card maps to the seed menu's "... Popping" placeholder via `base`.
const DRINKS = [
    {
        base: 'Mango Popping', description: NOTE, // card: "Mango green tea"
        regular: [i('Green tea', '150', 'ml'), i('Syrup', '25', 'ml'), i('Sugar syrup', '15', 'ml'), i('Popping boba', '1', 'scoop'), i('Mango compote', '5', 'ml'), i('Chia & basil seed', '', ''), i('Ice', '6-7', 'cubes')],
        large: [i('Green tea', '250', 'ml'), i('Syrup', '45', 'ml'), i('Sugar syrup', '30', 'ml'), i('Popping boba', '1', 'scoop'), i('Mango compote', '5', 'ml'), i('Chia & basil seed', '', ''), i('Ice', '6-7', 'cubes')],
    },
    {
        base: 'Peach Popping', description: NOTE, // card: "Peach green tea"
        regular: [i('Green tea', '100', 'ml'), i('Syrup', '25', 'ml'), i('Sugar', '15', 'ml'), i('Popping boba', '1', 'scoop'), i('Chia & basil seed', '', ''), i('Ice', '6-7', 'cubes')],
        large: [i('Green tea', '200', 'ml'), i('Syrup', '45', 'ml'), i('Sugar', '30', 'ml'), i('Popping boba', '1', 'scoop'), i('Chia & basil seed', '', ''), i('Ice', '6-7', 'cubes')],
    },
    {
        base: 'Mango Matcha Popping', description: MATCHA_NOTE, // card: "Mango matcha"
        regular: [i('Water', '100', 'ml'), i('Mango compote', '30', 'ml'), i('Sugar', '30', 'ml'), i('Soda', '30', 'ml'), i('Popping boba', '1', 'scoop'), i('Ice', '6-7', 'cubes'), i('Matcha powder', '1', 'tsp'), i('Sugar (for matcha)', '1', 'tsp'), i('Water (for matcha)', '45', 'ml')],
        large: [i('Water', '200', 'ml'), i('Mango compote', '45', 'ml'), i('Sugar', '45', 'ml'), i('Soda', '45', 'ml'), i('Popping boba', '1', 'scoop'), i('Ice', '6-7', 'cubes'), i('Matcha powder', '2', 'tsp'), i('Sugar (for matcha)', '2', 'tsp'), i('Water (for matcha)', '45', 'ml')],
    },
    {
        base: 'Strawberry Popping', description: NOTE, // card: "Strawberry green tea"
        regular: [i('Green tea', '100', 'ml'), i('Syrup', '25', 'ml'), i('Sugar', '15', 'ml'), i('Ice', '6-7', 'cubes'), i('Popping boba', '1', 'scoop'), i('Chia & basil seed', '', ''), i('Compote', '5', 'ml')],
        large: [i('Green tea', '200', 'ml'), i('Syrup', '45', 'ml'), i('Sugar', '30', 'ml'), i('Ice', '6-7', 'cubes'), i('Popping boba', '1', 'scoop'), i('Chia & basil seed', '', ''), i('Compote', '5', 'ml')],
    },
    {
        base: 'Passion Fruit & Peach Popping', description: NOTE, // card: "Passion and peach"
        regular: [i('Green tea', '150', 'ml'), i('Syrup (mix)', '25', 'ml'), i('Sugar', '15', 'ml'), i('Popping boba (mix)', '1', 'scoop'), i('Chia & basil seed', '', ''), i('Passion fruit seeds', '', ''), i('Ice', '6-7', 'cubes')],
        large: [i('Green tea', '250', 'ml'), i('Syrup (mix)', '45', 'ml'), i('Sugar', '30', 'ml'), i('Popping boba (mix)', '1', 'scoop'), i('Chia & basil seed', '', ''), i('Passion fruit seeds', '', ''), i('Ice', '6-7', 'cubes')],
    },
    {
        base: 'Passion Fruit Popping', description: NOTE, // card: "Passion fruit"
        regular: [i('Green tea', '150', 'ml'), i('Syrup', '25', 'ml'), i('Sugar', '15', 'ml'), i('Popping boba', '1', 'scoop'), i('Chia & basil seed', '', ''), i('Passion fruit seeds', '', ''), i('Ice', '6-7', 'cubes')],
        large: [i('Green tea', '250', 'ml'), i('Syrup', '45', 'ml'), i('Sugar', '30', 'ml'), i('Popping boba', '1', 'scoop'), i('Chia & basil seed', '', ''), i('Passion fruit seeds', '', ''), i('Ice', '6-7', 'cubes')],
    },
    {
        base: 'Raspberry Popping', description: NOTE, // card: "Raspberry"
        regular: [i('Green tea', '150', 'ml'), i('Syrup', '25', 'ml'), i('Sugar', '15', 'ml'), i('Raspberry crush', '1', 'tsp'), i('Chia & basil seed', '', ''), i('Ice', '6-7', 'cubes')],
        large: [i('Green tea', '250', 'ml'), i('Syrup', '45', 'ml'), i('Sugar', '30', 'ml'), i('Raspberry crush', '1', 'tsp'), i('Chia & basil seed', '', ''), i('Ice', '6-7', 'cubes')],
    },
    {
        base: 'Lychee Popping', description: LYCHEE_NOTE, // card: "Lychee" (no popping boba listed)
        regular: [i('Green tea', '150', 'ml'), i('Syrup', '25', 'ml'), i('Sugar', '15', 'ml'), i('Chia & basil seed', '', ''), i('Ice', '6-7', 'cubes')],
        large: [i('Green tea', '250', 'ml'), i('Syrup', '45', 'ml'), i('Sugar', '30', 'ml'), i('Chia & basil seed', '', ''), i('Ice', '6-7', 'cubes')],
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

    const plan = [];
    const deletes = [];

    for (const drink of DRINKS) {
        for (const [size, ingredients] of [['Regular', drink.regular], ['Large', drink.large]]) {
            const name = `${drink.base} (${size})`;
            const cur = byName.get(name);
            plan.push({ op: cur ? 'update' : 'create', id: cur?.id, name, description: drink.description, ingredients });
        }
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
            p.ingredients.forEach(g => console.log(`        ${g.name}: ${g.amount} ${g.unit}`.trimEnd()));
        });
        deletes.forEach(d => console.log(`  - delete empty placeholder: ${d.name}`));
        console.log('DRY_RUN set — nothing written.');
        process.exit(0);
    }

    const base = Date.now();
    const batch = db.batch();
    plan.forEach((p, idx) => {
        if (p.op === 'update') {
            batch.update(db.collection('recipes').doc(p.id), { ingredients: p.ingredients, description: p.description });
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
                createdBy: 'fruit-popping-import',
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
