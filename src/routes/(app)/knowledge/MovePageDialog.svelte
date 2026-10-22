<script lang="ts">
	import { deserialize, enhance } from '$app/forms';
	import { page as route } from '$app/state';
	import Alert from '#lib/components/unitati/Alert.svelte';
	import Button from '#lib/components/unitati/Button.svelte';
	import Dialog from '#lib/components/unitati/Dialog.svelte';
	import FormActions from '#lib/components/unitati/FormActions.svelte';
	import FormError from '#lib/components/unitati/FormError.svelte';
	import SelectField from '#lib/components/unitati/SelectField.svelte';
	import { parentOptions, type PageTreeEntry } from '#lib/components/unitati/page-tree.js';
	import type { SpaceAudience } from '#lib/domain/knowledge.js';
	import { m } from '#lib/paraglide/messages.js';

	interface Props {
		open: boolean;
		onOpenChange: (open: boolean) => void;
		page: { id: string; title: string; parentId: string | null };
		currentSpaceId: string;
		spaces: { id: string; name: string; audience: SpaceAudience }[];
		/** Each space's tree, for the parent picker. */
		trees: Record<string, PageTreeEntry[]>;
	}

	type Preview = { subtreeCount: number; audienceChanges: boolean; toAudience: SpaceAudience };

	let { open, onOpenChange, page, currentSpaceId, spaces, trees }: Props = $props();

	let spaceId = $state<string | null>(null);
	let parentId = $state<string | null>(null);
	let pending = $state(false);
	let message = $state<string | null>(null);
	let preview = $state<{ status: 'loading' } | { status: 'ready'; value: Preview } | null>(null);

	$effect(() => {
		if (open) {
			spaceId = currentSpaceId;
			parentId = page.parentId;
			message = null;
		}
	});

	const spaceOptions = $derived(spaces.map(({ id, name }) => ({ value: id, label: name })));
	const options = $derived(parentOptions(trees[spaceId ?? currentSpaceId] ?? [], page.id));
	const unchanged = $derived(spaceId === currentSpaceId && parentId === page.parentId);

	function pages(count: number): string {
		return count === 1 ? m.knowledge_pages_one() : m.knowledge_pages_other({ count });
	}

	/**
	 * Asks the server what this destination would do (`?/preview`) before the
	 * button enables: the count the confirmation shows is the one `?/move` then
	 * takes back, so a stale number is refused by the domain.
	 */
	let ticket = 0;
	$effect(() => {
		if (!open || !spaceId || unchanged) {
			preview = null;
			return;
		}
		const current = ++ticket;
		const body = new FormData();
		body.set('id', page.id);
		body.set('spaceId', spaceId);
		body.set('parentId', parentId ?? '');
		preview = { status: 'loading' };
		message = null;

		void (async () => {
			const response = await fetch(`${route.url.pathname}?/preview`, {
				method: 'POST',
				body,
				headers: { 'x-sveltekit-action': 'true' }
			});
			const result = deserialize(await response.text());
			if (current !== ticket) return;
			if (result.type === 'success' && result.data?.preview) {
				preview = { status: 'ready', value: result.data.preview as Preview };
			} else {
				preview = null;
				message =
					result.type === 'failure' ? ((result.data?.message as string | undefined) ?? null) : null;
			}
		})();
	});

	const ready = $derived(preview?.status === 'ready' ? preview.value : null);
	const confirmation = $derived(
		ready?.audienceChanges
			? ready.toAudience === 'portal'
				? m.knowledge_page_move_to_portal({ pages: pages(ready.subtreeCount) })
				: m.knowledge_page_move_to_staff({ pages: pages(ready.subtreeCount) })
			: null
	);
</script>

<Dialog
	{open}
	{onOpenChange}
	{pending}
	title={m.knowledge_page_move_title({ title: page.title })}
	description={m.knowledge_page_move_lede()}
>
	<form
		method="POST"
		action="?/move"
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
				await update({ reset: false });
				pending = false;
				onOpenChange(false);
			};
		}}
	>
		<input type="hidden" name="id" value={page.id} />
		<input
			type="hidden"
			name="confirmedCount"
			value={ready?.audienceChanges ? ready.subtreeCount : ''}
		/>
		<SelectField
			label={m.knowledge_page_move_space()}
			name="spaceId"
			options={spaceOptions}
			bind:value={spaceId}
			onchange={() => (parentId = null)}
		/>
		<SelectField
			label={m.knowledge_page_move_parent()}
			name="parentId"
			placeholder={m.knowledge_page_parent_root()}
			{options}
			bind:value={parentId}
		/>
		{#if confirmation}
			<Alert tone="warning">{confirmation}</Alert>
		{:else if preview?.status === 'loading'}
			<p class="text-small text-[var(--ink-muted)]" aria-live="polite">
				{m.knowledge_page_move_checking()}
			</p>
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
			<Button type="submit" busy={pending} disabled={unchanged || ready === null}>
				{m.knowledge_page_move_confirm()}
			</Button>
		</FormActions>
	</form>
</Dialog>
