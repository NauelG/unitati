<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '#lib/components/unitati/Button.svelte';
	import Field from '#lib/components/unitati/Field.svelte';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	/** The refusal for a row, so the sentence appears under the row that caused it. */
	const rowError = (id: string) =>
		form && 'id' in form && form.id === id && 'message' in form ? form.message : undefined;
	const createError = $derived(
		form && 'action' in form && form.action === 'create' && 'message' in form
			? form.message
			: undefined
	);
</script>

<svelte:head>
	<title>{m.queues_title()} · {m.app_name()}</title>
</svelte:head>

<PageLayout variant="form">
	<PageHeader title={m.queues_title()}>
		{#snippet summary()}{m.queues_lede()}{/snippet}
	</PageHeader>

	<form
		method="POST"
		action="?/create"
		use:enhance
		class="mt-[var(--space-6)] flex items-end gap-[var(--space-3)]"
	>
		<Field label={m.queues_name()} name="name" error={createError} required class="w-full" />
		<Button type="submit">{m.queues_create()}</Button>
	</form>

	{#if data.queues.length === 0}
		<p class="mt-[var(--space-6)] text-sm text-[var(--ink-muted)]">{m.queues_empty()}</p>
	{:else}
		<ul class="mt-[var(--space-6)] divide-y divide-[var(--border)]">
			{#each data.queues as queue (queue.id)}
				<li class="py-[var(--space-3)]">
					<div class="flex items-end gap-[var(--space-2)]">
						<form
							method="POST"
							action="?/rename"
							use:enhance
							class="flex flex-1 items-end gap-[var(--space-2)]"
						>
							<input type="hidden" name="id" value={queue.id} />
							<Field
								label={m.queues_name()}
								name="name"
								value={queue.name}
								error={rowError(queue.id)}
								required
								class="w-full"
							/>
							<Button type="submit" variant="secondary" size="sm">{m.queues_rename()}</Button>
						</form>
						<form method="POST" action="?/delete" use:enhance>
							<input type="hidden" name="id" value={queue.id} />
							<Button type="submit" variant="ghost" size="sm">{m.queues_delete()}</Button>
						</form>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</PageLayout>
