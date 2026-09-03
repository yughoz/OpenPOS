/**
 * Setup PocketBase untuk Azkasir.
 *
 * Membuat semua collections, index, API rules, dan (kalau belum ada user)
 * satu akun admin awal. Idempotent — aman dijalankan berulang.
 *
 * Pakai:
 *   bun scripts/setup-pocketbase.ts
 *
 * Env (.env):
 *   POCKETBASE_URL          default http://127.0.0.1:8094
 *   PB_SUPERUSER_EMAIL
 *   PB_SUPERUSER_PASSWORD
 *   SEED_ADMIN_EMAIL        default admin@openpos.local
 *   SEED_ADMIN_PASSWORD     default azkasir123
 */
import PocketBase from 'pocketbase';

const PB_URL = process.env.POCKETBASE_URL ?? 'http://127.0.0.1:8094';
const EMAIL = process.env.PB_SUPERUSER_EMAIL;
const PASSWORD = process.env.PB_SUPERUSER_PASSWORD;

if (!EMAIL || !PASSWORD) {
	console.error('✗ PB_SUPERUSER_EMAIL dan PB_SUPERUSER_PASSWORD wajib diset di .env');
	process.exit(1);
}

const pb = new PocketBase(PB_URL);
try {
	await pb.collection('_superusers').authWithPassword(EMAIL, PASSWORD);
} catch {
	console.error(`✗ Gagal login superuser ke ${PB_URL}. Pastikan PocketBase jalan dan kredensial benar.`);
	process.exit(1);
}
console.log(`✓ Terhubung ke PocketBase: ${PB_URL}`);

const AUTH_ONLY = '@request.auth.id != ""';

type Field = Record<string, unknown>;
interface ColDef {
	name: string;
	fields: Field[];
	indexes?: string[];
	listRule?: string | null;
	viewRule?: string | null;
	createRule?: string | null;
	updateRule?: string | null;
	deleteRule?: string | null;
}

/** Semua rule null = hanya superuser (server) yang boleh tulis/hapus. */
function serverOnly(extra: Partial<ColDef> = {}): Partial<ColDef> {
	return {
		listRule: AUTH_ONLY,
		viewRule: AUTH_ONLY,
		createRule: null,
		updateRule: null,
		deleteRule: null,
		...extra
	};
}

