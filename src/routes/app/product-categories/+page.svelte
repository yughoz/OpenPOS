<script lang="ts">
	import SimpleCrud from '$lib/components/simple-crud.svelte';
	import * as m from '$lib/paraglide/messages.js';

	let { data } = $props();

	const entity = m['nav.product_categories']();
</script>

<svelte:head>
	<title>{entity} — OpenPOS</title>
</svelte:head>

<SimpleCrud
	{entity}
	title={entity}
	description={m['categories.description']()}
	items={data.items.items}
	columns={[{ key: 'name', label: m['common.name']() }]}
	fields={[{ name: 'name', label: m['common.name'](), required: true, placeholder: m['categories.name_placeholder'](), maxlength: 200 }]}
	q={data.q}
	page={data.items.page}
	totalPages={data.items.totalPages}
	totalItems={data.items.totalItems}
/>
