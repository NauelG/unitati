<script lang="ts">
	import { untrack } from 'svelte';
	import { superForm } from 'sveltekit-superforms';
	import Button from '#lib/components/unitati/Button.svelte';
	import Field from '#lib/components/unitati/Field.svelte';
	import SelectField from '#lib/components/unitati/SelectField.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const { form, errors, enhance, submitting } = superForm(untrack(() => data.form));

	const modelOptions = $derived(
		data.models.map((entry) => ({
			value: entry.id,
			label: `${entry.manufacturerName} · ${entry.name}`
		}))
	);
</script>

<svelte:head>
	<title>{m.asset_edit_title({ tag: data.assetTag })} · {m.app_name()}</title>
</svelte:head>

<div class="mx-auto max-w-2xl">
	<h1 class="font-display text-2xl font-semibold text-[var(--ink)]">
		{m.asset_edit_title({ tag: data.assetTag })}
	</h1>
	<p class="mt-2 text-[var(--ink-muted)]">{m.asset_edit_lede()}</p>

	<form method="POST" use:enhance class="mt-[var(--space-6)] space-y-[var(--space-5)]">
		<Field
			label={m.asset_form_name()}
			name="name"
			bind:value={$form.name}
			error={$errors.name?.[0]}
			required
		/>

		<Field
			label={m.asset_form_tag()}
			name="assetTag"
			bind:value={$form.assetTag}
			error={$errors.assetTag?.[0]}
			required
		/>

		<Field
			label={m.asset_form_serial()}
			name="serial"
			bind:value={$form.serial}
			error={$errors.serial?.[0]}
		/>

		<SelectField
			label={m.asset_form_model()}
			name="assetModelId"
			options={modelOptions}
			bind:value={$form.assetModelId}
			error={$errors.assetModelId?.[0]}
			required
		/>

		<label class="flex items-start gap-[var(--space-3)]">
			<input
				type="checkbox"
				name="shared"
				class="mt-0.5 size-4 accent-[var(--brand)]"
				bind:checked={$form.shared}
			/>
			<span>
				<span class="block text-[13px] leading-4 font-medium text-[var(--ink)]">
					{m.asset_form_shared()}
				</span>
				<span class="block text-[13px] leading-[18px] text-[var(--ink-muted)]">
					{m.asset_form_shared_hint()}
				</span>
			</span>
		</label>

		<div class="flex items-center gap-[var(--space-3)]">
			<Button type="submit" size="lg" disabled={$submitting}>
				{$submitting ? m.form_saving() : m.asset_form_submit_edit()}
			</Button>
			<Button href="/assets/{encodeURIComponent(data.assetTag)}" variant="ghost" size="lg">
				{m.form_cancel()}
			</Button>
		</div>
	</form>
</div>