const defs: ColDef[] = [
	{
		name: 'product_categories',
		fields: [{ name: 'name', type: 'text', required: true }],
		...serverOnly()
	},
	{
		name: 'product_units',
		fields: [{ name: 'name', type: 'text', required: true }],
		...serverOnly()
	},
	{
		name: 'products',
		fields: [
			{ name: 'category', type: 'relation', collectionId: '', maxSelect: 1 },
			{ name: 'unit', type: 'relation', collectionId: '', maxSelect: 1 },
			{ name: 'barcode', type: 'text' },
			{ name: 'name', type: 'text', required: true },
			{ name: 'sell_price', type: 'number' },
			{ name: 'cost_price', type: 'number' },
			{ name: 'wholesale_price', type: 'number' },
			{ name: 'stock', type: 'number' },
			{ name: 'min_stock', type: 'number' },
			{ name: 'photo', type: 'file', maxSelect: 1 },
			{ name: 'description', type: 'text' },
			{ name: 'deleted', type: 'bool' }
		],
		indexes: ['CREATE UNIQUE INDEX IF NOT EXISTS idx_products_barcode ON products (barcode)'],
		...serverOnly()
	},
	{
		name: 'customers',
		fields: [
			{ name: 'name', type: 'text', required: true },
			{ name: 'gender', type: 'text' },
			{ name: 'address', type: 'text' },
			{ name: 'phone', type: 'text' }
		],
		...serverOnly()
	},
	{
		name: 'customer_prices',
		fields: [
			{ name: 'customer', type: 'relation', collectionId: '', required: true, cascadeDelete: true, maxSelect: 1 },
			{ name: 'product', type: 'relation', collectionId: '', required: true, cascadeDelete: true, maxSelect: 1 },
			{ name: 'price', type: 'number', required: true }
		],
		indexes: [
			'CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_price ON customer_prices (customer, product)'
		],
		...serverOnly()
	},
	{
		name: 'suppliers',
		fields: [
			{ name: 'name', type: 'text', required: true },
			{ name: 'address', type: 'text' },
			{ name: 'phone', type: 'text' },
			{ name: 'description', type: 'text' }
		],
		...serverOnly()
	},
	{
		name: 'transactions',
		fields: [
			{ name: 'code', type: 'text' },
			{ name: 'user', type: 'relation', collectionId: '', maxSelect: 1 },
			{ name: 'customer', type: 'relation', collectionId: '', maxSelect: 1 },
			{ name: 'outlet', type: 'relation', collectionId: '', maxSelect: 1 },
			{ name: 'transaction_date', type: 'date', required: true },
			{ name: 'total_gross', type: 'number' },
			{ name: 'total_discount', type: 'number' },
			{ name: 'total_final', type: 'number' },
			{ name: 'paid_amount', type: 'number' },
			{ name: 'change_amount', type: 'number' },
			{ name: 'payment_method', type: 'select', values: ['cash', 'qris', 'debit', 'ewallet'], maxSelect: 1 },
			{ name: 'payment_reference', type: 'text' },
			{ name: 'status', type: 'select', values: ['completed', 'voided', 'pending'], required: true, maxSelect: 1 },
			{ name: 'note', type: 'text' }
		],
		indexes: ['CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_code ON transactions (code)'],
		...serverOnly()
	},
	{
		name: 'transaction_items',
		fields: [
			{ name: 'transaction', type: 'relation', collectionId: '', required: true, cascadeDelete: true, maxSelect: 1 },
			{ name: 'product', type: 'relation', collectionId: '', maxSelect: 1 },
			{ name: 'product_name', type: 'text' },
			{ name: 'qty', type: 'number' },
			{ name: 'sell_price', type: 'number' },
			{ name: 'cost_price', type: 'number' },
			{ name: 'discount', type: 'number' },
			{ name: 'final_price', type: 'number' }
		],
		...serverOnly()
	},
	{
		name: 'stock_movements',
		fields: [
			{ name: 'product', type: 'relation', collectionId: '', required: true, maxSelect: 1 },
			{ name: 'transaction', type: 'relation', collectionId: '', cascadeDelete: true, maxSelect: 1 },
			{ name: 'user', type: 'relation', collectionId: '', maxSelect: 1 },
			{ name: 'supplier', type: 'relation', collectionId: '', maxSelect: 1 },
			{ name: 'moved_at', type: 'date', required: true },
			{
				name: 'type',
				type: 'select',
				values: ['in', 'out', 'sale', 'sale_void', 'adjustment'],
				required: true,
				maxSelect: 1
			},
			{ name: 'reference', type: 'text' },
			{ name: 'qty', type: 'number' },
			{ name: 'note', type: 'text' }
		],
		...serverOnly()
	},
	{
		name: 'settings',
		fields: [
			{ name: 'key', type: 'text', required: true },
			{ name: 'value', type: 'text' }
		],
		indexes: ['CREATE UNIQUE INDEX IF NOT EXISTS idx_settings_key ON settings (key)'],
		...serverOnly()
	},
	{
		name: 'audit_logs',
		fields: [
			{ name: 'user', type: 'relation', collectionId: '', maxSelect: 1 },
			{ name: 'action', type: 'text', required: true },
			{ name: 'collection', type: 'text', required: true },
			{ name: 'record_id', type: 'text' },
			{ name: 'old_data', type: 'json' },
			{ name: 'new_data', type: 'json' }
		],
		// Audit hanya bisa dibaca lewat server (superuser) — paling ketat.
		...serverOnly({ listRule: null, viewRule: null })
	},
	{
		name: 'debts',
		fields: [
			{ name: 'customer', type: 'relation', collectionId: '', required: true, maxSelect: 1 },
			{ name: 'transaction', type: 'relation', collectionId: '', maxSelect: 1 },
			{ name: 'total', type: 'number', required: true },
			{ name: 'paid', type: 'number' },
			{ name: 'status', type: 'select', values: ['unpaid', 'partial', 'paid'], required: true, maxSelect: 1 },
			{ name: 'note', type: 'text' }
		],
		...serverOnly()
	},
	{
		name: 'debt_payments',
		fields: [
			{ name: 'debt', type: 'relation', collectionId: '', required: true, cascadeDelete: true, maxSelect: 1 },
			{ name: 'amount', type: 'number', required: true },
			{ name: 'method', type: 'select', values: ['cash', 'qris', 'debit', 'ewallet'], maxSelect: 1 },
			{ name: 'user', type: 'relation', collectionId: '', maxSelect: 1 },
			{ name: 'note', type: 'text' }
		],
		...serverOnly()
	},
	{
		name: 'outlets',
		fields: [
			{ name: 'name', type: 'text', required: true },
			{ name: 'address', type: 'text' },
			{ name: 'phone', type: 'text' }
		],
		...serverOnly()
	}
];

/**
 * Field autodate created/updated — collections yang dibuat via API tidak
 * mendapatkannya otomatis (beda dengan yang dibuat lewat Admin UI).
 */
const AUTODATE_FIELDS: Field[] = [
	{ name: 'created', type: 'autodate', onCreate: true },
	{ name: 'updated', type: 'autodate', onCreate: true, onUpdate: true }
];

