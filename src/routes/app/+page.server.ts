import { requireUser } from '$lib/server/guard';
import { listRecords } from '$lib/server/crud';
import { pbForUser } from '$lib/server/pb';

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
		const pb = pbForUser(locals.token);

		// ringkasan hari ini + grafik 14 hari (satu fetch)
		const txs = (await pb.collection('transactions').getFullList({
			filter: `status = "completed" && transaction_date >= "${dayKey(since14)} 00:00:00"`,
			sort: 'transaction_date'
		})) as any[];

		const perDay = new Map<string, number>();
		for (let i = 0; i < 14; i++) {
			perDay.set(dayKey(new Date(since14.getTime() + i * 86_400_000)), 0);
		}
		for (const tx of txs) {
			const key = String(tx.transaction_date ?? '').slice(0, 10);
			if (key === today) {
				salesToday += tx.total_final ?? 0;
				txCountToday++;
			}
			if (perDay.has(key)) perDay.set(key, (perDay.get(key) ?? 0) + (tx.total_final ?? 0));
		}
		salesByDay = Array.from(perDay.entries()).map(([key, value]) => ({
			label: key.slice(8, 10) + '/' + key.slice(5, 7),
			value
		}));

		// produk terlaris 30 hari (dari movement penjualan)
		const movs = (await pb.collection('stock_movements').getFullList({
			filter: `type = "sale" && moved_at >= "${dayKey(since30)} 00:00:00"`,
			expand: 'product'
		})) as any[];
		const qtyByProduct = new Map<string, { name: string; qty: number }>();
		for (const m of movs) {
			const pid = m.product;
			if (!pid) continue;
			const name = m.expand?.product?.name ?? 'Produk terhapus';
			const entry = qtyByProduct.get(pid) ?? { name, qty: 0 };
			entry.qty += m.qty ?? 0;
			qtyByProduct.set(pid, entry);
		}
		topProducts = Array.from(qtyByProduct.values()).sort((a, b) => b.qty - a.qty).slice(0, 5);

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
