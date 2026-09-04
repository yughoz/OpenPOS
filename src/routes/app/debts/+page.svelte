<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Table from '$lib/components/ui/table';
	import * as Select from '$lib/components/ui/select';
	import HandCoinsIcon from '@lucide/svelte/icons/hand-coins';
	import * as m from '$lib/paraglide/messages.js';
	import { formatDateTime, formatNumber, formatRupiah } from '$lib/utils';
	import { currency } from '$lib/currency.svelte';

	interface DebtItem {
		id: string;
		customer: string;
		transaction: string;
		total: number;
		paid: number;
		status: string;
		note: string;
		created: string;
		sisa: number;
		expand?: {
			customer?: { name: string };
			transaction?: { code: string; transaction_date: string };
		};
	}

	let { data } = $props<{
		data: {
			rows: DebtItem[];
			totalItems: number;
			summary: { totalPiutang: number; customerCount: number };
		};
	}>();

	let bayarDebt = $state<DebtItem | null>(null);
	let bayarAmount = $state('');
	let bayarMethod = $state<'cash' | 'qris' | 'debit' | 'ewallet'>('cash');
	let bayarNote = $state('');

	function openBayar(d: DebtItem) {
		bayarDebt = d;
		bayarAmount = String(d.sisa);
		bayarMethod = 'cash';
		bayarNote = '';
	}

	const payEnhance = () =>
		() =>
		async ({ update, result }: { update: () => Promise<void>; result: { type: string; data?: unknown } }) => {
			await update();
			if (result.type === 'failure') {
				toast.error(String((result.data as { error?: string } | undefined)?.error ?? m['common.save_error']()));
			} else {
				toast.success(m['debts.pay_saved_toast']());
				bayarDebt = null;
			}
		};

	const methodLabel: Record<string, string> = {
		cash: m['pos.method_cash'](),
		qris: m['pos.method_qris'](),
		debit: m['pos.method_debit'](),
		ewallet: m['pos.method_ewallet']()
	};

	const statusBadge = (status: string) => {
		if (status === 'paid') return { text: m['debts.status_paid'](), cls: 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-400' };
		if (status === 'partial') return { text: m['debts.status_partial'](), cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' };
		return { text: m['debts.status_unpaid'](), cls: 'bg-destructive/15 text-destructive' };
	};
</script>

<svelte:head>
	<title>{m['nav.debts']()} — OpenPOS</title>
</svelte:head>

<div class="flex w-full flex-col gap-6">
	<div class="space-y-1">
		<h1 class="text-2xl font-semibold tracking-tight md:text-3xl">{m['nav.debts']()}</h1>
		<p class="max-w-2xl text-sm text-muted-foreground">{m['debts.description']()}</p>
	</div>

	<div class="grid gap-4 md:grid-cols-3">
		<button class="text-left" onclick={() => (bayarDebt = null)}>
			<div class="rounded-xl border bg-card p-4 shadow-sm">
				<div class="text-sm text-muted-foreground">{m['debts.total_outstanding']()}</div>
				<div class="mt-1 text-2xl font-bold tabular-nums text-destructive">{formatRupiah(data.summary.totalPiutang)}</div>
			</div>
		</button>
		<div class="rounded-xl border bg-card p-4 shadow-sm">
			<div class="text-sm text-muted-foreground">{m['debts.debt_customers']()}</div>
			<div class="mt-1 flex items-center gap-2 text-2xl font-bold">
				<HandCoinsIcon class="size-6 text-muted-foreground" />
				{data.summary.customerCount}
			</div>
		</div>
		<div class="rounded-xl border bg-card p-4 shadow-sm">
			<div class="text-sm text-muted-foreground">{m['debts.debt_invoices']()}</div>
			<div class="mt-1 text-2xl font-bold tabular-nums">{data.totalItems}</div>
		</div>
	</div>

	<div class="rounded-lg border">
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>{m['pos.customer']()}</Table.Head>
					<Table.Head class="w-40">{m['debts.col_nota']()}</Table.Head>
					<Table.Head class="w-36">{m['debts.col_date']()}</Table.Head>
					<Table.Head class="w-28 text-right">{m['debts.col_debt']()}</Table.Head>
					<Table.Head class="w-28 text-right">{m['debts.col_paid']()}</Table.Head>
					<Table.Head class="w-28 text-right">{m['debts.col_remaining']()}</Table.Head>
					<Table.Head class="w-28">{m['debts.col_status']()}</Table.Head>
					<Table.Head class="w-24 text-right">{m['common.actions']()}</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each data.rows as d (d.id)}
					<Table.Row class={d.status === 'paid' ? 'opacity-50' : ''}>
						<Table.Cell class="font-medium">{d.expand?.customer?.name ?? '—'}</Table.Cell>
						<Table.Cell class="font-mono text-xs">{d.expand?.transaction?.code ?? '—'}</Table.Cell>
						<Table.Cell class="whitespace-nowrap text-muted-foreground">{formatDateTime(d.created)}</Table.Cell>
						<Table.Cell class="text-right tabular-nums">{formatNumber(d.total)}</Table.Cell>
						<Table.Cell class="text-right tabular-nums text-emerald-600 dark:text-emerald-400">{formatNumber(d.paid)}</Table.Cell>
						<Table.Cell class="text-right font-semibold tabular-nums">{formatNumber(d.sisa)}</Table.Cell>
						<Table.Cell>
							<span class="rounded-full px-2 py-0.5 text-xs font-medium {statusBadge(d.status).cls}">{statusBadge(d.status).text}</span>
						</Table.Cell>
						<Table.Cell class="text-right">
							{#if d.status !== 'paid'}
								<Button variant="outline" size="sm" class="h-7 px-2 text-xs" onclick={() => openBayar(d)}>
									{m['debts.pay']()}
								</Button>
							{/if}
						</Table.Cell>
					</Table.Row>
				{:else}
					<Table.Row>
						<Table.Cell colspan={8} class="py-10 text-center text-muted-foreground">
							{m['debts.empty']()}
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</div>
</div>

<!-- Dialog pelunasan -->
<Dialog.Root open={bayarDebt !== null} onOpenChange={(o) => (bayarDebt = o ? bayarDebt : null)}>
	{#if bayarDebt}
		<Dialog.Content class="sm:max-w-md">
			<Dialog.Header>
				<Dialog.Title>{m['debts.pay_title']()}</Dialog.Title>
				<Dialog.Description>
					{m['debts.pay_desc']({ name: bayarDebt.expand?.customer?.name ?? m['pos.customer'](), remaining: formatRupiah(bayarDebt.sisa) })}
				</Dialog.Description>
			</Dialog.Header>
			<form method="POST" action="?/pay" use:enhance={payEnhance()}>
				<input type="hidden" name="debt_id" value={bayarDebt.id} />
				<div class="grid gap-4 py-2">
					<div class="grid gap-2">
						<Label for="pay-amount">{m['debts.pay_amount']({ symbol: currency.symbol })}</Label>
						<Input id="pay-amount" name="amount" bind:value={bayarAmount} type="number" min="1" max={bayarDebt.sisa} required />
					</div>
					<div class="grid gap-2">
						<Label>{m['debts.method']()}</Label>
						<Select.Root type="single" bind:value={bayarMethod}>
							<Select.Trigger class="w-full">{methodLabel[bayarMethod]}</Select.Trigger>
							<Select.Content>
								<Select.Item value="cash" label={m['pos.method_cash']()} />
								<Select.Item value="qris" label={m['pos.method_qris']()} />
								<Select.Item value="debit" label={m['pos.method_debit']()} />
								<Select.Item value="ewallet" label={m['pos.method_ewallet']()} />
							</Select.Content>
						</Select.Root>
					</div>
					<div class="grid gap-2">
						<Label for="pay-note">{m['common.note']()}</Label>
						<Input id="pay-note" name="note" bind:value={bayarNote} placeholder={m['debts.note_placeholder']()} maxlength={200} />
					</div>
				</div>
				<Dialog.Footer>
					<Button type="button" variant="outline" onclick={() => (bayarDebt = null)}>{m['common.cancel']()}</Button>
					<Button type="submit">{m['debts.pay_save']()}</Button>
				</Dialog.Footer>
			</form>
		</Dialog.Content>
	{/if}
</Dialog.Root>
