<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { APP_ENV } from '$app/env/public';
	import * as Command from '#lib/components/ui/command/index.js';
	import { derivePaletteActions, type PaletteActionDef } from '#lib/domain/palette-actions.js';
	import type { PaletteRecord } from '#lib/domain/palette.js';
	import { isProduction } from '#lib/environment.js';
	import { formatKeys, isMacPlatform } from '#lib/keymap.js';
	import { m } from '#lib/paraglide/messages.js';
	import {
		ESCALATE_TICKET_EVENT,
		LINK_ASSET_EVENT,
		MOVE_TASK_EVENT,
		paletteContext
	} from '#lib/palette-context.svelte.js';
	import RecordRef from './RecordRef.svelte';

	/**
	 * The palette (#88): opens on ⌘K/Ctrl+K and on the phase-2
	 * `unitati:command-palette` CustomEvent (`AppShell`'s sidebar Search row);
	 * closes on `Esc` — handled by the vendored `Command.Dialog`'s own `Dialog`
	 * primitive, never reimplemented here. "Acciones" is `derivePaletteActions`
	 * (`#lib/domain/palette-actions.ts`), a pure, unit-tested function so the
	 * permission filtering is covered without mounting this component.
	 * "Registros" calls the interim `/api/palette` endpoint — it swaps to MVP
	 * slice 7's Postgres FTS internally without this component changing.
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
	let records = $state<PaletteRecord[]>([]);
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
		} else assignToMe(action.target.ticketTag);
	}

	/** `/service-desk/TCK-0001`, never a page one level deeper (comments, edit…). */
	const ticketTag = $derived(page.url.pathname.match(/^\/service-desk\/([^/]+)$/)?.[1]);

	const actions = $derived(
		derivePaletteActions({
			permissions,
			ticketTag,
			movableTaskTag: paletteContext.movableTaskTag,
			escalatableTicketTag: paletteContext.escalatableTicketTag,
			personId,
			isProduction: isProduction(APP_ENV)
		})
	);

	$effect(() => {
		const term = search.trim();
		if (!open || term.length === 0) {
			records = [];
			searching = false;
			return;
		}
		searching = true;
		const token = ++searchToken;
		// 150ms debounce (#88's own contract): the interim endpoint is a real
		// query per domain, not a client-side filter over an already-fetched list.
		const timer = setTimeout(async () => {
			const response = await fetch(`/api/palette?q=${encodeURIComponent(term)}`);
			if (token !== searchToken) return;
			if (response.ok) {
				const body = (await response.json()) as { records: PaletteRecord[] };
				records = body.records;
			}
			searching = false;
		}, 150);
		return () => clearTimeout(timer);
	});

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

<Command.Dialog bind:open title={m.palette_title()} description={m.palette_description()}>
	<Command.Input bind:value={search} placeholder={m.palette_placeholder()} />
	<Command.List>
		<Command.Empty>
			{searching ? m.palette_searching() : m.palette_empty()}
		</Command.Empty>

		<Command.Group heading={m.palette_group_actions()}>
			{#each actions as action (action.id)}
				<Command.Item onSelect={() => runAction(action)} value={action.label}>
					<action.icon aria-hidden="true" />
					{action.label}
				</Command.Item>
			{/each}
		</Command.Group>

		{#if records.length > 0}
			<Command.Separator />
			<Command.Group heading={m.palette_group_records()}>
				{#each records as record (record.tag)}
					<Command.Item onSelect={() => go(record.href)} value={`${record.tag} ${record.title}`}>
						<RecordRef record={{ ...record }} />
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
