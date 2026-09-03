<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import BadgeCheckIcon from '@lucide/svelte/icons/badge-check';
	import LanguagesIcon from '@lucide/svelte/icons/languages';
	import LockIcon from '@lucide/svelte/icons/lock';
	import PanelLeftIcon from '@lucide/svelte/icons/panel-left';
	import * as m from '$lib/paraglide/messages.js';

	let { data } = $props<{ data?: { user: { email: string; name: string } | null } }>();
</script>

<svelte:head>
	<title>{m['app.name']()} — {m['app.tagline']()}</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-5xl flex-col gap-6">
	<div class="space-y-2">
		<p class="text-sm font-medium text-primary">Template ready</p>
		<h1 class="text-3xl font-semibold tracking-tight">{m['home.title']()}</h1>
		<p class="max-w-2xl text-sm text-muted-foreground">{m['home.description']()}</p>
	</div>

	<div class="grid gap-4 md:grid-cols-3">
		<Card>
			<CardHeader>
				<CardTitle class="flex items-center gap-2 text-base"><PanelLeftIcon class="size-4" /> App shell</CardTitle>
				<CardDescription>{m['home.shell']()}</CardDescription>
			</CardHeader>
		</Card>
		<Card>
			<CardHeader>
				<CardTitle class="flex items-center gap-2 text-base"><LockIcon class="size-4" /> Auth</CardTitle>
				<CardDescription>{m['home.auth']()}</CardDescription>
			</CardHeader>
		</Card>
		<Card>
			<CardHeader>
				<CardTitle class="flex items-center gap-2 text-base"><LanguagesIcon class="size-4" /> i18n</CardTitle>
				<CardDescription>{m['home.i18n']()}</CardDescription>
			</CardHeader>
		</Card>
	</div>

	<Card>
		<CardHeader>
			<CardTitle>{m['home.next_title']()}</CardTitle>
			<CardDescription>{m['home.next_description']()}</CardDescription>
		</CardHeader>
		<CardContent class="flex flex-wrap gap-3">
			<a href="/app"><Button>{m['nav.app']()}</Button></a>
			{#if data?.user}
				<a href="/profile"><Button variant="outline"><BadgeCheckIcon class="mr-2 size-4" /> Profile</Button></a>
			{:else}
				<a href="/login"><Button variant="outline">Login</Button></a>
			{/if}
		</CardContent>
	</Card>
</div>
