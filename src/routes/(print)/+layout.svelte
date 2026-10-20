<script lang="ts">
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<!-- Paper is white whatever the theme: the dark class of the app must never reach a sheet. -->
	<style>
		html,
		body {
			background: #fff !important;
			color: #000;
		}
		@media print {
			[data-environment] {
				display: none !important;
			}
		}
	</style>
</svelte:head>

<!-- No sidebar and no top bar: only the page and, on screen, its own toolbar. -->
<div class="min-h-dvh bg-white text-black">
	{@render children()}
</div>
