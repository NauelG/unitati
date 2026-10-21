<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import Avatar from '#lib/components/unitati/Avatar.svelte';
	import ThemeMenuItems from '#lib/components/unitati/ThemeMenuItems.svelte';
	import { m } from '#lib/paraglide/messages.js';

	interface Props {
		name: string;
		email: string;
		/** Where the sign-out form posts. */
		signOutAction?: string;
		/** Extra items, rendered between the header and the theme group. */
		items?: Snippet;
		class?: string;
	}

	let { name, email, signOutAction = '/sign-out', items, class: className }: Props = $props();

	let signOutForm: HTMLFormElement | undefined = $state();
</script>

<!--
	The topbar's whole user cluster (#213): theme, identity and sign-out behind
	one avatar button, shared by the staff shell and the portal.

	Sign-out stays a real `POST` form (the endpoint is not a link and must not be
	reachable by GET). The menu item cannot be the submit button itself — bits-ui
	items are not form controls — so a hidden form is submitted from `onSelect`.
-->
<DropdownMenu.Root>
	<DropdownMenu.Trigger
		class="ut-transition-fast grid shrink-0 place-items-center rounded-[var(--radius-full)] transition-opacity hover:opacity-80 {className ??
			''}"
		aria-label={m.nav_user_menu_of({ name })}
	>
		<Avatar {name} size="md" />
	</DropdownMenu.Trigger>

	<DropdownMenu.Content align="end" class="min-w-56">
		<!-- Not an item: it is not actionable, so it must stay out of the arrow-key order. -->
		<div class="flex flex-col px-1.5 py-1.5">
			<span class="truncate text-sm font-medium text-[var(--ink)]">{name}</span>
			<span class="truncate text-xs text-[var(--ink-muted)]">{email}</span>
		</div>
		<DropdownMenu.Separator />
		{#if items}
			{@render items()}
			<DropdownMenu.Separator />
		{/if}
		<ThemeMenuItems />
		<DropdownMenu.Separator />
		<!-- Real links: they work without script and open in a new tab on demand. -->
		<DropdownMenu.Item>
			{#snippet child({ props })}
				<a href="/account/notifications" {...props}>{m.nav_notification_preferences()}</a>
			{/snippet}
		</DropdownMenu.Item>
		<DropdownMenu.Item>
			{#snippet child({ props })}
				<a href="/account/password" {...props}>{m.nav_change_password()}</a>
			{/snippet}
		</DropdownMenu.Item>
		<DropdownMenu.Item onSelect={() => signOutForm?.requestSubmit()}>
			{m.nav_sign_out()}
		</DropdownMenu.Item>
	</DropdownMenu.Content>
</DropdownMenu.Root>

<form method="POST" action={signOutAction} bind:this={signOutForm} hidden></form>
