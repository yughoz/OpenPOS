import { requireUser } from '$lib/server/guard';
import { pbForUser } from '$lib/server/pb';
import { csvCell } from '$lib/server/csv';

const HEADERS = ['barcode', 'nama', 'kategori', 'satuan', 'harga_jual', 'harga_modal', 'harga_grosir', 'min_stok', 'deskripsi', 'stok'];

/** Unduh seluruh produk aktif sebagai CSV. Kolom `stok` hanya informasi — impor tidak mengubah stok. */
export const GET = async ({ locals }) => {
	requireUser(locals.user, '/app/products');

	const pb = pbForUser(locals.token);
	const products = (await pb.collection('products').getFullList({
		filter: 'deleted != true',
		sort: 'name',
		expand: 'category,unit'
	})) as any[];

	const lines = [HEADERS.map(csvCell).join(';')];
	for (const p of products) {
		lines.push(
			[
				p.barcode ?? '',
				p.name ?? '',
				p.expand?.category?.name ?? '',
				p.expand?.unit?.name ?? '',
				p.sell_price ?? 0,
				p.cost_price ?? 0,
				p.wholesale_price ?? 0,
				p.min_stock ?? 0,
				p.description ?? '',
				p.stock ?? 0
			]
				.map(csvCell)
				.join(';')
		);
	}

	const date = new Date().toISOString().slice(0, 10);
	return new Response('\ufeff' + lines.join('\r\n'), {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': `attachment; filename="produk-${date}.csv"`
		}
	});
};
