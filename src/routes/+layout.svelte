<script lang="ts">
	import '../app.css';
	import { onNavigate } from '$app/navigation';
	import appleTouchIcon from '#lib/assets/apple-touch-icon.png';
	import favicon from '#lib/assets/favicon.svg';
	import { prefersReducedMotion, registerViewTransitionSettle } from '#lib/motion.js';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

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
</svelte:head>

{@render children()}
