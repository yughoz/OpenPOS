import { pbAdmin, pbForUser } from '$lib/server/pb';
import { logAudit } from '$lib/server/audit';
import { plainRecord, pbEscape } from '$lib/server/crud';
import type { AuthUser } from '$lib/server/auth';

export class DebtError extends Error {}

export interface DebtRow {
	id: string;
	customer: string;
	transaction: string;
	total: number;
	paid: number;
	status: string;
	note: string;
	created: string;
	expand?: {
		customer?: { name: string };
		transaction?: { code: string; transaction_date: string };
	};
}

/** Sisa hutang satu baris: total − terbayar. */
export function sisa(d: { total: number; paid: number }): number {
	return Math.max(0, (d.total ?? 0) - (d.paid ?? 0));
}

export interface PayDebtInput {
	debtId: string;
	amount: number;
	method: 'cash' | 'qris' | 'debit' | 'ewallet';
	note?: string;
}

/** Catat pelunasan (sebagian atau penuh) atas satu hutang. */
export async function payDebt(token: string | null, user: AuthUser, input: PayDebtInput): Promise<void> {
	const admin = await pbAdmin();
	const debt = await admin.collection('debts').getOne(input.debtId).catch(() => null);
	if (!debt) throw new DebtError('Hutang tidak ditemukan.');
	if (debt.status === 'paid') throw new DebtError('Hutang ini sudah lunas.');

	const amount = Math.floor(input.amount);
	if (!Number.isFinite(amount) || amount <= 0) throw new DebtError('Jumlah pembayaran harus lebih dari 0.');
	const remaining = (debt.total ?? 0) - (debt.paid ?? 0);
	if (amount > remaining) throw new DebtError(`Melebihi sisa hutang (sisa ${remaining}).`);

	await admin.collection('debt_payments').create({
		debt: debt.id,
		amount,
		method: input.method,
		note: input.note?.trim() ?? '',
		user: user.id
	});

	const newPaid = (debt.paid ?? 0) + amount;
	await admin.collection('debts').update(debt.id, {
		paid: newPaid,
		status: newPaid >= (debt.total ?? 0) ? 'paid' : 'partial'
	});

	await logAudit(admin, {
		userId: user.id,
		action: 'pay-debt',
		collection: 'debts',
		recordId: debt.id,
		oldData: { paid: debt.paid ?? 0 },
		newData: { paid: newPaid, amount, method: input.method }
	});
}

/** Daftar hutang beserta sisa per baris (untuk halaman hutang & POS). */
export async function listDebts(token: string | null, opts: { filter?: string; sort?: string; perPage?: number } = {}) {
	const pb = pbForUser(token);
	const result = await pb.collection('debts').getList(1, opts.perPage ?? 200, {
		filter: opts.filter,
		sort: opts.sort ?? '-created',
		expand: 'customer,transaction'
	});
	const rows = result.items.map((r: any) => {
		const row = plainRecord<DebtRow>(r);
		return { ...row, sisa: sisa(row) };
	});
	return { items: rows, totalItems: result.totalItems };
}
