<script lang="ts">
	import { page } from '$app/state';
	import { documentTitle } from '#lib/brand.svelte.js';
	import FileQuestionIcon from '@lucide/svelte/icons/file-question-mark';
	import Button from '#lib/components/unitati/Button.svelte';
	import EmptyState from '#lib/components/unitati/EmptyState.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import { m } from '#lib/paraglide/messages.js';

	/**
	 * Copy is chosen by status, not taken from `page.error.message`: those
	 * messages are English developer text (`'Not found'`) and the UI is es-ES (ADR 0008).
	 */
	const copy = $derived(
		page.status === 404
			? { title: m.error_not_found_title(), description: m.error_not_found_description() }
			: page.status === 403
				? { title: m.error_forbidden_title(), description: m.error_forbidden_description() }
				: { title: m.error_generic_title(), description: m.error_generic_description() }
	);
</script>

<svelte:head>
	<title>{documentTitle(copy.title)}</title>
</svelte:head>

<PageLayout variant="form">
	<EmptyState icon={FileQuestionIcon} title={copy.title} description={copy.description}>
		{#snippet action()}
			<Button href="/" variant="secondary">{m.error_back_home()}</Button>
		{/snippet}
	</EmptyState>
</PageLayout>
