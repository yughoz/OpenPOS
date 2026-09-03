import { pbAdmin, pbForUser } from '$lib/server/pb';
import { logAudit } from '$lib/server/audit';
import { getSetting } from '$lib/server/settings';
import { randomCode, pbEscape, plainRecord } from '$lib/server/crud';
import type { AuthUser } from '$lib/server/auth';

export class PosError extends Error {}

export interface CartItem {
	id: string;
	product: string;
	product_name: string;
	qty: number;
	sell_price: number;
	cost_price: number;
	discount: number;
	final_price: number;
	stock: number; // saldo stok saat ini (untuk warning UI)
}

export interface CartSnapshot {
	id: string;
	code: string;
	customer: string;
	total_discount: number;
	total_gross: number;
	total_final: number;
	items: CartItem[];
}

type TxRecord = {
	id: string;
	code: string;
	customer: string;
	total_discount: number;
	total_gross: number;
	total_final: number;
	status: string;
};

/** Kode nota unik: {prefix_nota}{YYMMDD}{random6}. */
export async function generateNotaCode(token: string | null, admin?: Awaited<ReturnType<typeof pbAdmin>>): Promise<string> {
	const pb = admin ?? (await pbAdmin());
	const prefix = (await getSetting(token, 'prefix_nota', 'AZPJ')).toUpperCase() || 'AZPJ';
	const now = new Date();
	const stamp = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
	for (let i = 0; i < 10; i++) {
		const code = `${prefix}${stamp}${randomCode(6)}`;
		const found = await pb.collection('transactions').getList(1, 1, {
			filter: `code = "${pbEscape(code)}"`
		});
		if (found.totalItems === 0) return code;
	}
	throw new PosError('Gagal membuat kode nota, coba lagi.');
}

/** Muat transaksi pending + items-nya sebagai snapshot keranjang. */
async function loadCart(pb: ReturnType<typeof pbForUser>, txId: string): Promise<CartSnapshot | null> {
	const tx = (await pb.collection('transactions').getOne(txId).catch(() => null)) as TxRecord | null;
	if (!tx || tx.status !== 'pending') return null;
	const rows = await pb.collection('transaction_items').getFullList({
		filter: `transaction = "${pbEscape(txId)}"`,
		expand: 'product',
		sort: 'created'
	});
	const items: CartItem[] = rows.map((r: any) => ({
		id: r.id,
		product: r.product ?? '',
		product_name: r.product_name ?? r.expand?.product?.name ?? '',
		qty: r.qty ?? 0,
		sell_price: r.sell_price ?? 0,
		cost_price: r.cost_price ?? 0,
		discount: r.discount ?? 0,
		final_price: r.final_price ?? 0,
		stock: r.expand?.product?.stock ?? 0
	}));
	const totalGross = items.reduce((s, i) => s + i.final_price, 0);
	return plainRecord({
		id: tx.id,
		code: tx.code ?? '',
		customer: tx.customer ?? '',
		total_discount: tx.total_discount ?? 0,
		total_gross: totalGross,
		total_final: Math.max(0, totalGross - (tx.total_discount ?? 0)),
		items
	}) as CartSnapshot;
}

/**
 * Keranjang aktif kasir = transaksi pending milik user ini.
 * `explicitId` dipakai layar untuk memilih keranjang tertentu ('none' = kosong).
 */
export async function getCurrentCart(token: string | null, user: AuthUser, explicitId?: string): Promise<CartSnapshot | null> {
	const pb = pbForUser(token);
	if (explicitId) {
		if (explicitId === 'none') return null;
		return loadCart(pb, explicitId);
	}
	const latest = await pb.collection('transactions').getList(1, 1, {
		filter: `status = "pending" && user = "${user.id}"`,
		sort: '-updated'
	});
	if (latest.items.length === 0) return null;
	return loadCart(pb, latest.items[0].id);
}