for (const def of defs) {
	def.fields.push(...AUTODATE_FIELDS);
}

/** Urutan dibuat: yang jadi target relation dulu. */
const ORDER = [
	'product_categories',
	'product_units',
	'products',
	'customers',
	'suppliers',
	'outlets',
	'debts',
	'debt_payments',
	'customer_prices',
	'transactions',
	'transaction_items',
	'stock_movements',
	'settings',
	'audit_logs'
];

const collectionIds = new Map<string, string>();

async function getCollectionId(name: string): Promise<string> {
	if (collectionIds.has(name)) return collectionIds.get(name)!;
	const existing = await pb.collections.getOne(name);
	collectionIds.set(name, existing.id);
	return existing.id;
}

for (const name of ORDER) {
	const def = defs.find((d) => d.name === name)!;

	// Isi collectionId untuk semua field relation
	for (const field of def.fields) {
		if (field.type === 'relation' && !field.collectionId) {
			const target = String(field['collectionName'] ?? inferRelationTarget(def.name, String(field.name)));
			field.collectionId = await getCollectionId(target);
		}
	}

	let existing = null;
	try {
		existing = await pb.collections.getOne(name);
	} catch {
		/* belum ada */
	}

	if (existing) {
		// Tambahkan field yang belum ada (jangan hapus yang sudah ada).
		const existingNames = new Set(existing.fields.map((f: Field) => f.name));
		const missing = def.fields.filter((f) => !existingNames.has(String(f.name)));
		const needsIndex = (def.indexes ?? []).some((idx) => !(existing.indexes ?? []).includes(idx));
		if (missing.length > 0 || needsIndex) {
			await pb.collections.update(existing.id, {
				fields: [...existing.fields, ...missing],
				indexes: Array.from(new Set([...(existing.indexes ?? []), ...(def.indexes ?? [])]))
			});
			console.log(`↑ Diperbarui: ${name} (+${missing.length} field)`);
		} else {
			console.log(`= Sudah ada: ${name}`);
		}
		collectionIds.set(name, existing.id);
	} else {
		const created = await pb.collections.create({ ...def, type: 'base' });
		collectionIds.set(name, created.id);
		console.log(`+ Dibuat: ${name}`);
	}
}

function inferRelationTarget(collection: string, field: string): string {
	// mapping relation field → collection target
	const map: Record<string, Record<string, string>> = {
		products: { category: 'product_categories', unit: 'product_units' },
		customer_prices: { customer: 'customers', product: 'products' },
		transactions: { user: 'users', customer: 'customers', outlet: 'outlets' },
		debts: { customer: 'customers', transaction: 'transactions' },
		debt_payments: { debt: 'debts', user: 'users' },
		transaction_items: { transaction: 'transactions', product: 'products' },
		stock_movements: {
			product: 'products',
			transaction: 'transactions',
			user: 'users',
			supplier: 'suppliers'
		},
		audit_logs: { user: 'users' }
	};
	return map[collection]?.[field] ?? field;
}

// ---- Collection users: tambah role + is_active, kunci rule update ----
{
	const users = await pb.collections.getOne('users');
	const existingNames = new Set(users.fields.map((f: Field) => f.name));
	const additions: Field[] = [];
	if (!existingNames.has('role')) {
		additions.push({ name: 'role', type: 'select', values: ['admin', 'kasir'], maxSelect: 1 });
	}
	if (!existingNames.has('is_active')) {
		additions.push({ name: 'is_active', type: 'bool' });
	}
	if (additions.length > 0) {
		await pb.collections.update(users.id, { fields: [...users.fields, ...additions] });
		console.log(`↑ users: +role, +is_active`);
	} else {
		console.log(`= users: field role & is_active sudah ada`);
	}

	// User tidak boleh mengubah role/is_active sendiri lewat API biasa.
	await pb.collections.update(users.id, {
		updateRule: 'id = @request.auth.id && @request.body.role:isset = false && @request.body.is_active:isset = false'
	});
	console.log(`↑ users: updateRule dikunci (role & is_active hanya via server)`);
}

// ---- Seed akun admin pertama kalau belum ada user ----
{
	const users = await pb.collection('users').getList(1, 1, { requestKey: null });
	if (users.totalItems === 0) {
		const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@openpos.local';
		const password = process.env.SEED_ADMIN_PASSWORD ?? 'azkasir123';
		await pb.collection('users').create({
			email,
			password,
			passwordConfirm: password,
			name: 'Administrator',
			role: 'admin',
			is_active: true
		});
		console.log(`+ Akun admin dibuat: ${email} / ${password}  (segera ganti password!)`);
	} else {
		console.log(`= User sudah ada (${users.totalItems}+), skip seed`);
	}
}

console.log('\n✓ Setup PocketBase selesai.');
