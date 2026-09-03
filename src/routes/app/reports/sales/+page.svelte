<script lang="ts">
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Button } from '$lib/components/ui/button';
	import * as Select from '$lib/components/ui/select';
	import * as Table from '$lib/components/ui/table';
	import BarChart from '$lib/components/bar-chart.svelte';
	import SearchIcon from '@lucide/svelte/icons/search';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import * as m from '$lib/paraglide/messages.js';
	import { formatNumber, formatRupiah } from '$lib/utils';

	interface DailyRow {
		tanggal: string;
		label: string;
		value: number;
		jumlahTransaksi: number;
		omzet: number;
		modal: number;
		laba: number;
	}
	interface TopProductRow {
		name: string;
		qty: number;
		omzet: number;
		laba: number;
	}
	interface MethodRow {
		method: string;
		label: string;
		count: number;
		omzet: number;
	}

	let { data } = $props<{
		data: {
			summary: { omzet: number; modal: number; laba: number; jumlahTransaksi: number };
			daily: DailyRow[];
			topProducts: TopProductRow[];
			methods: MethodRow[];
			filters: { from: string; to: string; kasir: string };
			kasirs: Array<{ id: string; name: string }>;
		};
	}>();

	const NONE = '__none__';
	let from = $state(data.filters.from);
	let to = $state(data.filters.to);
	let kasir = $state(data.filters.kasir || NONE);

	function kasirLabel(value: string): string {
		if (value === NONE || !value) return m['salesReport.all_kasirs']();
		return data.kasirs.find((k: { id: string; name: string }) => k.id === value)?.name ?? '—';
	}

	const methodLabel: Record<string, string> = {
		cash: m['pos.method_cash'](),
		qris: m['pos.method_qris'](),
		debit: m['pos.method_debit'](),
		ewallet: m['pos.method_ewallet']()
	};

	// ekspor rincian harian sebagai CSV (pola sama dengan halaman transaksi)
	function exportCsv() {
		const head = ['Tanggal', 'Jumlah Transaksi', 'Omzet', 'Modal', 'Laba'];
		const lines = [head.join(';')];
		for (const d of data.daily) {
			lines.push(
				[d.tanggal, String(d.jumlahTransaksi), String(d.omzet), String(d.modal), String(d.laba)]
					.map((v) => `"${v.replace(/"/g, '""')}"`)
					.join(';')
			);
		}
		const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = `laporan-penjualan-${data.filters.from}_sd_${data.filters.to}.csv`;
		a.click();
		URL.revokeObjectURL(a.href);
	}
</script>

<svelte:head>
	<title>{m['salesReport.title']()} — OpenPOS</title>
</svelte:head>

