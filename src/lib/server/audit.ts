import type PocketBase from 'pocketbase';

export interface AuditEntry {
	userId?: string;
	action: string; // create | update | delete | login | void | ...
	collection: string;
	recordId: string;
	oldData?: Record<string, unknown> | null;
	newData?: Record<string, unknown> | null;
}

/**
 * Tulis satu baris audit log. Dipanggil dari service layer setelah
 * operasi tulis yang penting (transaksi, produk, user, setting).
 * Tidak pernah melempar error — audit gagal tidak boleh menggagalkan transaksi utama.
 */
export async function logAudit(pb: PocketBase, entry: AuditEntry): Promise<void> {
	try {
		await pb.collection('audit_logs').create({
			user: entry.userId ?? null,
			action: entry.action,
			collection: entry.collection,
			record_id: entry.recordId,
			old_data: entry.oldData ? JSON.stringify(entry.oldData) : null,
			new_data: entry.newData ? JSON.stringify(entry.newData) : null
		});
	} catch (err) {
		console.error('[audit] gagal menulis audit log:', err);
	}
}
