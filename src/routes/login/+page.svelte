<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { CatIcon, LoaderCircle } from '@lucide/svelte';
	import * as m from '$lib/paraglide/messages.js';

	let { form } = $props<{ form?: { error?: string } }>();
	let isLoading = $state(false);
</script>

<svelte:head>
	<title>Login — OpenPOS</title>
</svelte:head>

<div class="flex min-h-svh items-center justify-center p-4">
	<div class="w-full max-w-sm space-y-6">
		<div class="text-center">
			<div class="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
				<CatIcon class="size-6" />
			</div>
			<h1 class="text-2xl font-bold">Login</h1>
			<p class="mt-1 text-sm text-muted-foreground">{m['login.subtitle']()}</p>
		</div>

		<form method="POST" class="space-y-4" onsubmit={() => isLoading = true}>
			{#if form?.error}
				<div class="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
					{form.error}
				</div>
			{/if}

			<div class="space-y-2">
				<Label for="email">Email</Label>
				<Input id="email" name="email" type="email" placeholder="kamu@email.com" required autocomplete="email" />
			</div>

			<div class="space-y-2">
				<Label for="password">Password</Label>
				<Input id="password" name="password" type="password" placeholder="••••••••" required autocomplete="current-password" />
			</div>

			<Button type="submit" class="w-full" disabled={isLoading}>
				{#if isLoading}
					<LoaderCircle class="mr-2 size-4 animate-spin" /> Loading...
				{:else}
					Login
				{/if}
			</Button>
		</form>

		<p class="text-center text-xs text-muted-foreground">
			{m['login.no_account']()}
		</p>
	</div>
</div>
