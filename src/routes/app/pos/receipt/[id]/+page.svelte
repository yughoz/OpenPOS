<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { formatDateTime, formatNumber, formatRupiah } from '$lib/utils';

	let { data } = $props<{
		data: {
			print: boolean;
			store: { name: string; description: string; phone: string };
			receiptSize: number;
			receiptFooter: string;
			tx: {
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
				expand?: { customer?: { name: string } };
			};
			items: Array<{ id: string; product_name: string; qty: number; sell_price: number; discount: number; final_price: number }>;
			cashier: string;
		};
	}>();

	const methodLabel: Record<string, string> = { cash: 'Tunai', qris: 'QRIS', debit: 'Debit', ewallet: 'E-Wallet' };

	$effect(() => {
		if (data.print) {
			const t = setTimeout(() => window.print(), 300);
			return () => clearTimeout(t);
		}
	});
</script>

<svelte:head>
	<title>Struk {data.tx.code} — OpenPOS</title>
	<!-- paksa ukuran kertas sesuai printer thermal; tanpa ini dialog print
		memakai kertas default (A4 + margin) sehingga struk kepotong -->
	{@html `<style>@page { size: ${data.receiptSize}mm auto; margin: 0; }</style>`}
</svelte:head>

<div class="mx-auto w-full max-w-sm p-4 print:max-w-none print:p-0">
	<div class="mb-3 flex items-center justify-between print:hidden">
		<a href="/app/pos" class="text-sm text-muted-foreground hover:underline">← Kembali ke Kasir</a>
		<Button size="sm" onclick={() => window.print()}>Cetak</Button>
	</div>

	<!-- struk thermal, lebar sesuai setting (58/80mm);
		lebar < kertas (border-box, termasuk padding) agar muat area cetak printer -->
	<div
		class="mx-auto bg-white p-2 font-mono leading-snug text-black print:p-0 {data.receiptSize === 58 ? 'w-[54mm] text-xs print:text-[11px]' : 'w-[74mm] text-sm print:text-[13px]'}"
	>
		<div class="text-center">
			<div class="text-base font-bold uppercase">{data.store.name}</div>
			{#if data.store.description}<div>{data.store.description}</div>{/if}
			{#if data.store.phone}<div>Telp. {data.store.phone}</div>{/if}
		</div>

		<div class="my-1 border-t border-dashed border-black"></div>

		<div class="flex justify-between">
			<span>No</span>
			<span class="font-bold">{data.tx.code}</span>
		</div>
		<div class="flex justify-between">
			<span>Tanggal</span>
			<span>{formatDateTime(data.tx.transaction_date)}</span>
		</div>
		{#if data.cashier}
			<div class="flex justify-between">
				<span>Kasir</span>
				<span>{data.cashier}</span>
			</div>
		{/if}
		{#if data.tx.expand?.customer?.name}
			<div class="flex justify-between">
				<span>Customer</span>
				<span>{data.tx.expand.customer.name}</span>
			</div>
		{/if}

		<div class="my-1 border-t border-dashed border-black"></div>

		{#each data.items as item (item.id)}
			<!-- nama produk wrap, harga di baris bawah rata kanan -->
			<div class="break-words">{item.qty}x {item.product_name}</div>
			<div class="text-right tabular-nums">{formatNumber(item.final_price)}</div>
			{#if item.discount > 0}
				<div class="text-right tabular-nums">-{formatNumber(item.discount)}</div>
			{/if}
		{/each}

		<div class="my-1 border-t border-dashed border-black"></div>

		<div class="flex justify-between">
			<span>Subtotal</span>
			<span class="tabular-nums">{formatNumber(data.tx.total_gross)}</span>
		</div>
		{#if data.tx.total_discount > 0}
			<div class="flex justify-between">
				<span>Diskon</span>
				<span class="tabular-nums">-{formatNumber(data.tx.total_discount)}</span>
			</div>
		{/if}
		<div class="flex justify-between text-base font-bold">
			<span>TOTAL</span>
			<span class="tabular-nums">{formatRupiah(data.tx.total_final)}</span>
		</div>
		<div class="flex justify-between">
			<span>Bayar ({methodLabel[data.tx.payment_method] ?? data.tx.payment_method})</span>
			<span class="tabular-nums">{formatNumber(data.tx.paid_amount)}</span>
		</div>
		<div class="flex justify-between">
			<span>Kembali</span>
			<span class="tabular-nums">{formatNumber(data.tx.change_amount)}</span>
		</div>

		<div class="my-1 border-t border-dashed border-black"></div>

		<div class="text-center">
			{#if data.tx.status === 'voided'}
				<div class="font-bold">*** TRANSAKSI DIBATALKAN ***</div>
			{:else if data.receiptFooter}
				<div>{data.receiptFooter}</div>
			{:else}
				<div>Terima kasih telah berbelanja 🙏</div>
				<div>Barang yang sudah dibeli tidak dapat ditukar</div>
			{/if}
		</div>
	</div>
</div>
