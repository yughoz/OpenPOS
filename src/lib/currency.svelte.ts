import { formatNumber } from '$lib/utils';

/**
 * Simbol mata uang global (diatur lewat Settings → currency_symbol).
 * Diisi root layout setiap request; formatRupiah/utils membaca dari sini.
 */
export const currency = $state({ symbol: 'Rp' });

export function setCurrencySymbol(symbol: string | null | undefined): void {
	currency.symbol = symbol?.trim() || 'Rp';
}

/** Format angka jadi mata uang mengikuti simbol terkonfigurasi: 15000 → "Rp 15.000". */
export function formatMoney(value: number | null | undefined): string {
	return `${currency.symbol} ${formatNumber(value)}`;
}
