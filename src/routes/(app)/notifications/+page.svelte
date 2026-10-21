<script lang="ts">
	import { documentTitle } from '#lib/brand.svelte.js';
	import NotificationInbox from '#lib/components/unitati/NotificationInbox.svelte';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{documentTitle(m.notifications_title())}</title>
</svelte:head>

<PageLayout variant="index">
	<PageHeader title={m.notifications_title()}>
		{#snippet summary()}{m.notifications_lede()}{/snippet}
	</PageHeader>

	<NotificationInbox items={data.items} nextCursor={data.nextCursor} unreadOnly={data.unreadOnly} />
</PageLayout>
