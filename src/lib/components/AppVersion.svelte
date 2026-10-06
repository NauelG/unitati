<script lang="ts">
	import { APP_VERSION } from '#lib/version.js';

	let { class: className = '' }: { class?: string } = $props();
</script>

<span class="font-mono text-xs text-neutral-500 {className}" title="unitati version"
	>v{APP_VERSION}</span
>
