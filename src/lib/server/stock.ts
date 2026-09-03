import { pbAdmin } from '$lib/server/pb';
import { logAudit } from '$lib/server/audit';
import { plainRecord } from '$lib/server/crud';
import type { AuthUser } from '$lib/server/auth';

/** Error validasi bisnis stok — ditangkap di page action dan ditampilkan ke user. */
export class StockError extends Error {}

export interface StockMoveInput {
	product_id: string;
	qty: number;
	supplier_id?: string;
	note?: string;
	reference?: string;
}

/**
 * Satu sumber kebenaran perubahan stok (PRD F4.3): setiap perubahan stok
 * HARUS lewat sini — bikin baris stock_movements lalu update products.stock.
 * Urutan: movement dulu, baru saldo. Kalau update saldo gagal, ledger tetap
 * mencatat kejadian dan bisa direkonsiliasi.
 *
 * NOTE: belum transaksional atomik (butuh PB batch). Untuk single-store
 * dengan operator sedikit ini cukup; checkout POS (fase 3) tetap wajib
 * melewati service ini supaya semua pergerakan tercatat.
 */

async function applyMovement(
	admin: Awaited<ReturnType<typeof pbAdmin>>,
	user: AuthUser,
	input: StockMoveInput,
	type: 'in' | 'out',
	prevStock: number
): Promise<Record<string, unknown>> {
	const qty = Math.floor(input.qty);
	const newStock = type === 'in' ? prevStock + qty : prevStock - qty;

	const movement = await admin.collection('stock_movements').create({
		product: input.product_id,
		user: user.id,
		supplier: input.supplier_id || undefined,
		moved_at: new Date().toISOString(),
		type,
		reference: input.reference ?? (type === 'in' ? 'stok-masuk' : 'stok-keluar'),
		qty,
		note: input.note?.trim() ?? ''
	});

	await admin.collection('products').update(input.product_id, { stock: newStock });

	await logAudit(admin, {
		userId: user.id,
		action: type === 'in' ? 'stock-in' : 'stock-out',
		collection: 'stock_movements',
		recordId: movement.id,
		newData: { product: input.product_id, qty, prevStock, newStock }
	});

	return plainRecord(movement);
}

/** Stok masuk (pembelian / retur). */
export async function stockIn(token: string | null, user: AuthUser, input: StockMoveInput): Promise<Record<string, unknown>> {
	const admin = await pbAdmin();

	const qty = Math.floor(input.qty);
	if (!input.product_id) throw new StockError('Produk wajib dipilih');
	if (!Number.isFinite(qty) || qty <= 0) throw new StockError('Qty harus lebih dari 0');

	const product = await admin.collection('products').getOne(input.product_id).catch(() => null);
	if (!product) throw new StockError('Produk tidak ditemukan');

	return applyMovement(admin, user, input, 'in', product.stock ?? 0);
}

/** Stok keluar (rusak / hilang / koreksi). Stok tidak boleh minus. */
export async function stockOut(token: string | null, user: AuthUser, input: StockMoveInput): Promise<Record<string, unknown>> {
	const admin = await pbAdmin();

	const qty = Math.floor(input.qty);
	if (!input.product_id) throw new StockError('Produk wajib dipilih');
	if (!Number.isFinite(qty) || qty <= 0) throw new StockError('Qty harus lebih dari 0');

	const product = await admin.collection('products').getOne(input.product_id).catch(() => null);
	if (!product) throw new StockError('Produk tidak ditemukan');

	const prevStock = product.stock ?? 0;
	if (prevStock - qty < 0) {
		throw new StockError(`Stok tidak cukup: sisa ${prevStock}, minta ${qty}`);
	}

	return applyMovement(admin, user, input, 'out', prevStock);
}
