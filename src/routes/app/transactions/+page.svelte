<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import * as Table from '$lib/components/ui/table';
	import SearchIcon from '@lucide/svelte/icons/search';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import PrinterIcon from '@lucide/svelte/icons/printer';
	import BanIcon from '@lucide/svelte/icons/ban';
	import * as m from '$lib/paraglide/messages.js';
	import { formatDateTime, formatNumber } from '$lib/utils';
	import type { OptionItem } from '$lib/types';

	interface CsvRow {
		tanggal: string;
		nota: string;
		customer: string;
		kasir: string;
		total: number;
		status: string;
	}

	function exportCsv() {
		const head = ['Tanggal', 'Nota', 'Customer', 'Kasir', 'Total', 'Status'];
		const lines = [head.join(';')];
		for (const t of data.all as CsvRow[]) {
			lines.push(
				[
					t.tanggal,
					t.nota,
					t.customer,
					t.kasir,
					String(t.total),
					t.status === 'completed' ? 'Selesai' : 'Dibatalkan'
				]
					.map((v) => `"${String(v).replace(/"/g, '""')}"`)
					.join(';')
			);
		}
		const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = `laporan-transaksi-${new Date().toISOString().slice(0, 10)}.csv`;
		a.click();
		URL.revokeObjectURL(a.href);
	}

	interface TxRow {
		id: string;
		code: string;
		transaction_date: string;
		total_final: number;
		status: string;
		user: string;
		customer: string;
		expand?: { customer?: { name: string }; user?: { name: string } };
	}

	let { data } = $props<{
		data: {
			list: { items: TxRow[]; page: number; totalPages: number; totalItems: number };
			itemsMap: Record<string, Array<{ id: string; product_name: string; qty: number; final_price: number }>>;
			summary: { omzet: number; modal: number; laba: number; jumlahTransaksi: number };
			filters: { from: string; to: string; customer: string; kasir: string };
			customers: { items: OptionItem[] };
			kasirs: Array<{ id: string; name: string }>;
			isAdmin: boolean;
		};
	}>();

	const NONE = '__none__';
	let from = $state(data.filters.from);
	let to = $state(data.filters.to);
	let customer = $state(data.filters.customer || NONE);
	let kasir = $state(data.filters.kasir || NONE);

	function optionLabel(list: Array<{ id: string; name: string }>, value: string, emptyLabel: string): string {
		if (value === NONE || !value) return emptyLabel;
		return list.find((x) => x.id === value)?.name ?? emptyLabel;
	}

	function goToPage(p: number) {
		const params = new URLSearchParams();
		if (data.filters.from) params.set('from', data.filters.from);
		if (data.filters.to) params.set('to', data.filters.to);
		if (data.filters.customer) params.set('customer', data.filters.customer);
		if (data.filters.kasir) params.set('kasir', data.filters.kasir);
		params.set('page', String(p));
		goto(`?${params.toString()}`);
	}

	const voidEnhance = () =>
		() =>
		async ({ update, result }: { update: () => Promise<void>; result: { type: string; data?: unknown } }) => {
			await update();
			if (result.type === 'failure') {
				toast.error(String((result.data as { error?: string } | undefined)?.error ?? m['transactions.void_fail']()));
			} else {
				toast.success(m['transactions.void_success']());
			}
		};
</script>

<svelte:head>
	<title>{m['nav.transaction_list']()} — OpenPOS</title>
</svelte:head>

