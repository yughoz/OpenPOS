import { fail } from '@sveltejs/kit';
import { requireUser } from '$lib/server/guard';
import { pbErrorMessage } from '$lib/server/crud';
import { listDebts, payDebt, DebtError, type DebtRow } from '$lib/server/debts';

const PATH = '/app/debts';

export const load = async ({ locals, url }) => {
	requireUser(locals.user, PATH);

	const { items, totalItems } = await listDebts(locals.token, { sort: '-created', perPage: 200 });

	let totalPiutang = 0;
	const customerSet = new Set<string>();
	for (const d of items) {
		if (d.status !== 'paid') {
			totalPiutang += d.sisa;
			customerSet.add(d.customer);
		}
	}

	return {
		rows: items as DebtRow[],
		totalItems,
		summary: { totalPiutang, customerCount: customerSet.size }
	};
};

export const actions = {
	pay: async ({ request, locals }) => {
		const user = requireUser(locals.user, PATH);
		const form = await request.formData();
		const methodRaw = form.get('method')?.toString() ?? 'cash';
		try {
			await payDebt(locals.token, user, {
				debtId: form.get('debt_id')?.toString() ?? '',
				amount: Number(form.get('amount')?.toString() ?? '0'),
				method: (['cash', 'qris', 'debit', 'ewallet'].includes(methodRaw) ? methodRaw : 'cash') as
					| 'cash'
					| 'qris'
					| 'debit'
					| 'ewallet',
				note: form.get('note')?.toString() ?? ''
			});
		} catch (err) {
			if (err instanceof DebtError) return fail(400, { error: err.message });
			return fail(400, { error: pbErrorMessage(err) });
		}
		return { success: true };
	}
};
