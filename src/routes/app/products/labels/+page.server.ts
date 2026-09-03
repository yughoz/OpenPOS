import { error } from '@sveltejs/kit';
import { requireUser } from '$lib/server/guard';
import { pbForUser } from '$lib/server/pb';

export const load = async ({ locals, url }) => {
	requireUser(locals.user, '/app/products');
	const id = url.searchParams.get('id') ?? '';
	const copies = Math.min(100, Math.max(1, Number(url.searchParams.get('copies') ?? '24') || 24));

	const pb = pbForUser(locals.token);
	const product = await pb.collection('products').getOne(id).catch(() => null);
	if (!product || !product.barcode) error(404, 'Produk tidak ditemukan');

	return {
		copies,
		product: { id: product.id, name: product.name ?? '', barcode: product.barcode, price: product.sell_price ?? 0 }
	};
};
