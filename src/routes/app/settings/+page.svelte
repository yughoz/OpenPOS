<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import * as m from '$lib/paraglide/messages.js';

	let { data } = $props<{
		data: {
			fields: Array<{ key: string; max?: number }>;
			values: Record<string, string>;
		};
	}>();

	const LABELS: Record<string, string> = {
		store_name: m['settings.store_name'](),
		store_description: m['settings.store_description'](),
		store_phone: m['settings.store_phone'](),
		prefix_nota: m['settings.prefix_nota'](),
		prefix_barcode: m['settings.prefix_barcode'](),
		receipt_size: m['settings.receipt_size'](),
		receipt_footer: m['settings.receipt_footer']()
	};
	const PLACEHOLDERS: Record<string, string> = {
		store_name: m['settings.ph_store_name'](),
		store_description: m['settings.ph_store_description'](),
		store_phone: m['settings.ph_store_phone'](),
		prefix_nota: m['settings.ph_prefix_nota'](),
		prefix_barcode: m['settings.ph_prefix_barcode'](),
		receipt_footer: m['settings.ph_receipt_footer']()
	};

	// nilai form lokal agar select ukuran struk bisa dua arah; default 80 bila belum pernah diset
	let vals = $state<Record<string, string>>({ ...data.values, receipt_size: data.values.receipt_size || '80' });

	const saveEnhance = (): SubmitFunction => () => async ({ update, result }) => {
		await update();
		if (result.type === 'failure') {
			toast.error(String((result.data as { error?: string } | undefined)?.error ?? m['common.save_error']()));
		} else {
			toast.success(m['settings.saved_toast']());
		}
	};

	type SubmitFunction = import('@sveltejs/kit').SubmitFunction;
</script>

<svelte:head>
	<title>{m['nav.settings']()} — OpenPOS</title>
</svelte:head>

<div class="flex w-full max-w-2xl flex-col gap-6">
	<div class="space-y-1">
		<h1 class="text-2xl font-semibold tracking-tight md:text-3xl">{m['nav.settings']()}</h1>
		<p class="text-sm text-muted-foreground">{m['settings.description']()}</p>
	</div>

	<Card>
		<CardHeader>
			<CardTitle>{m['settings.card_title']()}</CardTitle>
			<CardDescription>{m['settings.card_desc']()}</CardDescription>
		</CardHeader>
		<CardContent>
			<form method="POST" action="?/save" use:enhance={saveEnhance()} class="grid gap-4">
				{#each data.fields as f (f.key)}
					<div class="grid gap-2">
						<Label for={f.key}>{LABELS[f.key] ?? f.key}</Label>
						{#if f.key === 'receipt_size'}
							<input type="hidden" name="receipt_size" value={vals.receipt_size || '80'} />
							<Select.Root type="single" bind:value={vals.receipt_size}>
								<Select.Trigger class="w-full">{vals.receipt_size === '58' ? m['settings.size_58']() : m['settings.size_80']()}</Select.Trigger>
								<Select.Content>
									<Select.Item value="80" label={m['settings.size_80']()} />
									<Select.Item value="58" label={m['settings.size_58']()} />
								</Select.Content>
							</Select.Root>
						{:else}
							<Input id={f.key} name={f.key} bind:value={vals[f.key]} maxlength={f.max} placeholder={PLACEHOLDERS[f.key]} />
						{/if}
						{#if f.key === 'prefix_nota'}
							<p class="text-xs text-muted-foreground">{m['settings.nota_hint']({ prefix: vals.prefix_nota || 'POS' })}</p>
						{:else if f.key === 'prefix_barcode'}
							<p class="text-xs text-muted-foreground">{m['settings.barcode_hint']({ prefix: vals.prefix_barcode || '777' })}</p>
						{/if}
					</div>
				{/each}
				<div class="pt-1">
					<Button type="submit">{m['settings.save']()}</Button>
				</div>
			</form>
		</CardContent>
	</Card>
</div>
