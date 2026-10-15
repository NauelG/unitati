<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import { documentTitle } from '#lib/brand.svelte.js';
	import Button from '#lib/components/unitati/Button.svelte';
	import Field from '#lib/components/unitati/Field.svelte';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let busy = $state(false);

	/** What the person typed if the save was refused, so a mistake never costs them the text. */
	const failed = $derived(form && 'error' in form ? form : null);
</script>

<svelte:head>
	<title>{documentTitle(m.branding_title())}</title>
</svelte:head>

<PageLayout variant="form">
	<PageHeader title={m.branding_title()}>
		{#snippet summary()}{m.branding_lede()}{/snippet}
	</PageHeader>

	<form
		method="POST"
		action="?/save"
		use:enhance={() => {
			busy = true;
			return async ({ result, update }) => {
				await update({ reset: false });
				busy = false;
				if (result.type === 'success') toast.success(m.branding_saved());
			};
		}}
		class="mt-[var(--space-6)] space-y-[var(--space-4)]"
	>
		<Field
			label={m.branding_product_name()}
			name="productName"
			value={failed?.productName ?? data.brand.productName}
			maxlength={data.productNameMax}
			hint={m.branding_product_name_hint()}
			error={failed?.error}
			required
		/>

		<div class="flex items-center gap-[var(--space-3)]">
			<Button type="submit" {busy}>{m.branding_save()}</Button>
		</div>
	</form>
</PageLayout>
