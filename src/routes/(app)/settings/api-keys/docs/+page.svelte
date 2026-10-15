<script lang="ts">
	import { documentTitle } from '#lib/brand.svelte.js';
	import Button from '#lib/components/unitati/Button.svelte';
	import EmptyState from '#lib/components/unitati/EmptyState.svelte';
	import MethodBadge, { type HttpMethod } from '#lib/components/unitati/MethodBadge.svelte';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import SchemaFieldTable from '#lib/components/unitati/SchemaFieldTable.svelte';
	import {
		curlExample,
		parameterFields,
		requestFields,
		responseFields
	} from '#lib/api-docs/schema-fields.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const components = $derived(data.document.components.schemas);
	const serverUrl = $derived(data.document.servers[0].url);

	/** One entry per operation, filed under its tag in the document's own order. */
	const groups = $derived(
		data.document.tags.map((tag) => ({
			name: tag.name,
			operations: Object.entries(data.document.paths).flatMap(([path, methods]) =>
				Object.entries(methods)
					.filter(([, operation]) => operation.tags.includes(tag.name))
					.map(([method, operation]) => ({ ...operation, method, path }))
			)
		}))
	);

	function download() {
		const file = new Blob([JSON.stringify(data.document, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(file);
		const link = document.createElement('a');
		link.href = url;
		link.download = 'openapi.json';
		link.click();
		URL.revokeObjectURL(url);
	}

	let copiedId = $state<string | null>(null);

	async function copy(id: string, text: string) {
		await navigator.clipboard.writeText(text);
		copiedId = id;
	}

	const intro = [
		{ title: m.api_docs_intro_auth_title, body: m.api_docs_intro_auth },
		{ title: m.api_docs_intro_errors_title, body: m.api_docs_intro_errors },
		{ title: m.api_docs_intro_pagination_title, body: m.api_docs_intro_pagination },
		{ title: m.api_docs_intro_rate_title, body: m.api_docs_intro_rate }
	];

	const heading = 'text-sm font-semibold text-[var(--ink)]';
</script>

<svelte:head>
	<title>{documentTitle(m.api_docs_title())}</title>
</svelte:head>

<PageLayout variant="index">
	<PageHeader title={m.api_docs_title()}>
		{#snippet summary()}{m.api_docs_lede()}{/snippet}
		{#snippet actions()}
			<Button variant="ghost" href="/settings/api-keys">{m.api_docs_back()}</Button>
			<Button onclick={download}>{m.api_docs_download()}</Button>
		{/snippet}
	</PageHeader>

	<dl
		class="mt-[var(--space-6)] grid gap-[var(--space-4)] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)] p-[var(--space-4)] md:grid-cols-2"
	>
		{#each intro as item (item.title())}
			<div>
				<dt class={heading}>{item.title()}</dt>
				<dd class="mt-1 text-sm text-[var(--ink-muted)]">{item.body()}</dd>
			</div>
		{/each}
	</dl>

	{#each groups as group (group.name)}
		<section class="mt-[var(--space-8)]" aria-labelledby="tag-{group.name}">
			<h2 id="tag-{group.name}" class="font-display text-xl font-semibold text-[var(--ink)]">
				{group.name}
			</h2>

			{#each group.operations as operation (operation.operationId)}
				{@const example = curlExample(operation, serverUrl)}
				{@const params = parameterFields(operation, components)}
				{@const request = requestFields(operation, components)}
				{@const response = responseFields(operation, components)}
				<article
					id={operation.operationId}
					class="mt-[var(--space-4)] space-y-[var(--space-4)] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)] p-[var(--space-4)]"
				>
					<header class="space-y-[var(--space-2)]">
						<div class="flex flex-wrap items-center gap-[var(--space-2)]">
							<MethodBadge method={operation.method.toUpperCase() as HttpMethod} />
							<code class="font-mono text-sm text-[var(--ink)]">{operation.path}</code>
							<span class="font-mono text-xs text-[var(--ink-muted)]">{operation.operationId}</span>
						</div>
						<p class="font-medium text-[var(--ink)]">{operation.summary}</p>
					</header>

					<div class="flex flex-wrap items-center gap-[var(--space-2)]">
						<span class="text-xs text-[var(--ink-muted)]">{m.api_docs_requires()}</span>
						{#each operation['x-unitati-permissions'] as permission (permission)}
							{@const mine = data.held.includes(permission)}
							<span
								class="inline-flex items-center gap-[var(--space-1)] rounded-[var(--radius-full)] px-[var(--space-2)] py-0.5 text-xs {mine
									? 'bg-[var(--success-soft)] text-[var(--success)]'
									: 'bg-[var(--surface-2)] text-[var(--ink-muted)]'}"
							>
								<code class="font-mono">{permission}</code>
								<span>· {mine ? m.api_docs_in_role() : m.api_docs_out_role()}</span>
							</span>
						{/each}
					</div>

					<!-- The description is Markdown from the registry; shown as written, in English. -->
					<p class="text-sm whitespace-pre-line text-[var(--ink-muted)]">{operation.description}</p>

					{#if params.length > 0}
						<div class="space-y-[var(--space-2)]">
							<h3 class={heading}>{m.api_docs_parameters()}</h3>
							<SchemaFieldTable
								rows={params}
								caption="{operation.operationId}: {m.api_docs_parameters()}"
							/>
						</div>
					{/if}
					{#if request.length > 0}
						<div class="space-y-[var(--space-2)]">
							<h3 class={heading}>{m.api_docs_request()}</h3>
							<SchemaFieldTable
								rows={request}
								caption="{operation.operationId}: {m.api_docs_request()}"
							/>
						</div>
					{/if}
					<div class="space-y-[var(--space-2)]">
						<h3 class={heading}>{m.api_docs_response()}</h3>
						<SchemaFieldTable
							rows={response}
							caption="{operation.operationId}: {m.api_docs_response()}"
						/>
					</div>

					<div class="space-y-[var(--space-2)]">
						<div class="flex items-center justify-between gap-[var(--space-2)]">
							<h3 class={heading}>{m.api_docs_example()}</h3>
							<Button
								type="button"
								variant="secondary"
								size="sm"
								onclick={() => copy(operation.operationId, example)}
							>
								{copiedId === operation.operationId ? m.api_keys_copied() : m.api_keys_copy()}
							</Button>
						</div>
						<pre
							class="overflow-x-auto rounded-[var(--radius-md)] bg-[var(--surface-2)] p-[var(--space-3)] font-mono text-xs text-[var(--ink)]"><code
								>{example}</code
							></pre>
					</div>
				</article>
			{/each}
		</section>
	{:else}
		<EmptyState description={m.api_docs_empty()} />
	{/each}
</PageLayout>
