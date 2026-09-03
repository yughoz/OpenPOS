<script lang="ts">
	import * as Table from '$lib/components/ui/table';
	import * as m from '$lib/paraglide/messages.js';
	import { formatDateTime } from '$lib/utils';
	import type { MovementRow } from '$lib/types';

	let { rows, emptyText = m['movement.default_empty']() }: { rows: MovementRow[]; emptyText?: string } = $props();

	const typeLabel: Record<string, string> = {
		in: m['movement.type_in'](),
		out: m['movement.type_out'](),
		sale: m['movement.type_sale'](),
		sale_void: m['movement.type_sale_void'](),
		adjustment: m['movement.type_adjustment']()
	};

	const badgeBase =
		'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border';
	function badgeClass(type: string): string {
		if (type === 'in' || type === 'sale_void')
			return `${badgeBase} border-transparent bg-emerald-600/15 text-emerald-700 dark:text-emerald-400`;
		if (type === 'adjustment')
			return `${badgeBase} border-transparent bg-secondary text-secondary-foreground`;
		return `${badgeBase} text-foreground`;
	}
</script>

<div class="rounded-lg border">
	<Table.Root>
		<Table.Header>
			<Table.Row>
				<Table.Head class="w-36">{m['movement.col_time']()}</Table.Head>
				<Table.Head>{m['movement.col_product']()}</Table.Head>
				<Table.Head class="w-16 text-right">{m['movement.col_qty']()}</Table.Head>
				<Table.Head class="w-28">{m['movement.col_type']()}</Table.Head>
				<Table.Head class="w-36">{m['movement.col_supplier']()}</Table.Head>
				<Table.Head class="w-32">{m['movement.col_officer']()}</Table.Head>
				<Table.Head>{m['movement.col_note']()}</Table.Head>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each rows as row (row.id)}
				<Table.Row>
					<Table.Cell class="whitespace-nowrap text-muted-foreground">{formatDateTime(row.moved_at)}</Table.Cell>
					<Table.Cell class="font-medium">{row.expand?.product?.name ?? '—'}</Table.Cell>
					<Table.Cell class="text-right font-semibold tabular-nums">
						{row.type === 'in' || row.type === 'sale_void' ? '+' : row.type === 'out' || row.type === 'sale' ? '−' : '±'}{row.qty}
					</Table.Cell>
					<Table.Cell>
						<span class={badgeClass(row.type)}>{typeLabel[row.type] ?? row.type}</span>
					</Table.Cell>
					<Table.Cell class="text-muted-foreground">{row.expand?.supplier?.name ?? '—'}</Table.Cell>
					<Table.Cell class="text-muted-foreground">{row.expand?.user?.name ?? '—'}</Table.Cell>
					<Table.Cell class="text-muted-foreground">{row.note || row.reference || '—'}</Table.Cell>
				</Table.Row>
			{:else}
				<Table.Row>
					<Table.Cell colspan={7} class="py-10 text-center text-muted-foreground">{emptyText}</Table.Cell>
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>
</div>