/** Daftar transaksi pending milik user (untuk daftar "held"). */
export async function listHeldCarts(token: string | null, user: AuthUser, excludeId?: string): Promise<Array<{ id: string; code: string; items_count: number; total_final: number }>> {
	const pb = pbForUser(token);
	const pending = await pb.collection('transactions').getFullList({
		filter: `status = "pending" && user = "${user.id}"`,
		sort: '-updated'
	});
	const result: Array<{ id: string; code: string; items_count: number; total_final: number }> = [];
	for (const tx of pending as any[]) {
		if (excludeId && tx.id === excludeId) continue;
		const count = await pb.collection('transaction_items').getList(1, 1, {
			filter: `transaction = "${tx.id}"`
		});
		result.push({ id: tx.id, code: tx.code ?? '', items_count: count.totalItems, total_final: tx.total_final ?? 0 });
	}
	return result;
}

/** Hitung ulang total keranjang dari items dan simpan ke transaksi. */
async function recomputeCart(admin: Awaited<ReturnType<typeof pbAdmin>>, txId: string): Promise<void> {
	const items = await admin.collection('transaction_items').getFullList({
		filter: `transaction = "${pbEscape(txId)}"`
	});
	const gross = items.reduce((s: number, i: any) => s + (i.final_price ?? 0), 0);
	const tx = await admin.collection('transactions').getOne(txId);
	const discount = Math.min(Math.max(0, tx.total_discount ?? 0), gross);
	await admin.collection('transactions').update(txId, {
		total_gross: gross,
		total_final: Math.max(0, gross - discount)
	});
}

/** Transaksi pending milik user ini — ambil yang terbaru, atau buat baru. */
async function getOrCreateTx(
	token: string | null,
	admin: Awaited<ReturnType<typeof pbAdmin>>,
	user: AuthUser,
	forceNew = false
): Promise<{ tx: TxRecord & { id: string }; createdNew: boolean }> {
	const pb = pbForUser(token);
	if (!forceNew) {
		const latest = await pb.collection('transactions').getList(1, 1, {
			filter: `status = "pending" && user = "${user.id}"`,
			sort: '-updated'
		});
		if (latest.items.length > 0) return { tx: latest.items[0] as any, createdNew: false };
	}

	const created = await admin.collection('transactions').create({
		code: await generateNotaCode(token, admin),
		user: user.id,
		transaction_date: new Date().toISOString(),
		status: 'pending',
		total_gross: 0,
		total_discount: 0,
		total_final: 0
	});
	await logAudit(admin, {
		userId: user.id,
		action: 'create',
		collection: 'transactions',
		recordId: created.id,
		newData: { code: created.code, status: 'pending' }
	});
	return { tx: created as any, createdNew: true };
}

/** Resolve produk dari barcode → id → nama persis → nama mengandung (kalau unik). */
async function resolveProduct(admin: Awaited<ReturnType<typeof pbAdmin>>, term: string) {
	const t = term.trim();
	if (!t) return null;
	const queries = [`barcode = "${pbEscape(t)}"`, `id = "${pbEscape(t)}"`, `name = "${pbEscape(t)}"`];
	for (const q of queries) {
		const found = await admin.collection('products').getList(1, 1, { filter: `${q} && deleted != true` });
		if (found.items.length > 0) return found.items[0];
	}
	const fuzzy = await admin.collection('products').getList(1, 5, { filter: `name ~ "${pbEscape(t)}" && deleted != true` });
	if (fuzzy.items.length === 1) return fuzzy.items[0];
	if (fuzzy.items.length > 1) {
		throw new PosError(`"${t}" cocok dengan ${fuzzy.items.length} produk, sebutkan lebih spesifik: ${fuzzy.items.map((p: any) => p.name).slice(0, 3).join(', ')}`);
	}
	return null;
}

