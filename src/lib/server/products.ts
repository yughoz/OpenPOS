import { pbAdmin } from '$lib/server/pb';
import { logAudit } from '$lib/server/audit';
import { getSetting } from '$lib/server/settings';
import { randomCode, plainRecord, pbEscape, pbErrorMessage } from '$lib/server/crud';
import { parseCsv } from '$lib/server/csv';
import type { AuthUser } from '$lib/server/auth';

export interface ProductInput {
	name: string;
	barcode: string;
	category: string; // relation id atau ''
	unit: string;
	sell_price: number;
	cost_price: number;
	wholesale_price: number;
	description: string;
	min_stock?: number;
	initial_stock?: number; // hanya saat create; perubahan stok = modul Stok (fase 2)
}

export async function generateUniqueBarcode(token: string | null, admin?: Awaited<ReturnType<typeof pbAdmin>>): Promise<string> {
	const pb = admin ?? (await pbAdmin());
	const prefix = (await getSetting(token, 'prefix_barcode', 'AZT')).toUpperCase() || 'AZT';
	const now = new Date();
	const stamp = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
	for (let i = 0; i < 10; i++) {
		const code = `${prefix}${stamp}${randomCode(5)}`;
		const found = await pb.collection('products').getList(1, 1, {
			filter: `barcode = "${pbEscape(code)}"`
		});
		if (found.totalItems === 0) return code;
	}
	throw new Error('Gagal membuat barcode unik, coba lagi.');
}

/**
 * Buat produk baru + stok awal.
 * Stok awal dicatat sebagai stock_movements (type `adjustment`, note "stok awal")
 * supaya ledger stok konsisten sejak hari pertama. Sequence:
 * create produk (stock=0) → movement → update product.stock.
 */
export async function createProduct(token: string | null, user: AuthUser, input: ProductInput): Promise<Record<string, unknown>> {
	const admin = await pbAdmin();
	const barcode = input.barcode.trim() || (await generateUniqueBarcode(token, admin));

	const record = await admin.collection('products').create({
		name: input.name,
		barcode,
		category: input.category || undefined,
		unit: input.unit || undefined,
		sell_price: input.sell_price,
		cost_price: input.cost_price,
		wholesale_price: input.wholesale_price,
		stock: 0,
		min_stock: Math.max(0, Math.floor(input.min_stock ?? 0)),
		description: input.description
	});

	const initial = Math.max(0, Math.floor(input.initial_stock ?? 0));
	if (initial > 0) {
		await admin.collection('stock_movements').create({
			product: record.id,
			user: user.id,
			moved_at: new Date().toISOString(),
			type: 'adjustment',
			reference: 'stok-awal',
			qty: initial,
			note: 'stok awal'
		});
		await admin.collection('products').update(record.id, { stock: initial });
	}

	await logAudit(admin, {
		userId: user.id,
		action: 'create',
		collection: 'products',
		recordId: record.id,
		newData: plainRecord(record)
	});
	return plainRecord(record);
}

/** Update produk. Stok TIDAK boleh diubah lewat sini — harus lewat modul Stok. */
export async function updateProduct(token: string | null, user: AuthUser, id: string, input: ProductInput): Promise<Record<string, unknown>> {
	const admin = await pbAdmin();
	const old = await admin.collection('products').getOne(id);
	const record = await admin.collection('products').update(id, {
		name: input.name,
		barcode: input.barcode.trim(),
		category: input.category || undefined,
		unit: input.unit || undefined,
		sell_price: input.sell_price,
		cost_price: input.cost_price,
		wholesale_price: input.wholesale_price,
		min_stock: Math.max(0, Math.floor(input.min_stock ?? 0)),
		description: input.description
	});
	await logAudit(admin, {
		userId: user.id,
		action: 'update',
		collection: 'products',
		recordId: id,
		oldData: old ? plainRecord(old) : null,
		newData: plainRecord(record)
	});
	return plainRecord(record);
}

export interface ImportResult {
	created: number;
	updated: number;
	errors: string[];
}

const MAX_IMPORT_ROWS = 2000;
const MAX_IMPORT_ERRORS = 100;

// urutan kolom default = urutan kolom file ekspor (barcode;nama;kategori;…)
const DEFAULT_COLUMNS = ['barcode', 'name', 'category', 'unit', 'sell_price', 'cost_price', 'wholesale_price', 'min_stock', 'description', 'stock'];
const HEADER_ALIASES: Record<string, string> = {
	barcode: 'barcode',
	nama: 'name',
	name: 'name',
	kategori: 'category',
	category: 'category',
	satuan: 'unit',
	unit: 'unit',
	harga_jual: 'sell_price',
	sell_price: 'sell_price',
	harga_modal: 'cost_price',
	cost_price: 'cost_price',
	harga_grosir: 'wholesale_price',
	wholesale_price: 'wholesale_price',
	min_stok: 'min_stock',
	min_stock: 'min_stock',
	deskripsi: 'description',
	description: 'description',
	stok: 'stock',
	stock: 'stock'
};

function toInt(raw: string | undefined): number {
	const n = parseInt((raw ?? '').replace(/[^\d]/g, ''), 10);
	return Number.isNaN(n) ? 0 : n;
}

/**
 * Import produk dari teks CSV (upsert per barcode).
 * - Kolom `stok` diabaikan: perubahan stok harus lewat modul Stok agar ledger konsisten.
 * - Kategori/satuan dicocokkan per nama (case-insensitive); bila belum ada dibuat otomatis.
 * - Barcode kosong → auto-generate. Baris bermasalah dilompati & dilaporkan, impor lanjut.
 */
