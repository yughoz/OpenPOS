import { error } from '@sveltejs/kit';
import { requireUser } from '$lib/server/guard';
import { pbForUser } from '$lib/server/pb';
import { getSetting } from '$lib/server/settings';
import { plainRecord } from '$lib/server/crud';

export const load = async ({ locals, params, url }) => {
	const user = requireUser(locals.user, `/app/pos/receipt/${params.id}`);
	const print = url.searchParams.get('print') === '1';

	const pb = pbForUser(locals.token);
	const tx = await pb.collection('transactions').getOne(params.id, { expand: 'customer,user' }).catch(() => null);
	if (!tx) error(404, 'Nota tidak ditemukan');
	// kasir hanya boleh lihat nota miliknya; admin semua
	if (locals.user!.role !== 'admin' && tx.user !== user.id) {
		error(403, 'Bukan nota Anda');
	}

	const items = await pb.collection('transaction_items').getFullList({
		filter: `transaction = "${params.id}"`,
		sort: 'created'
	});

	const cashier = tx.expand?.user?.name ?? '';
	const [storeName, storeDesc, storePhone, receiptSize, receiptFooter] = await Promise.all([
		getSetting(locals.token, 'store_name', 'Toko OpenPOS'),
		getSetting(locals.token, 'store_description', ''),
		getSetting(locals.token, 'store_phone', ''),
		getSetting(locals.token, 'receipt_size', '80'),
		getSetting(locals.token, 'receipt_footer', '')
	]);

	return {
		print,
		store: { name: storeName, description: storeDesc, phone: storePhone },
		receiptSize: receiptSize === '58' ? 58 : 80,
		receiptFooter,
		tx: plainRecord(tx) as {
			id: string;
			code: string;
			transaction_date: string;
			total_gross: number;
			total_discount: number;
			total_final: number;
			paid_amount: number;
			change_amount: number;
			payment_method: string;
			status: string;
			expand?: { customer?: { name: string }; user?: { name: string } };
		},
		items: items.map((i: any) => plainRecord(i)) as Array<{
			id: string;
			product_name: string;
			qty: number;
			sell_price: number;
			discount: number;
			final_price: number;
		}>,
		cashier
	};
};
