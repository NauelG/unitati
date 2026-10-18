<script lang="ts" module>
	import { tv } from 'tailwind-variants';

	/**
	 * The `.ut-alert` family: static, persistent feedback that stays in context
	 * (#99) — a form-level error, an operational warning, a standing notice.
	 * Transient success/failure toasts are a different component (#89) and do
	 * not reuse this one. No domain colour (`--brand`/`--desk`/`--project`) ever
	 * stands in for a tone here, so a reader never confuses "this is the assets
	 * area" with "this failed": `info` gets the same neutral surface as a badge's
	 * `neutral` tone instead of reaching for `--brand`.
	 */
	export const alert = tv({
		slots: {
			root: [
				'flex gap-[var(--space-3)] rounded-[var(--radius-lg)] border p-[var(--space-4)]',
				'text-sm leading-[22px]'
			],
			icon: 'mt-0.5 size-4 shrink-0',
			body: 'flex-1 min-w-0',
			title: 'font-semibold',
			description: 'text-[var(--ink-muted)]',
			actions: 'mt-[var(--space-3)] flex flex-wrap items-center gap-[var(--space-2)]',
			dismiss: [
				'ml-[var(--space-2)] shrink-0 self-start rounded-[var(--radius-sm)] p-1 text-[var(--ink-muted)]',
				'transition-colors ut-transition-fast hover:bg-[var(--surface-2)] hover:text-[var(--ink)]'
			]
		},
		variants: {
			tone: {
				info: { root: 'border-[var(--border)] bg-[var(--surface-2)] text-[var(--ink)]' },
				success: {
					root: 'border-transparent bg-[var(--success-soft)] text-[var(--success)]',
					description: 'text-[var(--success)]'
				},
				warning: {
					root: 'border-transparent bg-[var(--warning-soft)] text-[var(--warning)]',
					description: 'text-[var(--warning)]'
				},
				danger: {
					root: 'border-transparent bg-[var(--danger-soft)] text-[var(--danger)]',
					description: 'text-[var(--danger)]'
				}
			}
		},
		defaultVariants: { tone: 'info' }
	});

	export type AlertTone = 'info' | 'success' | 'warning' | 'danger';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import Info from '@lucide/svelte/icons/info';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import X from '@lucide/svelte/icons/x';
	import { m } from '#lib/paraglide/messages.js';

	const ICON = {
		info: Info,
		success: CircleCheck,
		warning: TriangleAlert,
		danger: CircleAlert
	} as const;

	interface Props {
		tone?: AlertTone;
		title?: string;
		/** The body/description. */
		children: Snippet;
		/** A row of actions under the description — retry, undo, link to the record. */
		actions?: Snippet;
		/**
		 * Only a dismissible alert gets a close control: hiding a still-active
		 * warning with no way to bring it back would hide the problem, not solve
		 * it. Absent means there is nothing to dismiss *to* — the caller still
		 * owns whether the alert renders at all.
		 */
		dismissible?: boolean;
		onDismiss?: () => void;
		id?: string;
		class?: string;
	}

	let {
		tone = 'info',
		title,
		children,
		actions,
		dismissible = false,
		onDismiss,
		id,
		class: className
	}: Props = $props();

	const Icon = $derived(ICON[tone]);
	const styles = $derived(alert({ tone }));

	// A validation failure interrupts (assertive, `alert`); a standing notice
	// or warning does not — `status`/polite announces once, only when the
	// content actually changes, never on every keystroke of a field next to it.
	const role = $derived(tone === 'danger' ? 'alert' : 'status');
	const live = $derived(tone === 'danger' ? 'assertive' : 'polite');
</script>

<div {id} class={styles.root({ class: className })} {role} aria-live={live}>
	<Icon class={styles.icon()} aria-hidden="true" />
	<div class={styles.body()}>
		{#if title}
			<p class={styles.title()}>{title}</p>
		{/if}
		<div class={styles.description()}>
			{@render children()}
		</div>
		{#if actions}
			<div class={styles.actions()}>
				{@render actions()}
			</div>
		{/if}
	</div>
	{#if dismissible}
		<button
			type="button"
			class={styles.dismiss()}
			onclick={onDismiss}
			aria-label={m.alert_dismiss()}
		>
			<X class="size-3.5" aria-hidden="true" />
		</button>
	{/if}
</div>