/** Harga efektif: grosir (kalau ada) > harga khusus customer > harga retail. */
async function effectivePrice(
	admin: Awaited<ReturnType<typeof pbAdmin>>,
	product: any,
	tx: TxRecord | null,
	priceMode: 'retail' | 'wholesale'
): Promise<number> {
	if (priceMode === 'wholesale' && (product.wholesale_price ?? 0) > 0) return product.wholesale_price;
	if (tx?.customer) {
		const cp = await admin.collection('customer_prices').getList(1, 1, {
			filter: `customer = "${tx.customer}" && product = "${product.id}"`
		});
		if (cp.items.length > 0 && (cp.items[0].price ?? 0) > 0) return cp.items[0].price;
	}
	return product.sell_price ?? 0;
}

export interface AddItemInput {
	term: string; // barcode / nama / id produk
	qty?: number;
	priceMode?: 'retail' | 'wholesale';
	txId?: string; // id keranjang yang dibuka; 'new' = paksa keranjang baru; kosong = pending terbaru / buat baru
}

export async function addItem(
	token: string | null,
	user: AuthUser,
	input: AddItemInput
): Promise<{ cart: CartSnapshot; createdNew: boolean }> {
	const admin = await pbAdmin();
	const product = await resolveProduct(admin, input.term ?? '');
	if (!product) throw new PosError('Produk tidak ditemukan. Cek barcode/nama.');

	const qty = Math.max(1, Math.floor(input.qty ?? 1));
	const priceMode = input.priceMode === 'wholesale' ? 'wholesale' : 'retail';

	// keranjang target: yang dipilih user (?tx=...), kalau tidak ada → pending terbaru / buat baru
	let tx: any = null;
	let createdNew = false;
	if (input.txId && input.txId !== 'new') {
		tx = await admin.collection('transactions').getOne(input.txId).catch(() => null);
		if (!tx || tx.status !== 'pending') tx = null;
	}
	if (!tx) {
		const r = await getOrCreateTx(token, admin, user, input.txId === 'new');
		tx = r.tx;
		createdNew = r.createdNew;
	}

	const price = await effectivePrice(admin, product, tx, priceMode);
	if (price <= 0) throw new PosError(`Harga jual "${product.name}" belum diatur.`);

	const existing = await admin.collection('transaction_items').getList(1, 1, {
		filter: `transaction = "${tx.id}" && product = "${product.id}"`
	});

	if (existing.items.length > 0) {
		const item = existing.items[0];
		const newQty = (item.qty ?? 0) + qty;
		await admin.collection('transaction_items').update(item.id, {
			qty: newQty,
			sell_price: price,
			final_price: price * newQty - (item.discount ?? 0)
		});
	} else {
		await admin.collection('transaction_items').create({
			transaction: tx.id,
			product: product.id,
			product_name: product.name,
			qty,
			sell_price: price,
			cost_price: product.cost_price ?? 0, // snapshot harga modal (PRD F5.8)
			discount: 0,
			final_price: price * qty
		});
	}

	await recomputeCart(admin, tx.id);
	const cart = await getCurrentCart(token, user, tx.id);
	if (!cart) throw new PosError('Keranjang tidak ditemukan.');
	return { cart, createdNew };
}

export interface UpdateItemInput {
	item_id: string;
	qty?: number;
	sell_price?: number;
	discount?: number;
}

export async function updateItem(token: string | null, user: AuthUser, input: UpdateItemInput): Promise<CartSnapshot> {
	const admin = await pbAdmin();
	const item = await admin.collection('transaction_items').getOne(input.item_id).catch(() => null);
	if (!item) throw new PosError('Item tidak ditemukan.');
	const tx = await admin.collection('transactions').getOne(item.transaction);
	if (tx.status !== 'pending') throw new PosError('Transaksi sudah selesai.');

	const qty = Math.max(1, Math.floor(input.qty ?? item.qty));
	const price = Math.max(0, Math.floor(input.sell_price ?? item.sell_price));
	const discount = Math.max(0, Math.floor(input.discount ?? item.discount ?? 0));

	await admin.collection('transaction_items').update(item.id, {
		qty,
		sell_price: price,
		discount,
		final_price: Math.max(0, price * qty - discount)
	});
	await recomputeCart(admin, item.transaction);
	const cart = await getCurrentCart(token, user, item.transaction);
	if (!cart) throw new PosError('Keranjang tidak ditemukan.');
	return cart;
}

