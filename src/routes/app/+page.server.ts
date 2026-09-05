import { requireUser } from '$lib/server/guard';
import { listRecords } from '$lib/server/crud';
import { fetchDailySeries, fetchTopProducts } from '$lib/server/transaction';

const PATH = '/app';

function dayKey(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const load = async ({ locals, url }) => {
	requireUser(locals.user, PATH);

	const now = new Date();
	const today = dayKey(now);
	const since14 = new Date(now.getTime() - 13 * 86_400_000);
	const since30 = new Date(now.getTime() - 30 * 86_400_000);

	let salesToday = 0;
	let txCountToday = 0;
	let lowStockItems: Array<{ id: string; name: string; stock: number; min_stock: number }> = [];
	let salesByDay: Array<{ label: string; value: number }> = [];
	let topProducts: Array<{ name: string; qty: number }> = [];

	try {
		// agregasi via endpoint hook /api/pos/tx-stats (bukan getFullList)
		const [dailyRows, topRows] = await Promise.all([
			fetchDailySeries(locals.token, { from: dayKey(since14) }),
			fetchTopProducts(locals.token, { from: dayKey(since30) }, 5)
		]);

		// ringkasan hari ini + grafik 14 hari
		const perDay = new Map<string, number>();
		for (let i = 0; i < 14; i++) {
			perDay.set(dayKey(new Date(since14.getTime() + i * 86_400_000)), 0);
		}
		for (const r of dailyRows) {
			if (r.day === today) {
				salesToday += r.omzet;
				txCountToday += r.tx_count;
			}
			if (perDay.has(r.day)) perDay.set(r.day, (perDay.get(r.day) ?? 0) + r.omzet);
		}
		salesByDay = Array.from(perDay.entries()).map(([key, value]) => ({
			label: key.slice(8, 10) + '/' + key.slice(5, 7),
			value
		}));

		// produk terlaris 30 hari (sudah diagregasi di server, urut qty desc)
		topProducts = topRows.map((r) => ({ name: r.product_name || 'Produk terhapus', qty: r.qty }));

		const low = await listRecords<{ id: string; name: string; stock: number; min_stock: number }>(
			locals.token,
			'products',
			{
				filter: 'deleted != true && min_stock > 0 && stock <= min_stock',
				sort: 'stock',
				perPage: 8
			}
		);
		lowStockItems = low.items;
	} catch {
		// dashboard tidak boleh 500 kalau query ringkasan gagal
	}

	return {
		summary: { salesToday, txCountToday, lowStockCount: lowStockItems.length, lowStockItems },
		salesByDay,
		topProducts,
		today
	};
};
