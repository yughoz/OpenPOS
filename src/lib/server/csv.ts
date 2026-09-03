/**
 * Helper CSV minim tanpa dependensi (RFC-4180 sederhana):
 * delimiter dipilih otomatis (; atau ,), dukung field ber-kutip & kutip ganda ("").
 */

/** Parse teks CSV menjadi baris × kolom string. Baris kosong dibuang. */
export function parseCsv(text: string): string[][] {
	const clean = text.replace(/^\ufeff/, '');
	const delimiter = detectDelimiter(clean);
	const rows: string[][] = [];
	let row: string[] = [];
	let field = '';
	let inQuotes = false;

	for (let i = 0; i < clean.length; i++) {
		const ch = clean[i];
		if (inQuotes) {
			if (ch === '"') {
				if (clean[i + 1] === '"') {
					field += '"';
					i++;
				} else {
					inQuotes = false;
				}
			} else {
				field += ch;
			}
			continue;
		}
		if (ch === '"') {
			inQuotes = true;
		} else if (ch === delimiter) {
			row.push(field);
			field = '';
		} else if (ch === '\n' || ch === '\r') {
			if (ch === '\r' && clean[i + 1] === '\n') i++;
			row.push(field);
			field = '';
			if (row.length > 1 || row[0] !== '') rows.push(row);
			row = [];
		} else {
			field += ch;
		}
	}
	row.push(field);
	if (row.length > 1 || row[0] !== '') rows.push(row);
	return rows;
}

function detectDelimiter(text: string): string {
	const firstLine = text.split('\n', 1)[0] ?? '';
	const semi = (firstLine.match(/;/g) ?? []).length;
	const comma = (firstLine.match(/,/g) ?? []).length;
	return semi >= comma ? ';' : ',';
}

/** Escape satu sel jadi field CSV berkutip. */
export function csvCell(value: unknown): string {
	return `"${String(value ?? '').replace(/"/g, '""')}"`;
}
