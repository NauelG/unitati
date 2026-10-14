<script lang="ts">
	import { Toaster as Sonner, type ToasterProps as SonnerProps } from "svelte-sonner";
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import OctagonXIcon from '@lucide/svelte/icons/octagon-x';
	import InfoIcon from '@lucide/svelte/icons/info';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';

	// No light/dark toggle exists yet (`.dark` is never applied — see
	// `src/app.css`), so `theme` stays a fixed "light" rather than wiring up
	// `mode-watcher`: ADR 0017 schedules that dependency's first import for
	// phase 9, not this one.
	let { ...restProps }: SonnerProps = $props();
</script>

<!--
	Reduced motion: svelte-sonner's enter/exit animations are plain CSS
	`transition`/`animation`, already collapsed to ~0 by the global
	`prefers-reduced-motion` layer in `src/app.css` (#87) — nothing
	toast-specific to wire up here.
-->
<Sonner
	theme="light"
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
