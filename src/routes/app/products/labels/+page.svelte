<script lang="ts">
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import PrintIcon from '@lucide/svelte/icons/printer';
	import * as m from '$lib/paraglide/messages.js';
	import { formatNumber, formatRupiah } from '$lib/utils';

	let { data } = $props<{
		data: {
			copies: number;
			product: { id: string; name: string; barcode: string; price: number };
		};
	}>();

	// JsBarcode hanya jalan di browser (butuh DOM) — render semua svg label setelah mount
	onMount(async () => {
		const JsBarcode = (await import('jsbarcode')).default;
		document.querySelectorAll<SVGSVGElement>('svg[data-barcode]').forEach((el) => {
			JsBarcode(el, el.getAttribute('data-barcode') ?? '', {
				format: 'CODE128',
				width: 1.1,
				height: 34,
				margin: 0,
				fontSize: 11,
				displayValue: true
			});
		});
	});
</script>

<svelte:head>
	<title>{m['labels.title']()} — OpenPOS</title>
</svelte:head>

<div class="flex w-full flex-col gap-4">
	<div class="flex flex-wrap items-center justify-between gap-3 print:hidden">
		<div class="space-y-1">
			<h1 class="text-2xl font-semibold tracking-tight">{m['labels.title']()}</h1>
			<p class="text-sm text-muted-foreground">
				{data.product.name} — {m['labels.copies']()}: {data.copies} · {m['labels.description']()}
			</p>
		</div>
		<div class="flex gap-2">
			<a href="/app/products"><Button variant="outline">← {m['nav.products']()}</Button></a>
			<Button onclick={() => window.print()}>
				<PrintIcon class="mr-1 size-4" />
				{m['labels.print']()}
			</Button>
		</div>
	</div>

	<div class="grid grid-cols-2 gap-2 sm:grid-cols-3 print:grid-cols-5 print:gap-1">
		{#each Array(data.copies) as _, i (i)}
			<div class="flex h-[30mm] w-[40mm] flex-col items-center justify-center border border-dashed border-neutral-400 px-1 print:border-neutral-400">
				<div class="w-full truncate text-center text-[10px] font-semibold uppercase leading-tight">{data.product.name}</div>
				<div class="text-[11px] font-bold">{formatRupiah(data.product.price)}</div>
				<svg data-barcode={data.product.barcode}></svg>
			</div>
		{/each}
	</div>
</div>
