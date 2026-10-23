<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { APP_ENV } from '$app/env/public';
	import * as Command from '#lib/components/ui/command/index.js';
	import { derivePaletteActions, type PaletteActionDef } from '#lib/domain/palette-actions.js';
	import { highlightParts } from '#lib/domain/highlight.js';
	import UserIcon from '@lucide/svelte/icons/user';
	import type { SearchGroupKey, SearchHit, SearchResult } from '#lib/server/search/index.js';
	import { isProduction } from '#lib/environment.js';
	import { formatKeys, isMacPlatform } from '#lib/keymap.js';
	import { m } from '#lib/paraglide/messages.js';
	import {
		ESCALATE_TICKET_EVENT,
		LINK_ASSET_EVENT,
		LINK_TICKET_EVENT,
		MOVE_TASK_EVENT,
		paletteContext
	} from '#lib/palette-context.svelte.js';
	import { KIND_ICONS } from './RecordRef.svelte';

	/**
	 * Global search and the command palette in one dialog (#12, #88): opens on
	 * ⌘K/Ctrl+K and on the `unitati:command-palette` CustomEvent (`AppShell`'s
	 * sidebar Search row); closes on `Esc` — handled by the vendored
	 * `Command.Dialog`'s own `Dialog` primitive, never reimplemented here.
	 *
	 * "Acciones" is `derivePaletteActions` (`#lib/domain/palette-actions.ts`), a
	 * pure, unit-tested function so the permission filtering is covered without
	 * mounting this component. The records come from `/api/search`, already
	 * grouped, limited and scoped to the viewer by `search()`: this component draws
	 * what it is given and never filters it, which is why `Command`'s own client-side
	 * filtering is off (it would drop a hit the server matched by stem).
	 */

	interface Props {
		permissions: readonly string[];
		/** The viewer's own directory record, for "Asignar a mí". `null` without one. */
		personId?: string | null;
		/** Bindable so the gallery spec can force it open; `AppShell` never binds it. */
		open?: boolean;
	}

	let { permissions, personId = null, open = $bindable(false) }: Props = $props();

	let search = $state('');
	let result = $state<SearchResult>({ groups: [] });
	let searching = $state(false);
	let searchToken = 0;

	const mac = isMacPlatform();

	function go(href: string): void {
		open = false;
		goto(href);
	}

	async function assignToMe(tag: string): Promise<void> {
		open = false;
		if (!personId) return;
		const body = new FormData();
		body.set('personId', personId);
		await fetch(`/service-desk/${encodeURIComponent(tag)}?/assign`, { method: 'POST', body });
		await invalidateAll();
	}

	function runAction(action: PaletteActionDef): void {
		if (action.target.kind === 'navigate') go(action.target.href);
		else if (action.target.kind === 'move-task') {
			// The record that owns the dialog is listening (#120).
			open = false;
			window.dispatchEvent(new CustomEvent(MOVE_TASK_EVENT));
		} else if (action.target.kind === 'escalate-ticket') {
			// The ticket record that owns the Sheet is listening (#150).
			open = false;
			window.dispatchEvent(new CustomEvent(ESCALATE_TICKET_EVENT));
		} else if (action.target.kind === 'link-asset') {
			// The ticket record owns the dialog and is listening (#79).
			open = false;
			window.dispatchEvent(new CustomEvent(LINK_ASSET_EVENT));
		} else if (action.target.kind === 'link-ticket') {
			// The asset record owns the dialog and is listening (#168).
			open = false;
			window.dispatchEvent(new CustomEvent(LINK_TICKET_EVENT));
		} else assignToMe(action.target.ticketTag);
	}

	/** `/service-desk/TCK-0001`, never a page one level deeper (comments, edit…). */
	const ticketTag = $derived(page.url.pathname.match(/^\/service-desk\/([^/]+)$/)?.[1]);

	const allActions = $derived(
		derivePaletteActions({
			permissions,
			ticketTag,
			movableTaskTag: paletteContext.movableTaskTag,
			escalatableTicketTag: paletteContext.escalatableTicketTag,
			linkableAssetTag: paletteContext.linkableAssetTag,
			personId,
			isProduction: isProduction(APP_ENV)
		})
	);

	$effect(() => {
		const term = search.trim();
		if (!open || term.length === 0) {
			result = { groups: [] };
			searching = false;
			return;
		}
		searching = true;
		const token = ++searchToken;
		const controller = new AbortController();
		// 150ms debounce (#88's own contract): a real query per keystroke pause, not
		// per keystroke. The previous result stays up until the next one arrives, so
		// the list does not flash empty between letters.
		const timer = setTimeout(async () => {
			try {
				const response = await fetch(`/api/search?q=${encodeURIComponent(term)}`, {
					signal: controller.signal
				});
				if (token !== searchToken) return;
				if (response.ok) result = (await response.json()) as SearchResult;
			} catch (error) {
				if ((error as Error).name !== 'AbortError') throw error;
			}
			if (token === searchToken) searching = false;
		}, 150);
		return () => {
			clearTimeout(timer);
			controller.abort();
		};
	});

	/** Same folding as the server's `unaccent`: nobody types accents into a search box. */
	const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

	const actions = $derived(
		search.trim() === ''
			? allActions
			: allActions.filter((action) => fold(action.label).includes(fold(search.trim())))
	);

	const GROUP_HEADINGS: Record<SearchGroupKey, () => string> = {
		code: () => m.search_group_code(),
		assets: () => m.search_group_assets(),
		asset_tickets: () => m.search_group_asset_tickets(),
		tickets: () => m.search_group_tickets(),
		projects: () => m.search_group_projects(),
		pages: () => m.search_group_pages(),
		people: () => m.search_group_people()
	};

	/** The scoped total is shown only when there is more than what fits: "Tickets · 7". */
	const headingOf = (group: SearchResult['groups'][number]) =>
		group.total > group.hits.length
			? `${GROUP_HEADINGS[group.key]()} · ${group.total}`
			: GROUP_HEADINGS[group.key]();

	const hitIcon = (kind: SearchHit['kind']) => (kind === 'person' ? UserIcon : KIND_ICONS[kind]);

	$effect(() => {
		function onOpenEvent() {
			open = true;
		}
		window.addEventListener('unitati:command-palette', onOpenEvent);
		return () => window.removeEventListener('unitati:command-palette', onOpenEvent);
	});

	function onWindowKeydown(event: KeyboardEvent) {
		if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
			event.preventDefault();
			open = !open;
		}
	}

	$effect(() => {
		if (!open) search = '';
	});
