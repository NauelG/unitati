<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '#lib/components/unitati/Button.svelte';
	import { field } from '#lib/components/unitati/Field.svelte';
	import FormError from '#lib/components/unitati/FormError.svelte';
	import RichTextEditor from '#lib/components/unitati/RichTextEditor.svelte';
	import { m } from '#lib/paraglide/messages.js';

	interface Props {
		categories: { id: string; name: string }[];
		error?: string | null;
	}

	let { categories, error = null }: Props = $props();

	const input = field().input();
	let body = $state('');
	let saving = $state(false);
</script>

<form
	method="POST"
	action="?/save"
	use:enhance={() => {
		saving = true;
		return async ({ result, update }) => {
			await update({ reset: false });
			saving = false;
			if (result.type === 'success') body = '';
		};
	}}
	class="space-y-[var(--space-3)]"
>
	<div class="flex flex-wrap gap-[var(--space-3)]">
		<label class="flex flex-col gap-[var(--space-1)]">
			<span class="text-label text-[var(--ink)]">{m.handover_agreements_category()}</span>
			<select name="categoryId" class={input} required>
				{#each categories as category (category.id)}
					<option value={category.id}>{category.name}</option>
				{/each}
			</select>
		</label>
		<label class="flex flex-col gap-[var(--space-1)]">
			<span class="text-label text-[var(--ink)]">{m.handover_agreements_direction()}</span>
			<select name="direction" class={input} required>
				<option value="delivery">{m.handover_direction_delivery()}</option>
				<option value="return">{m.handover_direction_return()}</option>
			</select>
		</label>
	</div>
	<RichTextEditor name="body" label={m.handover_agreements_body()} bind:value={body} />
	{#if error}
		<FormError>{error}</FormError>
	{/if}
	<div class="flex justify-end">
		<Button type="submit" size="sm" busy={saving}>{m.handover_agreements_create()}</Button>
	</div>
</form>
