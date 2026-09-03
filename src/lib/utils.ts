// Shared UI helpers.

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export type WithoutChild<T> = T extends { child?: any } ? Omit<T, 'child'> : T;
export type WithoutChildren<T> = T extends { children?: any } ? Omit<T, 'children'> : T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: U | null };

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

const rupiahFormatter = new Intl.NumberFormat('id-ID');

/** Format angka jadi ribuan gaya Indonesia: 15000 → "15.000". */
export function formatNumber(value: number | null | undefined): string {
	return rupiahFormatter.format(Number(value ?? 0));
}

/** Format jadi rupiah: 15000 → "Rp 15.000". */
export function formatRupiah(value: number | null | undefined): string {
	return `Rp ${formatNumber(value)}`;
}

const dateTimeFormatter = new Intl.DateTimeFormat('id-ID', {
	day: '2-digit',
	month: '2-digit',
	year: 'numeric',
	hour: '2-digit',
	minute: '2-digit'
});

/** Format ISO date → "02/09/2026 14.30". */
export function formatDateTime(value: string | null | undefined): string {
	if (!value) return '—';
	const d = new Date(value);
	if (Number.isNaN(d.getTime())) return '—';
	return dateTimeFormatter.format(d);
}

export interface Toast {
	id: string;
	message: string;
	type: 'success' | 'error';
}

export function createToast(message: string, type: 'success' | 'error'): Toast {
	return {
		id: Math.random().toString(36).slice(2, 11),
		message,
		type
	};
}

export async function copyToClipboard(
	text: string
): Promise<{ success: boolean; error?: string }> {
	if (typeof window === 'undefined') {
		return { success: false, error: 'Clipboard API not available' };
	}

	if (!navigator.clipboard) {
		return fallbackCopyToClipboard(text);
	}

	try {
		await navigator.clipboard.writeText(text);
		return { success: true };
	} catch {
		return fallbackCopyToClipboard(text);
	}
}

function fallbackCopyToClipboard(text: string): { success: boolean; error?: string } {
	try {
		const textArea = document.createElement('textarea');
		textArea.value = text;
		textArea.style.position = 'fixed';
		textArea.style.left = '-999999px';
		textArea.style.top = '-999999px';
		document.body.appendChild(textArea);
		textArea.focus();
		textArea.select();

		const successful = document.execCommand('copy');
		document.body.removeChild(textArea);

		return successful
			? { success: true }
			: { success: false, error: 'Failed to copy text' };
	} catch {
		return { success: false, error: 'Copy failed - please copy manually' };
	}
}

export function validateInput(text: string): { isValid: boolean; error?: string } {
	if (!text.trim()) {
		return { isValid: false, error: 'Please input text to copy' };
	}

	if (text.length > 10000) {
		return { isValid: false, error: 'Text exceeds the maximum length of 10000 characters' };
	}

	return { isValid: true };
}

export async function pasteFromClipboard(): Promise<{
	success: boolean;
	text?: string;
	error?: string;
}> {
	if (typeof window === 'undefined') {
		return { success: false, error: 'Clipboard API not available' };
	}

	if (!navigator.clipboard) {
		return { success: false, error: 'Clipboard API not available in this browser' };
	}

	try {
		const text = await navigator.clipboard.readText();
		return { success: true, text };
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Permission denied to access clipboard'
		};
	}
}

export function isClipboardAvailable(): boolean {
	if (typeof window === 'undefined') return false;
	return !!(
		navigator.clipboard &&
		typeof navigator.clipboard.readText === 'function' &&
		typeof navigator.clipboard.writeText === 'function'
	);
}
