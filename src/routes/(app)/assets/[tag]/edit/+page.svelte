<script lang="ts">
	import { documentTitle } from '#lib/brand.svelte.js';
	import { untrack } from 'svelte';
	import { superForm } from 'sveltekit-superforms';
	import Button from '#lib/components/unitati/Button.svelte';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import AssetFields from '../../AssetFields.svelte';
	import CreateModelDialog from '../../CreateModelDialog.svelte';
	import { options } from '../../options';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const { form, errors, enhance, submitting } = superForm(untrack(() => data.form));

	let modelOpen = $state(false);

	const modelOptions = $derived(
		options(data.models, (entry) => `${entry.manufacturerName} · ${entry.name}`)
	);
</script>

<svelte:head>
	<title>{documentTitle(m.asset_edit_title({ tag: data.assetTag }))}</title>
</svelte:head>

<PageLayout variant="form">
	<PageHeader title={m.asset_edit_title({ tag: data.assetTag })}>
		{#snippet summary()}{m.asset_edit_lede()}{/snippet}
	</PageHeader>

	<form
		method="POST"
		action="?/save"
		use:enhance
		class="mt-[var(--space-6)] space-y-[var(--space-5)]"
	>
		<AssetFields
			bind:values={$form}
			errors={$errors}
			{modelOptions}
			tagRequired
			storedTag={data.assetTag}
			onaddmodel={() => (modelOpen = true)}
		/>

		<div class="flex items-center gap-[var(--space-3)]">
			<Button type="submit" size="lg" busy={$submitting}>
				{$submitting ? m.form_saving() : m.asset_form_submit_edit()}
			</Button>
			<Button href="/assets/{encodeURIComponent(data.assetTag)}" variant="ghost" size="lg">
				{m.form_cancel()}
			</Button>
		</div>
	</form>
</PageLayout>

<CreateModelDialog
	open={modelOpen}
	onOpenChange={(next) => (modelOpen = next)}
	action="?/createModel"
	form={data.modelForm}
	manufacturers={data.manufacturers}
	categories={data.categories}
	oncreated={(id) => {
		$form.assetModelId = id;
		modelOpen = false;
	}}
/>