export async function removeItem(token: string | null, user: AuthUser, itemId: string): Promise<CartSnapshot | null> {
	const admin = await pbAdmin();
	const item = await admin.collection('transaction_items').getOne(itemId).catch(() => null);
	if (!item) throw new PosError('Item tidak ditemukan.');
	const txId = item.transaction;
	const tx = await admin.collection('transactions').getOne(txId);
	if (tx.status !== 'pending') throw new PosError('Transaksi sudah selesai.');

	await admin.collection('transaction_items').delete(itemId);
	await recomputeCart(admin, txId);
	return getCurrentCart(token, user, txId);
}

export async function setCustomer(token: string | null, user: AuthUser, txId: string, customerId: string): Promise<CartSnapshot> {
	const admin = await pbAdmin();
	const tx = await admin.collection('transactions').getOne(txId).catch(() => null);
	if (!tx || tx.status !== 'pending') throw new PosError('Keranjang tidak ditemukan.');

	await admin.collection('transactions').update(txId, { customer: customerId || undefined });
	// Harga khusus customer hanya berlaku untuk item yang ditambahkan setelahnya.
	return (await getCurrentCart(token, user, txId))!;
}

export async function setDiscount(token: string | null, user: AuthUser, txId: string, discount: number): Promise<CartSnapshot> {
	const admin = await pbAdmin();
	const tx = await admin.collection('transactions').getOne(txId).catch(() => null);
	if (!tx || tx.status !== 'pending') throw new PosError('Keranjang tidak ditemukan.');
	if (!Number.isFinite(discount) || discount < 0) throw new PosError('Diskon tidak valid.');

	const items = await admin.collection('transaction_items').getFullList({ filter: `transaction = "${pbEscape(txId)}"` });
	const gross = items.reduce((s: number, i: any) => s + (i.final_price ?? 0), 0);
	const value = Math.min(Math.floor(discount), gross);

	await admin.collection('transactions').update(txId, {
		total_discount: value,
		total_gross: gross,
		total_final: Math.max(0, gross - value)
	});
	return (await getCurrentCart(token, user, txId))!;
}

/** Batalkan keranjang pending (hapus transaksi; items ikut cascade). */
export async function voidCart(token: string | null, user: AuthUser, txId: string): Promise<void> {
	const admin = await pbAdmin();
	const tx = await admin.collection('transactions').getOne(txId).catch(() => null);
	if (!tx) return;
	if (tx.status !== 'pending') throw new PosError('Transaksi sudah selesai, tidak bisa dibatalkan di sini.');
	if (tx.user !== user.id && user.role !== 'admin') throw new PosError('Bukan keranjang Anda.');
	await admin.collection('transactions').delete(txId);
	await logAudit(admin, {
		userId: user.id,
		action: 'void-cart',
		collection: 'transactions',
		recordId: txId,
		oldData: { code: tx.code, total_final: tx.total_final }
	});
}

export interface CheckoutInput {
	txId?: string;
	customerId?: string;
	paid: number;
	method: 'cash' | 'qris' | 'debit' | 'ewallet';
	reference?: string;
}

