<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import { documentTitle, productName } from '#lib/brand.svelte.js';
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

	/** What an empty field prints: the same message the label sheet falls back to. */
	const fallback = $derived(m.labels_owned_by({ name: productName() }));

	// Seeded from the stored text (or what was refused), then owned by the editor.
	let ownerText = $state('');
	let seeded = false;
	$effect.pre(() => {
		if (seeded) return;
		seeded = true;
		ownerText = failed?.ownerText ?? data.ownerText ?? '';
	});

	const printed = $derived(ownerText.trim() || fallback);
</script>

<svelte:head>
	<title>{documentTitle(m.label_settings_title())}</title>
</svelte:head>

<PageLayout variant="form">
	<PageHeader title={m.label_settings_title()}>
		{#snippet summary()}{m.label_settings_lede()}{/snippet}
	</PageHeader>

	<form
		method="POST"
		action="?/save"
		use:enhance={() => {
			busy = true;
			return async ({ result, update }) => {
				await update({ reset: false });
				busy = false;
				if (result.type === 'success') toast.success(m.label_settings_saved());
			};
		}}
		class="mt-[var(--space-6)] space-y-[var(--space-4)]"
	>
		<Field
			label={m.label_settings_owner()}
			name="ownerText"
			bind:value={ownerText}
			maxlength={data.ownerTextMax}
			placeholder={fallback}
			autocomplete="off"
			hint={m.label_settings_owner_hint({ fallback, max: data.ownerTextMax })}
			error={failed?.error ?? undefined}
		/>

		<p class="text-small text-[var(--ink-muted)]" data-owner-preview>
			{m.label_settings_preview({ text: printed })}
		</p>

		<div class="flex items-center gap-[var(--space-3)]">
			<Button type="submit" {busy}>{m.label_settings_save()}</Button>
		</div>
	</form>
</PageLayout>
