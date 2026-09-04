<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Table from '$lib/components/ui/table';
	import * as Select from '$lib/components/ui/select';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import SearchIcon from '@lucide/svelte/icons/search';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import UploadIcon from '@lucide/svelte/icons/upload';
	import BarcodeIcon from '@lucide/svelte/icons/barcode';
	import * as m from '$lib/paraglide/messages.js';
	import { currency } from '$lib/currency.svelte';
	import { formatNumber } from '$lib/utils';

	interface ProductRow {
		id: string;
		name: string;
		barcode: string;
		category: string;
		unit: string;
		sell_price: number;
		cost_price: number;
		wholesale_price: number;
		stock: number;
		min_stock: number;
		description: string;
		expand?: { category?: { name: string }; unit?: { name: string } };
	}
	interface Option {
		id: string;
		name: string;
	}
	interface ImportResult {
		created: number;
		updated: number;
		errors: string[];
	}

	let { data } = $props<{
		data: {
			items: { items: ProductRow[]; page: number; totalPages: number; totalItems: number };
			categories: { items: Option[] };
			units: { items: Option[] };
			q: string;
		};
	}>();

	let createOpen = $state(false);
	let editing = $state<ProductRow | null>(null);
	let importOpen = $state(false);
	let importResult = $state<ImportResult | null>(null);
	let labelOpen = $state(false);
	let labelCopies = $state(24);
	let labelProduct = $state<ProductRow | null>(null);

	// state form create
	let cBarcode = $state('');
	let cName = $state('');
	let cCategory = $state('__none__');
	let cUnit = $state('__none__');
	let cSell = $state('');
	let cCost = $state('');
	let cWholesale = $state('');
	let cStock = $state('');
	let cMinStock = $state('');
	let cDescription = $state('');

	// state form edit
	let eName = $state('');
	let eBarcode = $state('');
	let eCategory = $state('__none__');
	let eUnit = $state('__none__');
	let eSell = $state('');
	let eCost = $state('');
	let eWholesale = $state('');
	let eMinStock = $state('');
	let eDescription = $state('');

	const NONE = '__none__';

	function openCreate() {
		cBarcode = '';
		cName = '';
		cCategory = NONE;
		cUnit = NONE;
		cSell = '';
		cCost = '';
		cWholesale = '';
		cStock = '';
		cMinStock = '10';
		cDescription = '';
		createOpen = true;
	}

	function openEdit(row: ProductRow) {
		editing = row;
		eName = row.name;
		eBarcode = row.barcode ?? '';
		eCategory = row.category || NONE;
		eUnit = row.unit || NONE;
		eSell = String(row.sell_price ?? '');
		eCost = String(row.cost_price ?? '');
		eWholesale = String(row.wholesale_price ?? '');
		eMinStock = String(row.min_stock ?? 0);
		eDescription = row.description ?? '';
	}

	function openImport() {
		importResult = null;
		importOpen = true;
	}

	function openLabel(p: ProductRow) {
		labelProduct = p;
		labelCopies = 24;
		labelOpen = true;
	}

	// gambar pratinjau barcode saat dialog label dibuka (jsbarcode butuh DOM/browser)
	$effect(() => {
		if (!labelOpen || !labelProduct) return;
		(async () => {
			const JsBarcode = (await import('jsbarcode')).default;
			const el = document.querySelector<SVGSVGElement>('svg[data-barcode]');
			if (el && labelProduct.barcode) {
				JsBarcode(el, labelProduct.barcode, {
					format: 'CODE128',
					width: 1.1,
					height: 40,
					margin: 0,
					fontSize: 11,
					displayValue: true
				});
			}
		})();
	});

	function handleResult(close: () => void, successMsg: string) {
		return () =>
			async ({ update, result }: { update: () => Promise<void>; result: { type: string; data?: unknown } }) => {
				await update();
				if (result.type === 'success') {
					toast.success(successMsg);
					close();
				} else if (result.type === 'failure') {
					toast.error(String((result.data as { error?: string } | undefined)?.error ?? m['products.generic_error']()));
				}
			};
	}

	const deleteEnhance = () =>
		async ({ update, result }: { update: () => Promise<void>; result: { type: string; data?: unknown } }) => {
			await update();
			if (result.type === 'success') toast.success(m['products.deleted_toast']());
			else if (result.type === 'failure')
				toast.error(String((result.data as { error?: string } | undefined)?.error ?? m['products.delete_error']()));
		};

	const importEnhance = () =>
		async ({ update, result }: { update: () => Promise<void>; result: { type: string; data?: unknown } }) => {
			await update();
			if (result.type === 'success') {
				const imported = (result.data as { imported?: ImportResult } | undefined)?.imported ?? null;
				importResult = imported;
				toast.success(m['products.import_done_toast']({ created: imported?.created ?? 0, updated: imported?.updated ?? 0 }));
			} else if (result.type === 'failure') {
				toast.error(String((result.data as { error?: string } | undefined)?.error ?? m['products.import_failed_toast']()));
			}
		};

	function categoryLabel(value: string): string {
		if (value === NONE) return m['products.no_category']();
		return data.categories.items.find((c: Option) => c.id === value)?.name ?? m['products.no_category']();
	}
	function unitLabel(value: string): string {
		if (value === NONE) return m['products.no_unit']();
		return data.units.items.find((u: Option) => u.id === value)?.name ?? m['products.no_unit']();
	}

	function goToPage(p: number) {
		const params = new URLSearchParams();
		if (data.q) params.set('q', data.q);
		params.set('page', String(p));
		goto(`?${params.toString()}`);
	}