<div class="flex w-full flex-col gap-6">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div class="space-y-1">
			<h1 class="text-2xl font-semibold tracking-tight md:text-3xl">{m['salesReport.title']()}</h1>
			<p class="max-w-2xl text-sm text-muted-foreground">{m['salesReport.description']()}</p>
		</div>
		<Button variant="outline" onclick={exportCsv}>
			<DownloadIcon class="mr-1 size-4" />
			{m['salesReport.export_csv']()}
		</Button>
	</div>

	<Card>
		<CardContent class="pt-4">
			<form method="GET" class="grid items-end gap-4 md:grid-cols-4">
				<div class="grid gap-2">
					<Label for="from">{m['common.from_date']()}</Label>
					<Input id="from" name="from" type="date" bind:value={from} />
				</div>
				<div class="grid gap-2">
					<Label for="to">{m['common.to_date']()}</Label>
					<Input id="to" name="to" type="date" bind:value={to} />
				</div>
				<input type="hidden" name="kasir" value={kasir === NONE ? '' : kasir} />
				<div class="grid gap-2">
					<Label>{m['salesReport.kasir']()}</Label>
					<Select.Root type="single" bind:value={kasir}>
						<Select.Trigger class="w-full">{kasirLabel(kasir)}</Select.Trigger>
						<Select.Content class="max-h-64">
							<Select.Item value={NONE} label={m['salesReport.all_kasirs']()} />
							{#each data.kasirs as k (k.id)}
								<Select.Item value={k.id} label={k.name} />
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
				<div class="flex gap-2">
					<Button type="submit">
						<SearchIcon class="mr-1 size-4" />
						{m['common.filter']()}
					</Button>
					<a href="/app/reports/sales"><Button type="button" variant="outline">{m['common.reset']()}</Button></a>
				</div>
			</form>
		</CardContent>
	</Card>

	<div class="grid gap-4 md:grid-cols-4">
		<Card>
			<CardHeader>
				<CardDescription>{m['salesReport.summary_omzet']()}</CardDescription>
				<CardTitle class="text-xl tabular-nums">{formatRupiah(data.summary.omzet)}</CardTitle>
			</CardHeader>
		</Card>
		<Card>
			<CardHeader>
				<CardDescription>{m['salesReport.summary_modal']()}</CardDescription>
				<CardTitle class="text-xl tabular-nums">{formatRupiah(data.summary.modal)}</CardTitle>
			</CardHeader>
		</Card>
		<Card>
			<CardHeader>
				<CardDescription>{m['salesReport.summary_laba']()}</CardDescription>
				<CardTitle class="text-xl tabular-nums text-emerald-600 dark:text-emerald-400">{formatRupiah(data.summary.laba)}</CardTitle>
			</CardHeader>
		</Card>
		<Card>
			<CardHeader>
				<CardDescription>{m['salesReport.summary_count']()}</CardDescription>
				<CardTitle class="text-xl tabular-nums">{data.summary.jumlahTransaksi}</CardTitle>
			</CardHeader>
		</Card>
	</div>

	<div class="grid gap-4 lg:grid-cols-2">
		<Card>
			<CardHeader>
				<CardTitle>{m['salesReport.chart_title']()}</CardTitle>
				<CardDescription>{m['salesReport.chart_desc']({ from: data.filters.from, to: data.filters.to })}</CardDescription>
			</CardHeader>
			<CardContent>
				<BarChart data={data.daily} height="h-56" />
			</CardContent>
		</Card>

		<Card>
			<CardHeader>
				<CardTitle>{m['salesReport.top_title']()}</CardTitle>
				<CardDescription>{m['salesReport.top_desc']()}</CardDescription>
			</CardHeader>
			<CardContent>
				<div class="rounded-lg border">
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head>{m['salesReport.col_product']()}</Table.Head>
								<Table.Head class="w-20 text-right">{m['salesReport.col_qty']()}</Table.Head>
								<Table.Head class="w-28 text-right">{m['salesReport.col_omzet']()}</Table.Head>
								<Table.Head class="w-28 text-right">{m['salesReport.col_laba']()}</Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each data.topProducts as p, i (p.name)}
								<Table.Row>
									<Table.Cell class="font-medium">
										<span class="mr-2 inline-flex size-5 items-center justify-center rounded-full bg-secondary text-xs font-semibold">{i + 1}</span>
										{p.name}
									</Table.Cell>
									<Table.Cell class="text-right tabular-nums">{formatNumber(p.qty)}</Table.Cell>
									<Table.Cell class="text-right tabular-nums">{formatNumber(p.omzet)}</Table.Cell>
									<Table.Cell class="text-right font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{formatNumber(p.laba)}</Table.Cell>
								</Table.Row>
							{:else}
								<Table.Row>
									<Table.Cell colspan={4} class="py-10 text-center text-muted-foreground">
										{m['salesReport.top_empty']()}
									</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				</div>
			</CardContent>
		</Card>
	</div>

	<Card>
		<CardHeader>
			<CardTitle>{m['salesReport.method_title']()}</CardTitle>
			<CardDescription>{m['salesReport.method_desc']()}</CardDescription>
		</CardHeader>
		<CardContent>
			<div class="rounded-lg border">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>{m['salesReport.col_method']()}</Table.Head>
							<Table.Head class="w-40 text-right">{m['salesReport.col_count']()}</Table.Head>
							<Table.Head class="w-40 text-right">{m['salesReport.col_omzet']()}</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each data.methods as mth (mth.method)}
							<Table.Row>
								<Table.Cell class="font-medium">{methodLabel[mth.method] ?? mth.method}</Table.Cell>
								<Table.Cell class="text-right tabular-nums">{formatNumber(mth.count)}</Table.Cell>
								<Table.Cell class="text-right font-semibold tabular-nums">{formatNumber(mth.omzet)}</Table.Cell>
							</Table.Row>
						{:else}
							<Table.Row>
								<Table.Cell colspan={3} class="py-10 text-center text-muted-foreground">
									{m['salesReport.method_empty']()}
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</div>
		</CardContent>
	</Card>
</div>
