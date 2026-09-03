<script lang="ts">
	import { formatNumber } from '$lib/utils';

	let {
		data,
		height = 'h-32'
	}: { data: Array<{ label: string; value: number }>; height?: string } = $props();

	const max = $derived(Math.max(1, ...data.map((d) => d.value)));
	const hasData = $derived(data.some((d) => d.value > 0));
</script>

{#if !hasData}
	<div class="flex {height} items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
		Belum ada data penjualan.
	</div>
{:else}
	<div class="flex flex-col gap-2">
		<div class="flex {height} items-end gap-1">
			{#each data as d (d.label)}
				<div class="flex h-full flex-1 flex-col justify-end" title="{d.label}: Rp {formatNumber(d.value)}">
					<div
						class="w-full rounded-t bg-primary/80 transition-all hover:bg-primary"
						style="height: {Math.max(2, Math.round((d.value / max) * 100))}%"
					></div>
				</div>
			{/each}
		</div>
		<div class="flex gap-1 text-[10px] text-muted-foreground">
			{#each data as d (d.label)}
				<div class="flex-1 text-center">{d.label}</div>
			{/each}
		</div>
	</div>
{/if}