export async function importProducts(token: string | null, user: AuthUser, text: string): Promise<ImportResult> {
	const admin = await pbAdmin();
	const rows = parseCsv(text);

	// deteksi header; kalau baris pertama bukan header, pakai urutan kolom ekspor
	let columns = [...DEFAULT_COLUMNS];
	let hasHeader = false;
	let dataRows = rows;
	const first = (rows[0] ?? []).map((c) => c.trim().toLowerCase());
	if (first.includes('barcode') || first.includes('nama') || first.includes('name')) {
		hasHeader = true;
		columns = first.map((c) => HEADER_ALIASES[c] ?? '');
		dataRows = rows.slice(1);
	}

	const result: ImportResult = { created: 0, updated: 0, errors: [] };

	// preload kategori, satuan, dan peta barcode → produk (hemat query per baris)
	const catMap = new Map<string, string>();
	const unitMap = new Map<string, string>();
	const byBarcode = new Map<string, { id: string; deleted: boolean }>();
	const [cats, units, existing] = await Promise.all([
		admin.collection('product_categories').getFullList({ sort: 'name' }),
		admin.collection('product_units').getFullList({ sort: 'name' }),
		admin.collection('products').getFullList({ fields: 'id,barcode,deleted' })
	]);
	for (const c of cats as any[]) catMap.set(String(c.name ?? '').trim().toLowerCase(), c.id);
	for (const u of units as any[]) unitMap.set(String(u.name ?? '').trim().toLowerCase(), u.id);
	for (const p of existing as any[]) {
		if (p.barcode) byBarcode.set(p.barcode, { id: p.id, deleted: !!p.deleted });
	}

	const resolveRef = async (map: Map<string, string>, collection: string, name: string): Promise<string> => {
		const key = name.trim().toLowerCase();
		if (!key) return '';
		const found = map.get(key);
		if (found) return found;
		const rec = await admin.collection(collection).create({ name: name.trim() });
		map.set(key, rec.id);
		return rec.id;
	};

	for (let i = 0; i < dataRows.length; i++) {
		if (result.created + result.updated >= MAX_IMPORT_ROWS) {
			result.errors.push(`Dibatasi ${MAX_IMPORT_ROWS} baris per impor — sisanya dilewati.`);
			break;
		}
		const lineNo = hasHeader ? i + 2 : i + 1;
		const row = dataRows[i];
		const get = (field: string): string => {
			const idx = columns.indexOf(field);
			return idx >= 0 ? (row[idx] ?? '').trim() : '';
		};

		const name = get('name');
		if (!name) {
			result.errors.push(`Baris ${lineNo}: nama produk kosong`);
			continue;
		}
		const sell_price = toInt(get('sell_price'));
		if (sell_price <= 0) {
			result.errors.push(`Baris ${lineNo}: harga jual harus lebih dari 0`);
			continue;
		}

		try {
			const input: ProductInput = {
				name,
				barcode: get('barcode'),
				category: await resolveRef(catMap, 'product_categories', get('category')),
				unit: await resolveRef(unitMap, 'product_units', get('unit')),
				sell_price,
				cost_price: toInt(get('cost_price')),
				wholesale_price: toInt(get('wholesale_price')),
				min_stock: toInt(get('min_stock')),
				description: get('description'),
				initial_stock: 0
			};

			const known = input.barcode ? byBarcode.get(input.barcode) : undefined;
			if (known && !known.deleted) {
				await updateProduct(token, user, known.id, input);
				result.updated++;
			} else {
				const record = (await createProduct(token, user, input)) as { id: string; barcode: string };
				byBarcode.set(record.barcode, { id: record.id, deleted: false });
				result.created++;
			}
		} catch (err) {
			if (result.errors.length < MAX_IMPORT_ERRORS) {
				result.errors.push(`Baris ${lineNo}: ${pbErrorMessage(err)}`);
			}
		}
	}

	return result;
}

/** Parse & validasi form produk. Return { data } atau { error }. */export function parseProductForm(form: FormData, opts: { forCreate: boolean }): { data: ProductInput | null; error?: string } {
	const name = form.get('name')?.toString().trim() ?? '';
	if (!name) return { data: null, error: 'Nama produk wajib diisi' };

	const toInt = (key: string): number => {
		const raw = form.get(key)?.toString().trim() ?? '';
		const n = parseInt(raw.replace(/[^\d]/g, ''), 10);
		return Number.isNaN(n) ? 0 : n;
	};

	const sell_price = toInt('sell_price');
	if (sell_price <= 0) return { data: null, error: 'Harga jual harus lebih dari 0' };

	let initial_stock = 0;
	if (opts.forCreate) {
		const stockRaw = form.get('stock')?.toString().trim() ?? '';
		if (stockRaw) {
			initial_stock = parseInt(stockRaw.replace(/[^\d]/g, ''), 10);
			if (Number.isNaN(initial_stock) || initial_stock < 0) return { data: null, error: 'Stok awal tidak valid' };
		}
	}

	const min_stock = parseInt((form.get('min_stock')?.toString() ?? '').replace(/[^\d]/g, ''), 10);

	const rel = (key: string): string => {
		const v = form.get(key)?.toString() ?? '';
		return v === '__none__' ? '' : v;
	};

	return {
		data: {
			name,
			barcode: form.get('barcode')?.toString().trim() ?? '',
			category: rel('category'),
			unit: rel('unit'),
			sell_price,
			cost_price: toInt('cost_price'),
			wholesale_price: toInt('wholesale_price'),
			description: form.get('description')?.toString().trim() ?? '',
			min_stock: Number.isNaN(min_stock) ? 0 : min_stock,
			initial_stock
		}
	};
}
