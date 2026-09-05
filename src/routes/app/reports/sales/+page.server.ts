import { requireAdmin } from '$lib/server/guard';
import { pbAdmin } from '$lib/server/pb';
import { fetchDailySeries, fetchMethodTotals, fetchTopProducts, fetchTxSummary } from '$lib/server/transaction';

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

	// agregasi via endpoint hook /api/pos/tx-stats — satu SQL push-down per
	// mode, bukan getFullList seluruh transaksi + item satu periode
	const statsQuery = { from, to, kasir };
	const [summary, dailyRows, methodRows, topRows] = await Promise.all([
		fetchTxSummary(locals.token, statsQuery),
		fetchDailySeries(locals.token, statsQuery),
		fetchMethodTotals(locals.token, statsQuery),
		fetchTopProducts(locals.token, statsQuery, 10)
	]);

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
	for (const r of dailyRows) {
		const bucket = perDay.get(r.day) ?? { omzet: 0, modal: 0, count: 0 };
		bucket.omzet += r.omzet;
		bucket.modal += r.modal;
		bucket.count += r.tx_count;
		perDay.set(r.day, bucket);
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

	// produk terlaris dari endpoint agregat; nama = snapshot product_name di
	// transaction_items sehingga produk yang sudah terhapus tetap tampil
	const topProducts = topRows
		.map((r) => ({ name: r.product_name || '(tanpa nama)', qty: r.qty, omzet: r.omzet, laba: r.omzet - r.modal }))
		.slice(0, 10);

	// rincian per metode pembayaran (sudah terurut omzet desc dari endpoint)
	const methods = methodRows.map((r) => {
		const method = r.payment_method || 'lainnya';
		return { method, label: METHOD_LABEL[method] ?? method, count: r.tx_count, omzet: r.omzet };
	});

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
