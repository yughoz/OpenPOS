import { pbAdmin, pbForUser } from '$lib/server/pb';
import { logAudit } from '$lib/server/audit';
import { plainRecord, pbEscape } from '$lib/server/crud';
import type { AuthUser } from '$lib/server/auth';

export class TransactionError extends Error {}

/**
 * Void transaksi (admin, PRD F6.4): status → 'voided' (soft), stok
 * dikembalikan lewat movement 'sale_void', semua tercatat di audit log.
 */
export async function voidTransaction(token: string | null, user: AuthUser, txId: string): Promise<void> {
	const admin = await pbAdmin();
	const tx = await admin.collection('transactions').getOne(txId).catch(() => null);
	if (!tx) throw new TransactionError('Transaksi tidak ditemukan.');
	if (tx.status !== 'completed') throw new TransactionError('Hanya transaksi berstatus completed yang bisa dibatalkan.');

	const items = await admin.collection('transaction_items').getFullList({
		filter: `transaction = "${pbEscape(txId)}"`
	});

	await admin.collection('transactions').update(txId, { status: 'voided' });

	// nota berhutang di-void → hutangnya ikut terhapus
	const debts = await admin.collection('debts').getFullList({ filter: `transaction = "${txId}"` });
	for (const d of debts as any[]) {
		await admin.collection('debts').delete(d.id);
	}

	// kembalikan stok + catat movement sale_void
	for (const item of items as any[]) {
		if (!item.product) continue;
		await admin.collection('stock_movements').create({
			product: item.product,
			transaction: txId,
			user: user.id,
			moved_at: new Date().toISOString(),
			type: 'sale_void',
			reference: tx.code ?? '',
			qty: item.qty,
			note: `void nota ${tx.code ?? ''}`
		});
		const product = await admin.collection('products').getOne(item.product).catch(() => null);
		if (product) {
			await admin.collection('products').update(item.product, { stock: (product.stock ?? 0) + item.qty });
		}
	}

	await logAudit(admin, {
		userId: user.id,
		action: 'void-transaction',
		collection: 'transactions',
		recordId: txId,
		oldData: { code: tx.code, status: 'completed', total_final: tx.total_final },
		newData: { status: 'voided' }
	});
}

export interface TxFilter {
	from?: string; // YYYY-MM-DD
	to?: string; // YYYY-MM-DD
	customer?: string;
	kasir?: string; // user id (admin only)
}

export function buildTxFilter(filter: TxFilter, kasirScopeId?: string): string | undefined {
	const cond: string[] = ['status != "pending"'];
	if (/^\d{4}-\d{2}-\d{2}$/.test(filter.from ?? '')) cond.push(`transaction_date >= "${filter.from} 00:00:00"`);
	if (/^\d{4}-\d{2}-\d{2}$/.test(filter.to ?? '')) cond.push(`transaction_date <= "${filter.to} 23:59:59"`);
	if (filter.customer) cond.push(`customer = "${pbEscape(filter.customer)}"`);
	if (filter.kasir) cond.push(`user = "${pbEscape(filter.kasir)}"`);
	else if (kasirScopeId) cond.push(`user = "${pbEscape(kasirScopeId)}"`); // kasir hanya lihat miliknya
	return cond.length > 0 ? cond.join(' && ') : undefined;
}

export interface PeriodSummary {
	omzet: number; // sum total_final (completed saja)
	modal: number; // sum cost_price * qty dari item
	laba: number; // omzet - modal
	jumlahTransaksi: number;
}

/**
 * Ringkasan periode dari daftar transaksi yang sudah terfilter.
 * laba dihitung dari snapshot cost_price per item (PRD F5.8) sehingga
 * tidak berubah saat harga modal produk diedit di kemudian hari.
 */
export function summarize(
	transactions: Array<{ id: string; total_final: number; status: string }>,
	itemsByTx: Map<string, Array<{ qty: number; cost_price: number }>>
): PeriodSummary {
	let omzet = 0;
	let modal = 0;
	let jumlahTransaksi = 0;
	for (const tx of transactions) {
		if (tx.status !== 'completed') continue; // voided tidak dihitung
		jumlahTransaksi++;
		omzet += tx.total_final ?? 0;
		const items = itemsByTx.get(tx.id) ?? [];
		for (const item of items) {
			modal += (item.cost_price ?? 0) * (item.qty ?? 0);
		}
	}
	return { omzet, modal, laba: omzet - modal, jumlahTransaksi };
}

/** Ambil semua items untuk sekumpulan transaction id, dikelompokkan per tx. */
export async function fetchItemsByTx(
	token: string | null,
	txIds: string[]
): Promise<Map<string, Array<{ qty: number; cost_price: number }>>> {
	const map = new Map<string, Array<{ qty: number; cost_price: number }>>();
	if (txIds.length === 0) return map;
	const pb = pbForUser(token);
	for (const txId of txIds) {
		const items = await pb.collection('transaction_items').getFullList({
			filter: `transaction = "${pbEscape(txId)}"`
		});
		map.set(
			txId,
			(items as any[]).map((i) => ({ qty: i.qty ?? 0, cost_price: i.cost_price ?? 0 }))
		);
	}
	return map;
}

export interface ItemRow {
	id: string;
	product_name: string;
	qty: number;
	sell_price: number;
	cost_price: number;
	discount: number;
	final_price: number;
}

/** Semua item untuk banyak transaksi sekaligus (filter OR per chunk), dikelompokkan per tx. */
export async function fetchItemsGrouped(token: string | null, txIds: string[]): Promise<Map<string, ItemRow[]>> {
	const map = new Map<string, ItemRow[]>();
	if (txIds.length === 0) return map;
	const pb = pbForUser(token);
	const CHUNK = 100;
	for (let i = 0; i < txIds.length; i += CHUNK) {
		const chunk = txIds.slice(i, i + CHUNK);
		const filter = chunk.map((id) => `transaction = "${pbEscape(id)}"`).join(' || ');
		const items = await pb.collection('transaction_items').getFullList({ filter });
		for (const raw of items as any[]) {
			const list = map.get(raw.transaction) ?? [];
			list.push({
				id: raw.id,
				product_name: raw.product_name ?? '',
				qty: raw.qty ?? 0,
				sell_price: raw.sell_price ?? 0,
				cost_price: raw.cost_price ?? 0,
				discount: raw.discount ?? 0,
				final_price: raw.final_price ?? 0
			});
			map.set(raw.transaction, list);
		}
	}
	return map;
}
