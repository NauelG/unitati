<script lang="ts">
	import '../app.css';
	import appleTouchIcon from '#lib/assets/apple-touch-icon.png';
	import favicon from '#lib/assets/favicon.svg';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" type="image/svg+xml" href={favicon} />
	<link rel="apple-touch-icon" href={appleTouchIcon} />
</svelte:head>

{@render children()}
