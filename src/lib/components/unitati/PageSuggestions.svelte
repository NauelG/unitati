<script lang="ts">
	import Button from './Button.svelte';
	import RecordAttachments from './RecordAttachments.svelte';
	import Sheet from './Sheet.svelte';
	import { prose } from './prose.js';
	import { m } from '#lib/paraglide/messages.js';

	/**
	 * "¿Te ayuda alguna de estas páginas?" under the subject of a free-form
	 * portal ticket (#329). Typing the subject (from three characters, debounced)
	 * asks `/portal/knowledge/suggest` for up to five pages; opening one shows it
	 * in a side sheet **over** the form, never navigating, so what the employee
	 * typed is still there when they close it.
	 */

	interface Props {
		subject: string;
		/** Debounce in ms; the spec shortens it. */
		delay?: number;
	}

	interface Suggestion {
		tag: string;
		title: string;
	}

	interface Preview {
		tag: string;
		title: string;
		bodyHtml: string;
		hasBody: boolean;
		attachments: { id: string; filename: string; contentType: string; byteSize: number }[];
	}

	const MIN_LENGTH = 3;

	let { subject, delay = 300 }: Props = $props();

	let suggestions = $state<Suggestion[]>([]);
	let opened = $state<Suggestion | null>(null);
	let preview = $state<Preview | null>(null);
	let failed = $state(false);

	$effect(() => {
		const term = subject.trim();
		if (term.length < MIN_LENGTH) {
			suggestions = [];
			return;
		}
		const controller = new AbortController();
		const timer = setTimeout(async () => {
			try {
				const response = await fetch(`/portal/knowledge/suggest?q=${encodeURIComponent(term)}`, {
					signal: controller.signal
				});
				if (response.ok) suggestions = ((await response.json()) as { pages: Suggestion[] }).pages;
			} catch (error) {
				if ((error as Error).name !== 'AbortError') suggestions = [];
			}
		}, delay);
		return () => {
			clearTimeout(timer);
			controller.abort();
		};
	});

	async function open(suggestion: Suggestion): Promise<void> {
		opened = suggestion;
		preview = null;
		failed = false;
		try {
			const response = await fetch(
				`/portal/knowledge/${encodeURIComponent(suggestion.tag)}/preview`
			);
			if (opened?.tag !== suggestion.tag) return;
			if (response.ok) preview = (await response.json()) as Preview;
			else failed = true;
		} catch {
			failed = true;
		}
	}

	function close(): void {
		opened = null;
		preview = null;
	}
</script>

{#if suggestions.length > 0}
	<section aria-labelledby="page-suggestions-heading" class="space-y-[var(--space-2)]">
		<h2 id="page-suggestions-heading" class="text-label text-[var(--ink)]">
			{m.portal_suggestions_title()}
		</h2>
		<ul class="space-y-[var(--space-1)]">
			{#each suggestions as suggestion (suggestion.tag)}
				<li>
					<button
						type="button"
						onclick={() => open(suggestion)}
						class="text-left text-sm font-medium text-[var(--brand)] hover:underline"
					>
						<span class="font-mono text-xs">{suggestion.tag}</span>
						{suggestion.title}
					</button>
				</li>
			{/each}
		</ul>
	</section>
{/if}

<Sheet
	open={opened !== null}
	onOpenChange={(next) => {
		if (!next) close();
	}}
	title={preview?.title ?? opened?.title ?? ''}
	description={opened?.tag}
>
	{#if preview}
		{#if preview.hasBody}
			<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitised by renderMarkdown on the server (ADR 0030) -->
			<div class={prose}>{@html preview.bodyHtml}</div>
		{/if}
		{#if preview.attachments.length > 0}
			<div class="mt-[var(--space-5)]">
				<RecordAttachments
					items={preview.attachments}
					downloadBase={`/portal/knowledge/${preview.tag}/attachments`}
					canManage={false}
				/>
			</div>
		{/if}
	{:else}
		<p class="text-sm text-[var(--ink-muted)]" role={failed ? 'alert' : 'status'}>
			{failed ? m.portal_suggestions_failed() : m.portal_suggestions_loading()}
		</p>
	{/if}
	<div class="mt-[var(--space-5)]">
		<Button type="button" onclick={close}>{m.portal_suggestions_continue()}</Button>
	</div>
</Sheet>
