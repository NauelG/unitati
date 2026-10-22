<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '#lib/components/unitati/Button.svelte';
	import Dialog from '#lib/components/unitati/Dialog.svelte';
	import Field from '#lib/components/unitati/Field.svelte';
	import FormActions from '#lib/components/unitati/FormActions.svelte';
	import FormError from '#lib/components/unitati/FormError.svelte';
	import SelectField from '#lib/components/unitati/SelectField.svelte';
	import { parentOptions, type PageTreeEntry } from '#lib/components/unitati/page-tree.js';
	import { PAGE_TITLE_MAX } from '#lib/domain/knowledge.js';
	import { m } from '#lib/paraglide/messages.js';

	interface Props {
		open: boolean;
		onOpenChange: (open: boolean) => void;
		spaceId: string;
		spaceName: string;
		/** The pages of that space, for the parent picker. */
		entries: PageTreeEntry[];
		/** Preselected parent: the page a "Nueva subpágina" starts from. `null` is the root. */
		parentId?: string | null;
		/** Where the form posts: the screen's own `?/create`. */
		action?: string;
	}

	let {
		open,
		onOpenChange,
		spaceId,
		spaceName,
		entries,
		parentId = null,
		action = '?/create'
	}: Props = $props();

	let pending = $state(false);
	let message = $state<string | null>(null);
	let parent = $state<string | null>(null);
	let title = $state('');

	// Each opening starts clean, on the parent it was asked for.
	$effect(() => {
		if (open) {
			parent = parentId;
			title = '';
			message = null;
		}
	});

	const options = $derived(parentOptions(entries));
	const parentTitle = $derived(entries.find((entry) => entry.id === parentId)?.title);
</script>

<Dialog
	{open}
	{onOpenChange}
	{pending}
	title={parentTitle
		? m.knowledge_page_new_child_of({ title: parentTitle })
		: m.knowledge_page_new_in({ space: spaceName })}
	description={m.knowledge_page_new_lede()}
>
	<form
		method="POST"
		{action}
		class="flex flex-col gap-[var(--space-4)]"
		use:enhance={() => {
			pending = true;
			message = null;
			return async ({ result, update }) => {
				if (result.type === 'failure') {
					message = (result.data?.message as string | undefined) ?? null;
					pending = false;
					return;
				}
				await update();
				pending = false;
				onOpenChange(false);
			};
		}}
	>
		<input type="hidden" name="spaceId" value={spaceId} />
		<Field
			label={m.knowledge_page_field_title()}
			name="title"
			bind:value={title}
			maxlength={PAGE_TITLE_MAX}
			required
			autocomplete="off"
		/>
		{#if options.length > 0}
			<SelectField
				label={m.knowledge_page_field_parent()}
				name="parentId"
				placeholder={m.knowledge_page_parent_root()}
				{options}
				bind:value={parent}
			/>
		{/if}
		<FormError>{message}</FormError>
		<FormActions>
			<Button
				type="button"
				variant="secondary"
				disabled={pending}
				onclick={() => onOpenChange(false)}
			>
				{m.knowledge_page_cancel()}
			</Button>
			<Button type="submit" busy={pending}>{m.knowledge_page_create()}</Button>
		</FormActions>
	</form>
</Dialog>
