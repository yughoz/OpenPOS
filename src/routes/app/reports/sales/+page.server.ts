import { requireAdmin } from '$lib/server/guard';
import { pbAdmin, pbForUser } from '$lib/server/pb';
import { buildTxFilter, summarize, fetchItemsGrouped } from '$lib/server/transaction';

const PATH = '/app/reports/sales';

function dayKey(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const METHOD_LABEL: Record<string, string> = { cash: 'Tunai', qris: 'QRIS', debit: 'Debit', ewallet: 'E-Wallet' };

export const load = async ({ locals, url }) => {
	requireAdmin(locals.user, PATH);

	// default periode: bulan berjalan s/d hari ini — batas atas wajib ada agar
	// deret harian punya rentang untuk diisi nol
	const now = new Date();
	let from = url.searchParams.get('from')?.toString() ?? '';
	let to = url.searchParams.get('to')?.toString() ?? '';
	if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
	if (!/^\d{4}-\d{2}-\d{2}$/.test(to)) to = dayKey(now);
	const kasir = url.searchParams.get('kasir')?.toString() ?? '';

	const pb = pbForUser(locals.token);
	const all = (await pb.collection('transactions').getFullList({
		filter: buildTxFilter({ from, to, kasir }),
		sort: 'transaction_date'
	})) as any[];

	const txs = all.map((t) => ({
		id: t.id as string,
		total_final: t.total_final ?? 0,
		status: t.status ?? '',
		payment_method: t.payment_method ?? '',
		date: String(t.transaction_date ?? '').slice(0, 10)
	}));
	const itemsByTx = await fetchItemsGrouped(locals.token, txs.map((t) => t.id));
	const summary = summarize(txs, itemsByTx);

	// modal per transaksi dari snapshot cost_price (PRD F5.8)
	const modalByTx = new Map<string, number>();
	for (const [txId, items] of itemsByTx) {
		modalByTx.set(txId, items.reduce((sum, it) => sum + (it.cost_price ?? 0) * (it.qty ?? 0), 0));
	}

	// deret harian: hari kosong diisi nol supaya bentuk grafik terbaca;
	// rentang > 366 hari tidak diisi nol (cukup hari yang ada transaksinya)
	const perDay = new Map<string, { omzet: number; modal: number; count: number }>();
	const start = new Date(`${from}T00:00:00`);
	const end = new Date(`${to}T00:00:00`);
	const spanDays = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
	if (spanDays > 0 && spanDays <= 366) {
		for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
			perDay.set(dayKey(d), { omzet: 0, modal: 0, count: 0 });
		}
	}
	for (const tx of txs) {
		if (tx.status !== 'completed') continue; // voided tidak dihitung
		const bucket = perDay.get(tx.date) ?? { omzet: 0, modal: 0, count: 0 };
		bucket.omzet += tx.total_final;
		bucket.modal += modalByTx.get(tx.id) ?? 0;
		bucket.count += 1;
		perDay.set(tx.date, bucket);
	}
	const daily = Array.from(perDay.entries())
		.sort(([a], [b]) => (a < b ? -1 : 1))
		.map(([tanggal, v]) => ({
			tanggal,
			label: tanggal.slice(8, 10) + '/' + tanggal.slice(5, 7),
			value: v.omzet,
			jumlahTransaksi: v.count,
			omzet: v.omzet,
			modal: v.modal,
			laba: v.omzet - v.modal
		}));

	// produk terlaris dari item transaksi selesai; nama = snapshot di transaction_items
	// sehingga produk yang sudah terhapus tetap tampil
	const byProduct = new Map<string, { name: string; qty: number; omzet: number; modal: number }>();
	for (const tx of txs) {
		if (tx.status !== 'completed') continue;
		for (const it of itemsByTx.get(tx.id) ?? []) {
			const key = it.product_name || '(tanpa nama)';
			const agg = byProduct.get(key) ?? { name: key, qty: 0, omzet: 0, modal: 0 };
			agg.qty += it.qty ?? 0;
			agg.omzet += it.final_price ?? 0;
			agg.modal += (it.cost_price ?? 0) * (it.qty ?? 0);
			byProduct.set(key, agg);
		}
	}
	const topProducts = Array.from(byProduct.values())
		.map((p) => ({ name: p.name, qty: p.qty, omzet: p.omzet, laba: p.omzet - p.modal }))
		.sort((a, b) => b.qty - a.qty)
		.slice(0, 10);

	// rincian per metode pembayaran
	const byMethod = new Map<string, { count: number; omzet: number }>();
	for (const tx of txs) {
		if (tx.status !== 'completed') continue;
		const key = tx.payment_method || 'lainnya';
		const agg = byMethod.get(key) ?? { count: 0, omzet: 0 };
		agg.count += 1;
		agg.omzet += tx.total_final;
		byMethod.set(key, agg);
	}
	const methods = Array.from(byMethod.entries())
		.map(([method, v]) => ({ method, label: METHOD_LABEL[method] ?? method, count: v.count, omzet: v.omzet }))
		.sort((a, b) => b.omzet - a.omzet);

	// opsi filter kasir (halaman ini khusus admin — butuh superuser untuk baca users)
	let kasirs: Array<{ id: string; name: string }> = [];
	try {
		const admin = await pbAdmin();
		const users = await admin.collection('users').getFullList({ filter: 'role = "kasir" || role = "admin"', sort: 'name' });
		kasirs = users.map((u: any) => ({ id: u.id, name: u.name || u.email }));
	} catch {
		kasirs = [];
	}

	return {
		summary,
		daily,
		topProducts,
		methods,
		filters: { from, to, kasir },
		kasirs
	};
};
