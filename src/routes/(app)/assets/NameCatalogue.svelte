<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '#lib/components/unitati/Button.svelte';
	import { field } from '#lib/components/unitati/Field.svelte';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import AssetsNav from './AssetsNav.svelte';

	interface Props {
		title: string;
		lede: string;
		newLabel: string;
		emptyMessage: string;
		entries: { id: string; name: string }[];
		/** The last action's result: a failure carries the message and, for a row, its id. */
		result: { action: string; message: string | null; id: string | null } | null | undefined;
	}

	let { title, lede, newLabel, emptyMessage, entries, result }: Props = $props();

	// The same input styling as `Field`, without its label: a row in a list is
	// labelled by its position, and a visible "Nombre" above every line is noise.
	const input = field().input();
</script>

<svelte:head>
	<title>{title} · {m.app_name()}</title>
</svelte:head>

<PageLayout variant="form">
	<PageHeader {title}>
		{#snippet summary()}{lede}{/snippet}
	</PageHeader>

	<AssetsNav showCatalogue />

	<form
		method="POST"
		action="?/create"
		use:enhance
		class="mt-[var(--space-6)] flex items-end gap-[var(--space-3)]"
	>
		<label class="flex flex-1 flex-col gap-[var(--space-1)]">
			<span class="text-[13px] leading-4 font-medium text-[var(--ink)]">{newLabel}</span>
			<input name="name" class={input} required />
		</label>
		<Button type="submit">{m.catalogue_create()}</Button>
	</form>
	{#if result?.action === 'create' && result.message}
		<p class="mt-[var(--space-2)] text-[13px] leading-[18px] text-[var(--danger)]" role="alert">
			{result.message}
		</p>
	{/if}

	<div
		class="mt-[var(--space-6)] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)]"
	>
		{#if entries.length === 0}
			<p
				class="px-[var(--space-6)] py-[var(--space-12)] text-center text-sm text-[var(--ink-muted)]"
			>
				{emptyMessage}
			</p>
		{:else}
			<ul class="divide-y divide-[var(--border)]">
				{#each entries as entry (entry.id)}
					<li class="p-[var(--space-3)]">
						<form method="POST" use:enhance class="flex items-center gap-[var(--space-3)]">
							<input type="hidden" name="id" value={entry.id} />
							<input
								name="name"
								value={entry.name}
								aria-label={m.catalogue_column_name()}
								class={input}
								required
							/>
							<Button type="submit" formaction="?/rename" variant="secondary" size="sm">
								{m.catalogue_save()}
							</Button>
							<Button type="submit" formaction="?/delete" variant="ghost" size="sm">
								{m.catalogue_delete()}
							</Button>
						</form>
						{#if result?.id === entry.id && result.message}
							<p
								class="mt-[var(--space-2)] text-[13px] leading-[18px] text-[var(--danger)]"
								role="alert"
							>
								{result.message}
							</p>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</PageLayout>
