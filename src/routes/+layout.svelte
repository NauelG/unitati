<script lang="ts">
	import '../app.css';
	import { onNavigate } from '$app/navigation';
	import { ModeWatcher } from 'mode-watcher';
	import appleTouchIcon from '#lib/assets/apple-touch-icon.png';
	import favicon from '#lib/assets/favicon.svg';
	import { THEME_CANVAS_COLORS } from '#lib/theme.js';
	import { prefersReducedMotion, registerViewTransitionSettle } from '#lib/motion.js';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();

	/**
	 * View Transitions (#87): must live in the root layout — `onNavigate` only
	 * fires for layouts that wrap the whole app. Feature-detected (no polyfill,
	 * D12): Firefox has no `document.startViewTransition` and falls through to
	 * SvelteKit's ordinary instant swap, with no error either way. Reduced
	 * motion is checked here, not only in CSS, because a JS call is the one
	 * thing the `prefers-reduced-motion` media layer in `app.css` cannot stop.
	 */
	onNavigate((navigation) => {
		if (!document.startViewTransition || prefersReducedMotion()) return;

		return new Promise((resolve) => {
			const transition = document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
			registerViewTransitionSettle(transition.finished);
		});
	});
</script>

<svelte:head>
	<link rel="icon" type="image/svg+xml" href={favicon} />
	<link rel="apple-touch-icon" href={appleTouchIcon} />
	<!--
		The brand colour (#160), injected on the server so the first paint is already
		branded. `{@html}` is acceptable only because `brandCss` (#lib/domain/brand-color)
		builds the sheet exclusively from validated `Hex` values: it holds no user text
		and cannot carry markup. Never feed anything else through here.
	-->
	{#if data.brand.css}
		<!-- eslint-disable-next-line svelte/no-at-html-tags -- validated hex only, see the comment above -->
		{@html `<style id="ut-brand">${data.brand.css}</style>`}
	{/if}
</svelte:head>

<!--
	Dark mode (#90, D9: the system decides until the user says otherwise).

	Mounted in the *root* layout, not `(app)`, for the same reason `onNavigate`
	above is: the theme has to cover the auth screens and the employee portal
	too, which are sibling groups `(app)` never wraps.

	`ModeWatcher` renders no element. Its whole output is a synchronous inline
	`<script>` in `<head>` that sets `.dark` on `<html>` from `localStorage`
	before the first paint — the same trick, and the same reason, as
	`app.html`'s own pre-paint script for the collapsed sidebar (ADR 0015). The
	two do not collide: one writes a class, the other an attribute, so
	`app.html`'s snippet stays as it is rather than being folded in here.

	`disableTransitions` is left at its default `true`: without it, flipping the
	theme would run every `transition-colors` in the app at once and repaint the
	whole page as a 120ms colour wipe. A theme switch is a change of context,
	not an animation (motion constitution #87) — it should be instant.
-->
<ModeWatcher defaultMode="system" themeColors={THEME_CANVAS_COLORS} />

{@render children()}
