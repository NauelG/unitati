<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '#lib/components/unitati/Button.svelte';
	import FormError from '#lib/components/unitati/FormError.svelte';
	import RichTextEditor from '#lib/components/unitati/RichTextEditor.svelte';
	import { m } from '#lib/paraglide/messages.js';

	interface Props {
		direction: 'delivery' | 'return';
		categoryId?: string | null;
		initialBody: string;
		submitLabel: string;
		error?: string | null;
	}

	let { direction, categoryId = null, initialBody, submitLabel, error = null }: Props = $props();

	// Writable derived: follows the saved text when the page reloads, and is the draft while typing.
	let body = $derived(initialBody);
	let saving = $state(false);
</script>

<form
	method="POST"
	action="?/save"
	use:enhance={() => {
		saving = true;
		return async ({ update }) => {
			await update({ reset: false });
			saving = false;
		};
	}}
	class="space-y-[var(--space-3)]"
>
	<input type="hidden" name="direction" value={direction} />
	<input type="hidden" name="categoryId" value={categoryId ?? ''} />
	<RichTextEditor name="body" label={m.handover_agreements_body()} bind:value={body} />
	{#if error}
		<FormError>{error}</FormError>
	{/if}
	<div class="flex justify-end">
		<Button type="submit" size="sm" busy={saving}>{submitLabel}</Button>
	</div>
</form>
