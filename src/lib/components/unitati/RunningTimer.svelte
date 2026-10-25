<script lang="ts">
	import { invalidate } from '$app/navigation';
	import ClockIcon from '@lucide/svelte/icons/clock';
	import { formatElapsed } from '#lib/domain/time.js';
	import { m } from '#lib/paraglide/messages.js';

	/**
	 * The running timer in the app shell (ADR 0051): the record code and the time
	 * elapsed, linking to the record. The timer lives on the server, so it shows
	 * on every device; this re-reads it now and then so a timer started or
	 * stopped elsewhere appears here without a reload.
	 */
	interface Props {
		startedAt: string;
		tag: string;
		href: string;
	}

	let { startedAt, tag, href }: Props = $props();

	let now = $state(Date.now());
	const elapsed = $derived(formatElapsed(now - new Date(startedAt).getTime()));

	$effect(() => {
		const tick = setInterval(() => (now = Date.now()), 15_000);
		const refresh = setInterval(() => void invalidate('app:timer'), 60_000);
		return () => {
			clearInterval(tick);
			clearInterval(refresh);
		};
	});
</script>

<a
	{href}
	class="inline-flex items-center gap-[var(--space-1)] rounded-[var(--radius-md)] border border-[var(--border)] px-[var(--space-2)] py-[var(--space-1)] text-sm text-[var(--ink)] tabular-nums hover:bg-[var(--surface-2)]"
	aria-label={m.time_shell_timer({ tag, elapsed })}
	data-testid="running-timer"
>
	<ClockIcon class="size-4" aria-hidden="true" />
	<span>{tag} · {elapsed}</span>
</a>
