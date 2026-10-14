<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import NameCatalogue from '../NameCatalogue.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<NameCatalogue
	title={m.catalogue_manufacturers_title()}
	lede={m.catalogue_manufacturers_lede()}
	newLabel={m.catalogue_new_manufacturer()}
	emptyMessage={m.catalogue_empty_manufacturers()}
	entries={data.entries}
	result={form}
/>
