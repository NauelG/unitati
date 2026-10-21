<script lang="ts">
	import { enhance } from '$app/forms';
	import { m } from '#lib/paraglide/messages.js';
	import type { FollowState } from '#lib/server/notifications/index.js';
	import Button from './Button.svelte';

	interface Props {
		follow: FollowState;
	}

	let { follow }: Props = $props();

	const hintId = `follow-hint-${Math.random().toString(36).slice(2, 8)}`;
</script>

<!--
	The follow toggle of a ticket, task or project (#57). Staff who are not
	participants get a "Seguir" / "Siguiendo" toggle; a participant gets a disabled
	"Participas" with the reason, because they already hear about it. Nobody else
	sees anything: an employee cannot follow, and does not see the count.
-->
{#if follow.canFollow}
	<div class="flex items-center gap-[var(--space-3)]">
		{#if follow.participant}
			<Button
				variant="secondary"
				disabled
				title={m.follow_participant_hint()}
				aria-describedby={hintId}
			>
				{m.follow_participant()}
			</Button>
			<span id={hintId} class="sr-only">{m.follow_participant_hint()}</span>
		{:else}
			<form method="POST" action={follow.following ? '?/unfollow' : '?/follow'} use:enhance>
				<Button type="submit" variant="secondary" aria-pressed={follow.following}>
					{follow.following ? m.follow_following() : m.follow_button()}
				</Button>
			</form>
		{/if}
		<span class="text-xs text-[var(--ink-muted)]"
			>{m.follow_count({ count: follow.followerCount })}</span
		>
	</div>
{/if}