</script>

<svelte:window onkeydown={onWindowKeydown} />

<Command.Dialog
	bind:open
	shouldFilter={false}
	title={m.palette_title()}
	description={m.palette_description()}
	class="sm:max-w-[560px]"
>
	<Command.Input bind:value={search} placeholder={m.palette_placeholder()} />
	<Command.List>
		{#if result.groups.length === 0 && actions.length === 0}
			<Command.Empty>
				{searching ? m.palette_searching() : m.palette_empty()}
			</Command.Empty>
		{/if}

		<!-- Records first: the exact-code group is the first item, so Enter jumps. -->
		{#each result.groups as group, index (group.key)}
			{#if index > 0}<Command.Separator />{/if}
			<Command.Group heading={headingOf(group)}>
				{#each group.hits as hit (hit.href + hit.code + hit.title)}
					{@const Icon = hitIcon(hit.kind)}
					<Command.Item
						onSelect={() => go(hit.href)}
						value={`${group.key} ${hit.href} ${hit.title}`}
					>
						<Icon aria-hidden="true" />
						{#if hit.code}
							<span class="shrink-0 font-mono text-xs font-semibold">{hit.code}</span>
						{/if}
						<span class="min-w-0 flex-1 truncate">
							{#each highlightParts(hit.title, search) as part, partIndex (partIndex)}
								{#if part.match}<mark class="bg-[var(--brand-soft)] font-semibold text-inherit"
										>{part.text}</mark
									>{:else}{part.text}{/if}
							{/each}
						</span>
						{#if hit.subtitle}
							<span class="shrink-0 text-xs text-[var(--ink-muted)]">{hit.subtitle}</span>
						{/if}
					</Command.Item>
				{/each}
			</Command.Group>
		{/each}

		{#if actions.length > 0}
			{#if result.groups.length > 0}<Command.Separator />{/if}
			<Command.Group heading={m.palette_group_actions()}>
				{#each actions as action (action.id)}
					<Command.Item onSelect={() => runAction(action)} value={`action ${action.id}`}>
						<action.icon aria-hidden="true" />
						{action.label}
					</Command.Item>
				{/each}
			</Command.Group>
		{/if}
	</Command.List>

	<div
		class="flex items-center justify-between border-t border-[var(--border)] px-3 py-2 text-xs text-[var(--ink-muted)]"
	>
		<span>{m.palette_footer_hint()}</span>
		<span class="ut-kbd">{formatKeys(['Escape'], mac)}</span>
	</div>
</Command.Dialog>
