<script lang="ts">
	import SimpleCrud from '$lib/components/simple-crud.svelte';
	import * as m from '$lib/paraglide/messages.js';

	let { data } = $props();

	const fields = [
		{ name: 'name', label: m['common.name'](), required: true, placeholder: m['suppliers.name_placeholder'](), maxlength: 200 },
		{ name: 'phone', label: m['common.phone'](), placeholder: '08xx', maxlength: 100 },
		{ name: 'address', label: m['common.address'](), type: 'textarea' as const, maxlength: 300 },
		{ name: 'description', label: m['suppliers.note'](), type: 'textarea' as const }
	];
</script>

<svelte:head>
	<title>{m['nav.suppliers']()} — OpenPOS</title>
</svelte:head>

<SimpleCrud
	entity={m['nav.suppliers']()}
	title={m['nav.suppliers']()}
	description={m['suppliers.description']()}
	items={data.items.items}
	columns={[
		{ key: 'name', label: m['common.name']() },
		{ key: 'phone', label: m['common.phone'](), class: 'w-40' },
		{ key: 'address', label: m['common.address']() }
	]}
	{fields}
	q={data.q}
	page={data.items.page}
	totalPages={data.items.totalPages}
	totalItems={data.items.totalItems}
/>