<div class="flex w-full flex-col gap-6">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div class="space-y-1">
			<h1 class="text-2xl font-semibold tracking-tight md:text-3xl">{m['nav.transaction_list']()}</h1>
		</div>
		<Button variant="outline" onclick={exportCsv}>{m['transactions.export_csv']()}</Button>
	</div>

	<p class="max-w-2xl text-sm text-muted-foreground">
		{data.isAdmin ? m['transactions.description_admin']() : m['transactions.description_self']()}
	</p>

	<div class="grid gap-4 md:grid-cols-4">
		<Card>
			<CardHeader>
				<CardDescription>{m['transactions.summary_omzet']()}</CardDescription>
				<CardTitle class="text-xl tabular-nums">Rp {formatNumber(data.summary.omzet)}</CardTitle>
			</CardHeader>
		</Card>
		<Card>
			<CardHeader>
				<CardDescription>{m['transactions.summary_modal']()}</CardDescription>
				<CardTitle class="text-xl tabular-nums">Rp {formatNumber(data.summary.modal)}</CardTitle>
			</CardHeader>
		</Card>
		<Card>
			<CardHeader>
				<CardDescription>{m['transactions.summary_laba']()}</CardDescription>
				<CardTitle class="text-xl tabular-nums text-emerald-600 dark:text-emerald-400">Rp {formatNumber(data.summary.laba)}</CardTitle>
			</CardHeader>
		</Card>
		<Card>
			<CardHeader>
				<CardDescription>{m['transactions.summary_count']()}</CardDescription>
				<CardTitle class="text-xl tabular-nums">{data.summary.jumlahTransaksi}</CardTitle>
			</CardHeader>
		</Card>
	</div>

	<Card>
		<CardContent class="pt-4">
			<form method="GET" class="grid items-end gap-4 md:grid-cols-5">
				<div class="grid gap-2">
					<Label for="from">{m['common.from_date']()}</Label>
					<Input id="from" name="from" type="date" bind:value={from} />
				</div>
				<div class="grid gap-2">
					<Label for="to">{m['common.to_date']()}</Label>
					<Input id="to" name="to" type="date" bind:value={to} />
				</div>
				<input type="hidden" name="customer" value={customer === NONE ? '' : customer} />
				<div class="grid gap-2">
					<Label>{m['transactions.customer']()}</Label>
					<Select.Root type="single" bind:value={customer}>
						<Select.Trigger class="w-full">{optionLabel(data.customers.items, customer, m['transactions.all_customers']())}</Select.Trigger>
						<Select.Content class="max-h-64">
							<Select.Item value={NONE} label={m['transactions.all_customers']()} />
							{#each data.customers.items as c (c.id)}
								<Select.Item value={c.id} label={c.name} />
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
				{#if data.isAdmin}
					<input type="hidden" name="kasir" value={kasir === NONE ? '' : kasir} />
					<div class="grid gap-2">
						<Label>{m['transactions.kasir']()}</Label>
						<Select.Root type="single" bind:value={kasir}>
							<Select.Trigger class="w-full">{optionLabel(data.kasirs, kasir, m['transactions.all_kasirs']())}</Select.Trigger>
							<Select.Content class="max-h-64">
								<Select.Item value={NONE} label={m['transactions.all_kasirs']()} />
								{#each data.kasirs as k (k.id)}
									<Select.Item value={k.id} label={k.name} />
								{/each}
							</Select.Content>
						</Select.Root>
					</div>
				{/if}
				<div class="flex gap-2">
					<Button type="submit">
						<SearchIcon class="mr-1 size-4" />
						{m['common.filter']()}
					</Button>
					<a href="/app/transactions"><Button type="button" variant="outline">{m['common.reset']()}</Button></a>
				</div>
			</form>
		</CardContent>
	</Card>

	<div class="rounded-lg border">
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head class="w-36">{m['transactions.col_time']()}</Table.Head>
					<Table.Head class="w-40">{m['transactions.col_nota']()}</Table.Head>
					<Table.Head>{m['transactions.col_items']()}</Table.Head>
					<Table.Head class="w-28 text-right">{m['transactions.col_total']()}</Table.Head>
					{#if data.isAdmin}<Table.Head class="w-28">{m['transactions.col_kasir']()}</Table.Head>{/if}
					<Table.Head class="w-24">{m['transactions.col_status']()}</Table.Head>
					<Table.Head class="w-28 text-right">{m['transactions.col_actions']()}</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each data.list.items as tx (tx.id)}
					<Table.Row class={tx.status === 'voided' ? 'opacity-50' : ''}>
						<Table.Cell class="whitespace-nowrap text-muted-foreground">{formatDateTime(tx.transaction_date)}</Table.Cell>
						<Table.Cell class="font-mono text-xs">{tx.code}</Table.Cell>
						<Table.Cell>
							<details class="min-w-40">
								<summary class="cursor-pointer text-muted-foreground">
									{m['common.items']({ n: (data.itemsMap[tx.id] ?? []).length })}
								</summary>
								<div class="mt-1 space-y-0.5 text-xs">
									{#each data.itemsMap[tx.id] ?? [] as item (item.id)}
										<div class="flex justify-between gap-3">
											<span>{item.qty}× {item.product_name}</span>
											<span class="tabular-nums">{formatNumber(item.final_price)}</span>
										</div>
									{/each}
								</div>
							</details>
						</Table.Cell>
						<Table.Cell class="text-right font-semibold tabular-nums">{formatNumber(tx.total_final)}</Table.Cell>
						{#if data.isAdmin}
							<Table.Cell class="text-muted-foreground">{tx.expand?.user?.name ?? '—'}</Table.Cell>
						{/if}
						<Table.Cell>
							<span class="rounded-full px-2 py-0.5 text-xs font-medium {tx.status === 'completed' ? 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-400' : 'bg-destructive/15 text-destructive'}">
								{tx.status === 'completed' ? m['transactions.status_completed']() : m['transactions.status_voided']()}
							</span>
						</Table.Cell>
						<Table.Cell class="text-right">
							<div class="flex justify-end gap-1">
								<a href="/app/pos/receipt/{tx.id}" target="_blank" title={m['transactions.print_receipt']()}>
									<Button variant="ghost" size="icon" class="size-7">
										<PrinterIcon class="size-3.5" />
									</Button>
								</a>
								{#if data.isAdmin && tx.status === 'completed'}
									<form
										method="POST"
										action="?/void"
										use:enhance={voidEnhance()}
										onsubmit={(e) => {
											if (!confirm(m['transactions.void_confirm']({ code: tx.code }))) e.preventDefault();
										}}
									>
										<input type="hidden" name="tx_id" value={tx.id} />
										<Button variant="ghost" size="icon" type="submit" class="size-7 text-destructive" title={m['transactions.void']()}>
											<BanIcon class="size-3.5" />
										</Button>
									</form>
								{/if}
							</div>
						</Table.Cell>
					</Table.Row>
				{:else}
					<Table.Row>
						<Table.Cell colspan={data.isAdmin ? 7 : 6} class="py-10 text-center text-muted-foreground">
							{m['transactions.empty']()}
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</div>

	{#if data.list.totalPages > 1}
		<div class="flex items-center justify-between text-sm text-muted-foreground">
			<span>{data.list.totalItems} transaksi</span>
			<div class="flex items-center gap-2">
				<Button variant="outline" size="icon" class="size-8" disabled={data.list.page <= 1} onclick={() => goToPage(data.list.page - 1)}>
					<ChevronLeftIcon class="size-4" />
				</Button>
				<span>{data.list.page} / {data.list.totalPages}</span>
				<Button
					variant="outline"
					size="icon"
					class="size-8"
					disabled={data.list.page >= data.list.totalPages}
					onclick={() => goToPage(data.list.page + 1)}
				>
					<ChevronRightIcon class="size-4" />
				</Button>
			</div>
		</div>
	{/if}
</div>
