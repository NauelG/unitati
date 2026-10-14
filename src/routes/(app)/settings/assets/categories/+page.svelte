<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import NameCatalogue from '../NameCatalogue.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<NameCatalogue
	title={m.catalogue_categories_title()}
	lede={m.catalogue_categories_lede()}
	newLabel={m.catalogue_new_category()}
	emptyMessage={m.catalogue_empty_categories()}
	entries={data.entries}
	result={form}
/>
