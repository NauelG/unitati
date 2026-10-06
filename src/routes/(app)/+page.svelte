<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{m.overview_title()} · {m.app_name()}</title>
</svelte:head>

<div class="mx-auto max-w-5xl">
	<h1 class="font-display text-2xl font-semibold text-[var(--ink)]">
		{m.overview_greeting({ name: data.user.name })}
	</h1>
	<p class="mt-2 text-[var(--ink-muted)]">{m.overview_pending()}</p>
</div>