/** Checkout: validasi bayar → finalisasi transaksi → catat movement 'sale' + kurangi stok. */
export async function checkout(
	token: string | null,
	user: AuthUser,
	input: CheckoutInput
): Promise<{ id: string; code: string; change: number; debt: number; debtPaid: number }> {
	const admin = await pbAdmin();
	const cart = await getCurrentCart(token, user, input.txId);
	if (!cart) throw new PosError('Keranjang kosong.');
	if (cart.items.length === 0) throw new PosError('Keranjang masih kosong.');

	const total = cart.total_final; // nilai belanja setelah diskon

	// hutang berjalan customer → ikut ditagih: TOTAL BAYAR = belanja + hutang
	let outstanding = 0;
	let customerDebts: any[] = [];
	if (cart.customer) {
		customerDebts = (await admin.collection('debts').getFullList({
			filter: `customer = "${cart.customer}" && status != "paid"`,
			sort: 'created'
		})) as any[];
		outstanding = customerDebts.reduce(
			(s, d) => s + Math.max(0, (d.total ?? 0) - (d.paid ?? 0)),
			0
		);
	}

	const collectible = total + outstanding;
	const method = input.method;
	let paid: number;
	let change = 0;
	let debtNew = 0;      // hutang baru bila bayar kurang dari nilai belanja
	let debtPortion = 0;  // bagian bayar yang melunasi hutang lama (terlama dulu)

	if (method === 'cash') {
		paid = Math.floor(input.paid);
		if (!Number.isFinite(paid) || paid < 0) throw new PosError('Uang bayar tidak valid.');
		if (paid < total && !cart.customer) {
			throw new PosError(`Uang bayar kurang. Total ${total}, dibayar ${paid}. Pilih customer dulu agar sisanya tersimpan sebagai hutang.`);
		}
		debtPortion = Math.min(Math.max(0, paid - total), outstanding);
		change = Math.max(0, paid - total - debtPortion);
		debtNew = Math.max(0, total - paid);
	} else {
		paid = collectible; // non-tunai: belanja + hutang lama dilunasi pas
		change = 0;
		debtPortion = outstanding;
	}

	// 1) finalisasi transaksi
	const txUpdate: Record<string, unknown> = {
		status: 'completed',
		transaction_date: new Date().toISOString(),
		paid_amount: paid,
		change_amount: change,
		payment_method: method,
		payment_reference: input.reference?.trim() || undefined
	};
	if (input.customerId) txUpdate.customer = input.customerId;
	await admin.collection('transactions').update(cart.id, txUpdate);

	// 2) alokasi bayar: lunasi hutang lama customer (terlama dulu) + catat payment
	if (debtPortion > 0) {
		let remaining = debtPortion;
		for (const d of customerDebts) {
			if (remaining <= 0) break;
			const sisa = Math.max(0, (d.total ?? 0) - (d.paid ?? 0));
			if (sisa <= 0) continue;
			const pay = Math.min(remaining, sisa);
			await admin.collection('debt_payments').create({
				debt: d.id,
				amount: pay,
				method,
				user: user.id,
				note: `potong dari nota ${cart.code}`
			});
			await admin.collection('debts').update(d.id, {
				paid: (d.paid ?? 0) + pay,
				status: sisa - pay <= 0 ? 'paid' : 'partial'
			});
			remaining -= pay;
		}
	}

	// 3) hutang baru bila bayar kurang dari nilai belanja (wajib ada customer)
	if (debtNew > 0) {
		await admin.collection('debts').create({
			customer: cart.customer,
			transaction: cart.id,
			total: debtNew,
			paid: 0,
			status: 'unpaid',
			note: `sisa nota ${cart.code}`
		});
	}

	// 3) movement 'sale' + kurangi stok (boleh minus — kebijakan warning, PRD F4.5)
	for (const item of cart.items) {
		if (!item.product) continue;
		await admin.collection('stock_movements').create({
			product: item.product,
			transaction: cart.id,
			user: user.id,
			moved_at: new Date().toISOString(),
			type: 'sale',
			reference: cart.code,
			qty: item.qty,
			note: item.product_name
		});
		const product = await admin.collection('products').getOne(item.product).catch(() => null);
		if (product) {
			await admin.collection('products').update(item.product, { stock: (product.stock ?? 0) - item.qty });
		}
	}

	await logAudit(admin, {
		userId: user.id,
		action: 'checkout',
		collection: 'transactions',
		recordId: cart.id,
		newData: {
			code: cart.code,
			total_final: total,
			paid,
			change,
			method,
			debt_new: debtNew,
			debt_paid: debtPortion
		}
	});

	return { id: cart.id, code: cart.code, change, debt: debtNew, debtPaid: debtPortion };
}
