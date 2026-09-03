<script lang="ts">
	import SimpleCrud from '$lib/components/simple-crud.svelte';
	import * as m from '$lib/paraglide/messages.js';

	let { data } = $props();

	const fields = [
		{ name: 'name', label: m['common.name'](), required: true, placeholder: m['customers.name_placeholder'](), maxlength: 200 },
		{ name: 'gender', label: m['customers.gender'](), placeholder: 'L', maxlength: 1 },
		{ name: 'phone', label: m['common.phone'](), placeholder: '08xx', maxlength: 100 },
		{ name: 'address', label: m['common.address'](), type: 'textarea' as const, maxlength: 300 }
	];
</script>

<svelte:head>
	<title>{m['nav.customers']()} — OpenPOS</title>
</svelte:head>

<SimpleCrud
	entity={m['nav.customers']()}
	title={m['nav.customers']()}
	description={m['customers.description']()}
	items={data.items.items}
	columns={[
		{ key: 'name', label: m['common.name']() },
		{ key: 'gender', label: m['customers.gender'](), class: 'w-20' },
		{ key: 'phone', label: m['common.phone'](), class: 'w-40' },
		{ key: 'address', label: m['common.address']() }
	]}
	{fields}
	q={data.q}
	page={data.items.page}
	totalPages={data.items.totalPages}
	totalItems={data.items.totalItems}
/>
