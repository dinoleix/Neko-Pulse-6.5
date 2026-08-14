// Upload the iced-coffee build-sheet recipes (from the Coffee recipe card PDF)
// into the Kitchen Recipes module, in the 'Coffee' category.
//
// Same conventions as the boba upload: each drink becomes TWO recipes —
// "<Drink> (Regular)" and "<Drink> (Large)" — with the exact amounts from the
// card, all left HIDDEN from crew (isShared:false) for review.
//
// It also removes the empty single placeholder for each covered drink (the
// blank seed stubs), since the sized recipes replace them. Only EMPTY seed
// placeholders are deleted. The dry run shows everything before you commit.
//
// Safe to re-run: upserts by (name + 'Coffee'). Tagged createdBy:'coffee-import'.
//
// Usage:
//   MANAGER_EMAIL=you@example.com MANAGER_PASSWORD='...' node scripts/uploadCoffeeRecipes.mjs
//   add DRY_RUN=1 to preview without writing.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CATEGORY = 'Coffee';

const i = (name, amount, unit) => ({ name, amount, unit });

const NOTE = 'Iced coffee — build sheet from the kitchen recipe card. Method/steps to be added.';
// Where the card didn't itemise ice/water on an iced drink, it's added here for
// consistency; flagged so you can confirm.
const ICE_NOTE = NOTE + ' (Ice added for consistency — not itemised on the card.)';
const COLD_NOTE = 'Cold coffee — blended with vanilla ice cream. Build sheet from the kitchen recipe card. Method/steps to be added.';

const DRINKS = [
    {
        base: 'Iced Latte', description: NOTE,
        regular: [i('Coffee', '2', 'shot'), i('Ice', '', ''), i('Milk', '200', 'ml'), i('Sugar (optional)', '30', 'ml')],
        large: [i('Coffee', '2', 'shot'), i('Ice', '', ''), i('Milk', '300', 'ml'), i('Sugar (optional)', '45', 'ml')],
    },
    {
        base: 'Iced Cappuccino', description: NOTE,
        regular: [i('Coffee', '2', 'shot'), i('Ice', '', ''), i('Milk', '150', 'ml'), i('Sugar (optional)', '30', 'ml')],
        large: [i('Coffee', '2', 'shot'), i('Ice', '', ''), i('Milk', '250', 'ml'), i('Sugar (optional)', '45', 'ml')],
    },
    {
        base: 'Iced Mocha', description: ICE_NOTE,
        regular: [i('Chocolate sauce', '30', 'ml'), i('Chocolate powder', '1/4', 'tsp'), i('Coffee', '2', 'shot'), i('Milk', '150', 'ml'), i('Ice', '', '')],
        large: [i('Chocolate sauce', '45', 'ml'), i('Chocolate powder', '1/2', 'tsp'), i('Coffee', '2', 'shot'), i('Milk', '250', 'ml'), i('Ice', '', '')],
    },
    {
        base: 'Iced Orange Coffee', description: ICE_NOTE,
        regular: [i('Coffee', '2', 'shot'), i('Orange syrup', '30', 'ml'), i('Orange', '1', 'whole'), i('Ice', '', '')],
        large: [i('Coffee', '2', 'shot'), i('Orange syrup', '45', 'ml'), i('Orange', '2', 'whole'), i('Ice', '', '')],
    },
    {
        base: 'Iced Lime Coffee', description: ICE_NOTE,
        regular: [i('Lime juice', '30', 'ml'), i('Sugar (optional)', '30', 'ml'), i('Coffee', '2', 'shot'), i('Water', '', ''), i('Ice', '', '')],
        large: [i('Lime juice', '45', 'ml'), i('Sugar (optional)', '45', 'ml'), i('Coffee', '2', 'shot'), i('Water', '', ''), i('Ice', '', '')],
    },
    {
        // Card gives one spec for both Americano sizes and no amounts for water.
        base: 'Iced Americano', description: ICE_NOTE,
        regular: [i('Coffee', '2', 'shot'), i('Water', '', ''), i('Ice', '', '')],
        large: [i('Coffee', '2', 'shot'), i('Water', '', ''), i('Ice', '', '')],
    },
    {
        // Not in the seed menu -> created fresh (no placeholder to remove).
        base: 'Cold Coffee', description: COLD_NOTE,
        regular: [i('Coffee', '1', 'shot'), i('Sugar', '30', 'ml'), i('Vanilla ice cream', '2', 'scoop'), i('Milk', '100', 'ml')],
        large: [i('Coffee', '2', 'shot'), i('Sugar', '45', 'ml'), i('Vanilla ice cream', '3', 'scoop'), i('Milk', '200', 'ml')],
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
                createdBy: 'coffee-import',
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
