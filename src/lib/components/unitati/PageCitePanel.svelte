<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from './Button.svelte';
	import SearchSelectField from './SearchSelectField.svelte';
	import WorkPanel from './WorkPanel.svelte';

	/**
	 * Picks one knowledge page and posts its code (#327): "Citar una página" on a
	 * ticket and "Añadir página" on a project are this panel with other words.
	 * Which pages are offered is the server's to decide (`searchUrl`); the action
	 * decides again, so a stale or forged code is refused there.
	 */
	interface Props {
		heading: string;
		label: string;
		placeholder: string;
		submitLabel: string;
		/** The form action, e.g. `?/citePage`; it receives the page's code as `pageTag`. */
		action: string;
		/** Answers `?q=` with `[{ value, label }]`. */
		searchUrl: string;
		/** The last refusal of this action, shown under the field. */
		error?: string;
	}

	let { heading, label, placeholder, submitLabel, action, searchUrl, error }: Props = $props();

	let value = $state<string | null>(null);
</script>

<WorkPanel {heading}>
	<form
		method="POST"
		{action}
		use:enhance={() =>
			async ({ update }) => {
				await update();
				value = null;
			}}
		class="space-y-[var(--space-2)]"
	>
		<SearchSelectField
			{label}
			name="pageTag"
			{placeholder}
			{searchUrl}
			{error}
			required
			bind:value
		/>
		<Button type="submit" size="sm" variant="secondary" disabled={!value}>{submitLabel}</Button>
	</form>
</WorkPanel>
