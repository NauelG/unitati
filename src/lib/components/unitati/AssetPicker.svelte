<script lang="ts" module>
	import { tv } from 'tailwind-variants';

	/**
	 * Picks several assets: the ones chosen sit above as chips, each carrying a
	 * hidden input, so the form posts them as repeated `assetIds` fields.
	 *
	 * It asks a `searchUrl` as the user types instead of being handed a list:
	 * staff may face thousands of assets (#13 seeds exactly that volume), and a
	 * list capped to keep the page light would hide the asset somebody needs
	 * without saying so. The endpoint scopes by who is asking, so an employee's
	 * results are their own equipment and the shared ones.
	 */
	export const picker = tv({
		slots: {
			root: 'flex flex-col gap-[var(--space-2)]',
			label: 'text-[13px] leading-4 font-medium text-[var(--ink)]',
			chips: 'flex flex-wrap gap-[var(--space-2)]',
			chip: [
				'inline-flex items-center gap-[var(--space-1)] rounded-[var(--radius-full)] py-[2px] pr-[var(--space-1)] pl-[var(--space-3)]',
				'bg-[var(--asset-soft)] text-[13px] leading-5 text-[var(--asset)]'
			],
			tag: 'font-mono text-xs font-semibold',
			remove: [
				'grid size-6 place-items-center rounded-[var(--radius-full)] text-[var(--asset)]',
				'hover:bg-[var(--surface-1)]'
			],
			input: [
				'h-[var(--size-control-md)] w-full box-border px-[var(--space-3)]',
				'rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface-1)]',
				'text-sm leading-5 text-[var(--ink)] placeholder:text-[var(--ink-muted)]'
			],
			results:
				'max-h-56 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-1)]',
			option: [
				'flex w-full items-baseline gap-[var(--space-2)] px-[var(--space-3)] py-[var(--space-2)] text-left',
				'text-sm leading-5 text-[var(--ink)] hover:bg-[var(--surface-2)]'
			],
			optionTag: 'font-mono text-xs font-semibold text-[var(--asset)]',
			empty: 'px-[var(--space-3)] py-[var(--space-2)] text-[13px] text-[var(--ink-muted)]',
			help: 'text-[13px] leading-[18px] text-[var(--ink-muted)]'
		}
	});

	/** Wait for a pause in typing before asking the server, so a word is one request. */
	export const SEARCH_DELAY_MS = 200;
</script>

<script lang="ts">
	import X from '@lucide/svelte/icons/x';
	import { m } from '#lib/paraglide/messages.js';
	import type { PickedAsset } from './asset-choice.js';

	interface Props {
		label: string;
		/** The name every hidden input is posted under. */
		name?: string;
		/** An endpoint answering `?q=` with a JSON array of `PickedAsset`. */
		searchUrl: string;
		selected?: PickedAsset[];
		hint?: string;
		class?: string;
	}

	let {
		label,
		name = 'assetIds',
		searchUrl,
		selected = $bindable([]),
		hint,
		class: className
	}: Props = $props();

	const styles = picker();
	const generatedId = $props.id();
	const inputId = `${generatedId}-search`;
	const hintId = `${generatedId}-hint`;

	let search: HTMLInputElement | undefined = $state();
	let term = $state('');
	let open = $state(false);
	let remote = $state<PickedAsset[]>([]);
	let failed = $state(false);

	const chosen = $derived(new Set(selected.map((asset) => asset.id)));
	const candidates = $derived(remote.filter((choice) => !chosen.has(choice.id)));

	// Asks the server once typing pauses. The cleanup both cancels the timer and
	// aborts a request that is no longer the latest, so a slow answer to "mac"
	// cannot overwrite the answer to "macbook".
	$effect(() => {
		if (!open) return;

		const query = term;
		const controller = new AbortController();
		const timer = setTimeout(async () => {
			try {
				const response = await fetch(`${searchUrl}?q=${encodeURIComponent(query)}`, {
					signal: controller.signal
				});
				if (!response.ok) throw new Error(String(response.status));
				remote = (await response.json()) as PickedAsset[];
				failed = false;
			} catch (error) {
				if ((error as Error).name !== 'AbortError') failed = true;
			}
		}, SEARCH_DELAY_MS);

		return () => {
			clearTimeout(timer);
			controller.abort();
		};
	});

	// The button that was pressed leaves the DOM (an option once chosen, a chip
	// once removed), and focus would fall to the page. It goes back to the box, so
	// the next pick or the next Tab starts from where the user was.
	function add(asset: PickedAsset) {
		selected = [...selected, asset];
		term = '';
		search?.focus();
	}

	function remove(id: string) {
		selected = selected.filter((asset) => asset.id !== id);
		search?.focus();
	}

	/** Closes the list unless focus moved to something inside the picker. */
	function leave(event: FocusEvent & { currentTarget: HTMLElement }) {
		const next = event.relatedTarget as Node | null;
		if (!next || !event.currentTarget.contains(next)) open = false;
	}
</script>

<div class={styles.root({ class: className })} onfocusout={leave}>
	<label for={inputId} class={styles.label()}>{label}</label>

	{#if selected.length > 0}
		<ul class={styles.chips()} aria-label={m.asset_picker_selected()}>
			{#each selected as asset (asset.id)}
				<li class={styles.chip()}>
					<input type="hidden" {name} value={asset.id} />
					<span class={styles.tag()}>{asset.assetTag}</span>
					<span>{asset.name}</span>
					<button
						type="button"
						class={styles.remove()}
						aria-label={m.asset_picker_remove({ assetTag: asset.assetTag })}
						onclick={() => remove(asset.id)}
					>
						<X class="size-3.5" aria-hidden="true" />
					</button>
				</li>
			{/each}
		</ul>
	{/if}

	<input
		bind:this={search}
		id={inputId}
		type="search"
		autocomplete="off"
		class={styles.input()}
		placeholder={m.asset_picker_placeholder()}
		aria-describedby={hint ? hintId : undefined}
		bind:value={term}
		onfocus={() => (open = true)}
		oninput={() => (open = true)}
		onkeydown={(event) => {
			// Enter inside a search box submits the whole ticket form: not what was meant.
			if (event.key === 'Enter') event.preventDefault();
			if (event.key === 'Escape') open = false;
		}}
	/>

	<!-- Always in the DOM: a live region inserted together with its text is often not announced. -->
	<p class="sr-only" role="status">
		{open && !failed ? m.asset_picker_count({ count: candidates.length }) : ''}
	</p>

	{#if open}
		<div class={styles.results()}>
			{#if failed}
				<p class={styles.empty()} role="alert">{m.asset_picker_failed()}</p>
			{:else if candidates.length === 0}
				<p class={styles.empty()}>{m.asset_picker_none()}</p>
			{:else}
				<ul>
					{#each candidates as asset (asset.id)}
						<li>
							<button type="button" class={styles.option()} onclick={() => add(asset)}>
								<span class={styles.optionTag()}>{asset.assetTag}</span>
								<span>{asset.name}</span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}

	{#if hint}
		<p id={hintId} class={styles.help()}>{hint}</p>
	{/if}
</div>
