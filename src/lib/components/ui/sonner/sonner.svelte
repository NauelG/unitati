<script lang="ts">
	import { mode } from "mode-watcher";
	import { Toaster as Sonner, type ToasterProps as SonnerProps } from "svelte-sonner";
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import OctagonXIcon from '@lucide/svelte/icons/octagon-x';
	import InfoIcon from '@lucide/svelte/icons/info';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';

	// Restored to upstream's own `theme={mode.current}` (#90). The registry item
	// for this block declares `mode-watcher` as its dependency and ships that
	// line; #88 had to replace it with a fixed "light" because D12 had the
	// package removed until a phase claimed it. Phase 9 is that phase, so the
	// vendored file goes back to being diffable against upstream (ADR 0011).
	//
	// `mode`, not `userPrefersMode`: sonner wants the theme being *painted*, so
	// "system" has to be resolved first. It is `undefined` until the browser
	// reports, which sonner reads as its own default.
	let { ...restProps }: SonnerProps = $props();
</script>

<!--
	Reduced motion: svelte-sonner's enter/exit animations are plain CSS
	`transition`/`animation`, already collapsed to ~0 by the global
	`prefers-reduced-motion` layer in `src/app.css` (#87) — nothing
	toast-specific to wire up here.
-->
<Sonner
	theme={mode.current}
	position="bottom-right"
	richColors
	class="toaster group"
	style="
		--normal-bg: var(--surface-1);
		--normal-border: var(--border-strong);
		--normal-text: var(--ink);
		--success-bg: var(--success-soft);
		--success-border: var(--success);
		--success-text: var(--success);
		--info-bg: var(--surface-2);
		--info-border: var(--border-strong);
		--info-text: var(--ink);
		--warning-bg: var(--warning-soft);
		--warning-border: var(--warning);
		--warning-text: var(--warning);
		--error-bg: var(--danger-soft);
		--error-border: var(--danger);
		--error-text: var(--danger);
	"
	toastOptions={{
		classes: {
			toast: 'rounded-[var(--radius-md)] shadow-[var(--shadow-lg)] font-sans text-sm'
		}
	}}
	{...restProps}
>
	{#snippet loadingIcon()}
		<Loader2Icon class="size-4 animate-spin" />
	{/snippet}
	{#snippet successIcon()}
		<CircleCheckIcon class="size-4" />
	{/snippet}
	{#snippet errorIcon()}
		<OctagonXIcon class="size-4" />
	{/snippet}
	{#snippet infoIcon()}
		<InfoIcon class="size-4" />
	{/snippet}
	{#snippet warningIcon()}
		<TriangleAlertIcon class="size-4" />
	{/snippet}
</Sonner>
