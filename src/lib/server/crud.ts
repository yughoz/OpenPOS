import { pbForUser, pbAdmin } from '$lib/server/pb';
import { logAudit } from '$lib/server/audit';
import type { AuthUser } from '$lib/server/auth';

/**
 * Service layer CRUD generik.
 * - Baca: jalan dengan token user (API rules PB tetap berlaku).
 * - Tulis: via superuser (validasi bisnis ada di service ini, audit log wajib).
 */

export interface ListOptions {
	page?: number;
	perPage?: number;
	filter?: string;
	sort?: string;
	expand?: string;
}

export async function listRecords<T = Record<string, unknown>>(
	token: string | null,
	collection: string,
	opts: ListOptions = {}
): Promise<{ items: T[]; totalItems: number; totalPages: number; page: number }> {
	const pb = pbForUser(token);
	const result = await pb.collection(collection).getList(opts.page ?? 1, opts.perPage ?? 20, {
		filter: opts.filter,
		sort: opts.sort ?? '-created',
		expand: opts.expand
	});
	return {
		items: result.items.map(plainRecord<T>),
		totalItems: result.totalItems,
		totalPages: result.totalPages,
		page: result.page
	};
}

/**
 * Ubah Record SDK jadi POJO aman untuk diserialisasi SvelteKit (devalue).
 * Record SDK menyimpan field mentah di getter `data` (== `response`).
 */
export function plainRecord<T = Record<string, unknown>>(rec: any): T {
	if (rec && typeof rec === 'object' && rec.data && typeof rec.data === 'object') {
		return JSON.parse(
			JSON.stringify({ id: rec.id, collectionId: rec.collectionId, collectionName: rec.collectionName, ...rec.data })
		) as T;
	}
	return JSON.parse(JSON.stringify(rec)) as T;
}

export interface WriteOptions {
	token: string | null;
	user: AuthUser;
	collection: string;
	data?: Record<string, unknown>;
	id?: string;
	actionLabel?: string;
}

export async function createRecord<T = Record<string, unknown>>(opts: WriteOptions): Promise<T> {
	const admin = await pbAdmin();
	const record = await admin.collection(opts.collection).create(opts.data);
	await logAudit(admin, {
		userId: opts.user.id,
		action: opts.actionLabel ?? 'create',
		collection: opts.collection,
		recordId: record.id,
		newData: plainRecord(record)
	});
	return plainRecord<T>(record);
}

export async function updateRecord<T = Record<string, unknown>>(opts: WriteOptions): Promise<T> {
	const admin = await pbAdmin();
	const old = await admin.collection(opts.collection).getOne(opts.id!);
	const record = await admin.collection(opts.collection).update(opts.id!, opts.data);
	await logAudit(admin, {
		userId: opts.user.id,
		action: opts.actionLabel ?? 'update',
		collection: opts.collection,
		recordId: opts.id!,
		oldData: old ? plainRecord(old) : null,
		newData: plainRecord(record)
	});
	return plainRecord<T>(record);
}

export async function deleteRecord(opts: WriteOptions): Promise<void> {
	const admin = await pbAdmin();
	const old = await admin.collection(opts.collection).getOne(opts.id!);
	await admin.collection(opts.collection).delete(opts.id!);
	await logAudit(admin, {
		userId: opts.user.id,
		action: opts.actionLabel ?? 'delete',
		collection: opts.collection,
		recordId: opts.id!,
		oldData: old ? plainRecord(old) : null
	});
}

/** Ambil pesan error yang ramah dari ClientResponseError PocketBase. */
export function pbErrorMessage(err: unknown): string {
	const e = err as { response?: { message?: string; data?: Record<string, { message?: string }> } };
	if (e?.response?.data) {
		const fieldErrors = Object.values(e.response.data)
			.map((d) => d?.message)
			.filter(Boolean);
		if (fieldErrors.length > 0) return fieldErrors.join(', ');
	}
	if (e?.response?.message?.toLowerCase().includes('delete')) {
		return 'Data masih dipakai di modul lain sehingga tidak bisa dihapus.';
	}
	return e?.response?.message ?? 'Terjadi kesalahan, coba lagi.';
}

/** Escape string untuk filter PocketBase. */
export function pbEscape(value: string): string {
	return value.replace(/["\\]/g, '');
}

/** Kode acak alfanumerik huruf besar. */
export function randomCode(length = 5): string {
	const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ123456789';
	let out = '';
	for (let i = 0; i < length; i++) {
		out += chars[Math.floor(Math.random() * chars.length)];
	}
	return out;
}