</script>

<svelte:head>
	<title>{m['products.title']()} — OpenPOS</title>
</svelte:head>

<div class="flex w-full flex-col gap-6">
	<div class="space-y-1">
		<h1 class="text-2xl font-semibold tracking-tight md:text-3xl">{m['products.title']()}</h1>
		<p class="max-w-2xl text-sm text-muted-foreground">{m['products.description']()}</p>
	</div>

	<div class="flex flex-wrap items-center justify-between gap-3">
		<form method="GET" class="relative w-full max-w-xs">
			<SearchIcon class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
			<Input name="q" value={data.q} placeholder={m['products.search_placeholder']()} class="pl-8" />
		</form>
		<div class="flex flex-wrap gap-2">
			<a href="/app/products/export" download>
				<Button variant="outline" type="button">
					<DownloadIcon class="mr-1 size-4" />
					{m['products.export_csv']()}
				</Button>
			</a>
			<Button variant="outline" type="button" onclick={openImport}>
				<UploadIcon class="mr-1 size-4" />
				{m['products.import_csv']()}
			</Button>
			<Button onclick={openCreate}>
				<PlusIcon class="mr-1 size-4" />
				{m['products.add']()}
			</Button>
		</div>
	</div>

	<div class="rounded-lg border">
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head class="w-10">#</Table.Head>
					<Table.Head class="w-36">{m['products.col_barcode']()}</Table.Head>
					<Table.Head>{m['products.col_name']()}</Table.Head>
					<Table.Head class="w-36">{m['products.col_category']()}</Table.Head>
					<Table.Head class="w-20">{m['products.col_unit']()}</Table.Head>
					<Table.Head class="w-28 text-right">{m['products.col_sell_price']()}</Table.Head>
					<Table.Head class="w-20 text-right">{m['products.col_stock']()}</Table.Head>
					<Table.Head class="w-24 text-right">{m['products.col_actions']()}</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each data.items.items as row, i (row.id)}
					<Table.Row>
						<Table.Cell class="text-muted-foreground">{(data.items.page - 1) * 20 + i + 1}</Table.Cell>
						<Table.Cell class="font-mono text-xs">{row.barcode}</Table.Cell>
						<Table.Cell class="font-medium">{row.name}</Table.Cell>
						<Table.Cell class="text-muted-foreground">{row.expand?.category?.name ?? '—'}</Table.Cell>
						<Table.Cell class="text-muted-foreground">{row.expand?.unit?.name ?? '—'}</Table.Cell>
						<Table.Cell class="text-right tabular-nums">{formatNumber(row.sell_price)}</Table.Cell>
						<Table.Cell class="text-right tabular-nums">
							{#if row.stock > 0 && row.stock <= (row.min_stock || 0)}
								<span class="inline-flex items-center gap-1 font-medium text-destructive">
									<TriangleAlertIcon class="size-3.5" />
									{row.stock}
								</span>
							{:else}
								{row.stock}
							{/if}
						</Table.Cell>
						<Table.Cell class="text-right">
							<div class="flex justify-end gap-1">
								<Button variant="ghost" size="icon" class="size-7" onclick={() => openLabel(row)} title={m['products.print_label']()}>
									<BarcodeIcon class="size-3.5" />
								</Button>
								<Button variant="ghost" size="icon" class="size-7" onclick={() => openEdit(row)} title={m['products.edit']()}>
									<PencilIcon class="size-3.5" />
								</Button>
								<form
									method="POST"
									action="?/delete"
									use:enhance={deleteEnhance}
									onsubmit={(e) => {
										if (!confirm(m['products.delete_confirm']({ name: row.name }))) e.preventDefault();
									}}
								>
									<input type="hidden" name="id" value={row.id} />
									<Button variant="ghost" size="icon" class="size-7 text-destructive" type="submit" title={m['products.delete']()}>
										<Trash2Icon class="size-3.5" />
									</Button>
								</form>
							</div>
						</Table.Cell>
					</Table.Row>
				{:else}
					<Table.Row>
						<Table.Cell colspan={8} class="py-10 text-center text-muted-foreground">
							{data.q ? m['products.empty_search']({ q: data.q }) : m['products.empty']()}
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</div>

	{#if data.items.totalPages > 1}
		<div class="flex items-center justify-between text-sm text-muted-foreground">
			<span>{m['products.count']({ n: data.items.totalItems })}</span>
			<div class="flex items-center gap-2">
				<Button variant="outline" size="icon" class="size-8" disabled={data.items.page <= 1} onclick={() => goToPage(data.items.page - 1)}>
					<ChevronLeftIcon class="size-4" />
				</Button>
				<span>{data.items.page} / {data.items.totalPages}</span>
				<Button
					variant="outline"
					size="icon"
					class="size-8"
					disabled={data.items.page >= data.items.totalPages}
					onclick={() => goToPage(data.items.page + 1)}
				>
					<ChevronRightIcon class="size-4" />
				</Button>
			</div>
		</div>
	{/if}
</div>

<!-- Dialog: Tambah Produk -->
<Dialog.Root bind:open={createOpen}>
	<Dialog.Content class="max-h-[90vh] overflow-y-auto sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>{m['products.create_title']()}</Dialog.Title>
			<Dialog.Description>{m['products.create_desc']()}</Dialog.Description>
		</Dialog.Header>
		<form method="POST" action="?/create" use:enhance={handleResult(() => (createOpen = false), m['products.created_toast']())}>
			<div class="grid gap-4 py-2">
				<div class="grid gap-2">
					<Label for="c-barcode">{m['products.field_barcode']()}</Label>
					<Input id="c-barcode" name="barcode" bind:value={cBarcode} placeholder="kosongkan = auto-generate" />
				</div>
				<div class="grid gap-2">
					<Label for="c-name">{m['products.field_name']()}</Label>
					<Input id="c-name" name="name" bind:value={cName} required maxlength={300} placeholder="Contoh: Aqua 600ml" />
				</div>
				<div class="grid grid-cols-2 gap-4">
					<input type="hidden" name="category" value={cCategory} />
					<input type="hidden" name="unit" value={cUnit} />
					<div class="grid gap-2">
						<Label>{m['products.field_category']()}</Label>
						<Select.Root type="single" bind:value={cCategory}>
							<Select.Trigger class="w-full">{categoryLabel(cCategory)}</Select.Trigger>
							<Select.Content>
								<Select.Item value={NONE} label={m['products.no_category']()} />
								{#each data.categories.items as cat (cat.id)}
									<Select.Item value={cat.id} label={cat.name} />
								{/each}
							</Select.Content>
						</Select.Root>
					</div>
					<div class="grid gap-2">
						<Label>{m['products.field_unit']()}</Label>
						<Select.Root type="single" bind:value={cUnit}>
							<Select.Trigger class="w-full">{unitLabel(cUnit)}</Select.Trigger>
							<Select.Content>
								<Select.Item value={NONE} label={m['products.no_unit']()} />
								{#each data.units.items as unit (unit.id)}
									<Select.Item value={unit.id} label={unit.name} />
								{/each}
							</Select.Content>
						</Select.Root>
					</div>
				</div>
				<div class="grid grid-cols-2 gap-4">
					<div class="grid gap-2">
						<Label for="c-sell">{m['products.field_sell_price']({ symbol: currency.symbol })}</Label>
						<Input id="c-sell" name="sell_price" bind:value={cSell} type="number" min="1" required placeholder="15000" />
					</div>
					<div class="grid gap-2">
						<Label for="c-cost">{m['products.field_cost_price']({ symbol: currency.symbol })}</Label>
						<Input id="c-cost" name="cost_price" bind:value={cCost} type="number" min="0" placeholder="12000" />
					</div>
				</div>
				<div class="grid grid-cols-2 gap-4">
					<div class="grid gap-2">
						<Label for="c-wholesale">{m['products.field_wholesale']({ symbol: currency.symbol })}</Label>
						<Input id="c-wholesale" name="wholesale_price" bind:value={cWholesale} type="number" min="0" placeholder="14000" />
					</div>
					<div class="grid grid-cols-2 gap-4">
						<div class="grid gap-2">
							<Label for="c-stock">{m['products.field_initial_stock']()}</Label>
							<Input id="c-stock" name="stock" bind:value={cStock} type="number" min="0" placeholder="0" />
						</div>
						<div class="grid gap-2">
							<Label for="c-minstock">{m['products.field_min_stock']()}</Label>
							<Input id="c-minstock" name="min_stock" bind:value={cMinStock} type="number" min="0" placeholder="10" />
						</div>
					</div>
				</div>
				<div class="grid gap-2">
					<Label for="c-desc">{m['products.field_description']()}</Label>
					<Input id="c-desc" name="description" bind:value={cDescription} maxlength={300} />
				</div>
			</div>
			<Dialog.Footer>
				<Button type="button" variant="outline" onclick={() => (createOpen = false)}>{m['products.cancel']()}</Button>
				<Button type="submit">{m['products.save']()}</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<!-- Dialog: Edit Produk -->
<Dialog.Root open={editing !== null} onOpenChange={(o) => (editing = o ? editing : null)}>
	{#if editing}
		<Dialog.Content class="max-h-[90vh] overflow-y-auto sm:max-w-lg">
			<Dialog.Header>
				<Dialog.Title>{m['products.edit_title']()}</Dialog.Title>
				<Dialog.Description>{m['products.edit_desc']()}</Dialog.Description>
			</Dialog.Header>
			<form method="POST" action="?/update" use:enhance={handleResult(() => (editing = null), m['products.updated_toast']())}>
				<input type="hidden" name="id" value={editing.id} />
				<div class="grid gap-4 py-2">
					<div class="grid gap-2">
						<Label for="e-barcode">{m['products.field_barcode']()}</Label>
						<Input id="e-barcode" name="barcode" bind:value={eBarcode} />
					</div>
					<div class="grid gap-2">
						<Label for="e-name">{m['products.field_name']()}</Label>
						<Input id="e-name" name="name" bind:value={eName} required maxlength={300} />
					</div>
					<div class="grid grid-cols-2 gap-4">
						<input type="hidden" name="category" value={eCategory} />
						<input type="hidden" name="unit" value={eUnit} />
						<div class="grid gap-2">
							<Label>{m['products.field_category']()}</Label>
							<Select.Root type="single" bind:value={eCategory}>
								<Select.Trigger class="w-full">{categoryLabel(eCategory)}</Select.Trigger>
								<Select.Content>
									<Select.Item value={NONE} label={m['products.no_category']()} />
									{#each data.categories.items as cat (cat.id)}
										<Select.Item value={cat.id} label={cat.name} />
									{/each}
								</Select.Content>
							</Select.Root>
						</div>
						<div class="grid gap-2">
							<Label>{m['products.field_unit']()}</Label>
							<Select.Root type="single" bind:value={eUnit}>
								<Select.Trigger class="w-full">{unitLabel(eUnit)}</Select.Trigger>
								<Select.Content>
									<Select.Item value={NONE} label={m['products.no_unit']()} />
									{#each data.units.items as unit (unit.id)}
										<Select.Item value={unit.id} label={unit.name} />
									{/each}
								</Select.Content>
							</Select.Root>
						</div>
					</div>
					<div class="grid grid-cols-2 gap-4">
						<div class="grid gap-2">
							<Label for="e-sell">{m['products.field_sell_price']({ symbol: currency.symbol })}</Label>
							<Input id="e-sell" name="sell_price" bind:value={eSell} type="number" min="1" required />
						</div>
						<div class="grid gap-2">
							<Label for="e-cost">{m['products.field_cost_price']({ symbol: currency.symbol })}</Label>
							<Input id="e-cost" name="cost_price" bind:value={eCost} type="number" min="0" />
						</div>
					</div>
					<div class="grid grid-cols-2 gap-4">
						<div class="grid gap-2">
							<Label>{m['products.col_stock']()}</Label>
							<Input value={String(editing.stock)} disabled />
						</div>
						<div class="grid gap-2">
							<Label for="e-minstock">{m['products.field_min_stock']()}</Label>
							<Input id="e-minstock" name="min_stock" bind:value={eMinStock} type="number" min="0" />
						</div>
					</div>
					<div class="grid gap-2">
						<Label for="e-desc">{m['products.field_description']()}</Label>
						<Input id="e-desc" name="description" bind:value={eDescription} maxlength={300} />
					</div>
				</div>
				<Dialog.Footer>
					<Button type="button" variant="outline" onclick={() => (editing = null)}>{m['products.cancel']()}</Button>
					<Button type="submit">{m['products.save']()}</Button>
				</Dialog.Footer>
			</form>
		</Dialog.Content>
	{/if}
</Dialog.Root>

<!-- Dialog: Impor CSV -->
<Dialog.Root bind:open={importOpen}>
	<Dialog.Content class="max-h-[90vh] overflow-y-auto sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>{m['products.import_title']()}</Dialog.Title>
			<Dialog.Description>{m['products.import_desc']()}</Dialog.Description>
		</Dialog.Header>
		<form method="POST" action="?/import" enctype="multipart/form-data" use:enhance={importEnhance}>
			<div class="grid gap-4 py-2">
				<div class="grid gap-2">
					<Label for="import-file">{m['products.import_choose_file']()}</Label>
					<Input id="import-file" name="file" type="file" accept=".csv,text/csv" required />
				</div>
				<p class="text-xs text-muted-foreground">{m['products.import_note_stock']()}</p>

				{#if importResult}
					<div class="rounded-lg border p-3 text-sm">
						<p class="font-medium">{m['products.import_result']()}</p>
						<ul class="mt-1 list-inside list-disc text-muted-foreground">
							<li>{m['products.import_created']({ n: importResult.created })}</li>
							<li>{m['products.import_updated']({ n: importResult.updated })}</li>
						</ul>
						{#if importResult.errors.length > 0}
							<p class="mt-2 text-xs font-medium text-destructive">{m['products.import_errors']()}</p>
							<ul class="mt-1 space-y-0.5 text-xs text-muted-foreground">
								{#each importResult.errors.slice(0, 10) as err}
									<li>{err}</li>
								{/each}
								{#if importResult.errors.length > 10}
									<li>{m['products.import_more_errors']({ n: importResult.errors.length - 10 })}</li>
								{/if}
							</ul>
						{:else}
							<p class="mt-2 text-xs text-muted-foreground">{m['products.import_no_errors']()}</p>
						{/if}
					</div>
				{/if}
			</div>
			<Dialog.Footer>
				<Button type="button" variant="outline" onclick={() => (importOpen = false)}>{m['products.cancel']()}</Button>
				<Button type="submit">
					<UploadIcon class="mr-1 size-4" />
					{m['products.import_csv']()}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<!-- Dialog: Cetak Label Barcode -->
<Dialog.Root bind:open={labelOpen}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>{m['labels.title']()}</Dialog.Title>
			<Dialog.Description>{labelProduct?.name}</Dialog.Description>
		</Dialog.Header>
		<div class="grid gap-4 py-2">
			<div class="grid gap-2">
				<Label for="label-copies">{m['labels.copies']()}</Label>
				<Input id="label-copies" bind:value={labelCopies} type="number" min="1" max="100" />
			</div>
			<div class="flex justify-center rounded-lg border p-3">
				<svg data-barcode={labelProduct?.barcode ?? ''}></svg>
			</div>
		</div>
		<Dialog.Footer>
			<Button type="button" variant="outline" onclick={() => (labelOpen = false)}>{m['products.cancel']()}</Button>
			<Button type="button" onclick={() => goto(`/app/products/labels?id=${labelProduct?.id ?? ''}&copies=${labelCopies}`)}>
				{m['labels.print']()}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
