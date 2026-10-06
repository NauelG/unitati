<script lang="ts">
	import AppVersion from '#lib/components/AppVersion.svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<div class="flex min-h-screen flex-col">
	<header class="flex items-center justify-between border-b border-neutral-200 px-6 py-3">
		<a href="/" class="font-semibold">unitati</a>
		<AppVersion />
	</header>
	<div class="flex-1">
		{@render children()}
	</div>
</div>
