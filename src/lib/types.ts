// Tipe data bersama antara server service dan komponen UI.

export interface MovementRow {
	id: string;
	moved_at: string;
	type: string;
	qty: number;
	note: string;
	reference: string;
	expand?: {
		product?: { name: string };
		user?: { name: string };
		supplier?: { name: string };
	};
}

export interface OptionItem {
	id: string;
	name: string;
}
