<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import { documentTitle } from '#lib/brand.svelte.js';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import Switch from '#lib/components/unitati/Switch.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{documentTitle(m.directory_permissions_title())}</title>
</svelte:head>

<PageLayout variant="form">
	<PageHeader title={m.directory_permissions_title()}>
		{#snippet summary()}{m.directory_permissions_lede()}{/snippet}
	</PageHeader>

	<form
		method="POST"
		action="?/save"
		use:enhance={() =>
			async ({ result, update }) => {
				await update({ reset: false });
				if (result.type === 'success') toast.success(m.directory_permissions_saved());
			}}
		class="mt-[var(--space-6)] flex items-start justify-between gap-[var(--space-4)]"
	>
		<input type="hidden" name="enabled" value={String(!data.techniciansEditDirectory)} />
		<div class="space-y-[var(--space-1)]">
			<p id="technicians-edit-label" class="text-sm font-semibold text-[var(--ink)]">
				{m.directory_permissions_technicians_label()}
			</p>
			<p class="text-sm text-[var(--ink-muted)]">{m.directory_permissions_technicians_hint()}</p>
		</div>
		<Switch
			type="submit"
			checked={data.techniciansEditDirectory}
			label={m.directory_permissions_technicians_label()}
			aria-describedby="technicians-edit-label"
		/>
	</form>
</PageLayout>
