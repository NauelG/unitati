<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import AppVersion from '#lib/components/AppVersion.svelte';
	import Alert from '#lib/components/unitati/Alert.svelte';
	import { button } from '#lib/components/unitati/Button.svelte';
	import Logo from '#lib/components/unitati/Logo.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import Switch from '#lib/components/unitati/Switch.svelte';
	import { documentTitle } from '#lib/brand.svelte.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { NotificationChannel, NotificationType } from '#lib/server/notifications/index.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	type Row = (typeof data.preferences)[number];

	/** What a person is choosing about, in their words. Exhaustive, like the inbox's sentences. */
	function describe(type: NotificationType): string {
		switch (type) {
			case 'ticket.assigned':
				return m.notifications_pref_type_ticket_assigned();
			case 'task.assigned':
				return m.notifications_pref_type_task_assigned();
			case 'ticket.replied':
				return m.notifications_pref_type_ticket_replied();
			case 'ticket.commented':
				return m.notifications_pref_type_ticket_commented();
			case 'ticket.resolved':
				return m.notifications_pref_type_ticket_resolved();
			case 'task.linked_completed':
				return m.notifications_pref_type_task_linked_completed();
			case 'mention':
				return m.notifications_pref_type_mention();
			case 'followed.activity':
				return m.notifications_pref_type_followed_activity();
			default: {
				const unreachable: never = type;
				throw new Error(`No description for notification type ${unreachable}`);
			}
		}
	}

	const channelName = (channel: NotificationChannel) =>
		channel === 'in_app' ? m.notifications_pref_in_app() : m.notifications_pref_email();

	const lockedHintId = (type: NotificationType) => `locked-${type.replace('.', '-')}`;

	// The value a switch shows while its post is in flight, so it moves on click
	// instead of after the round trip; the load that follows takes over again.
	let pending = $state<Record<string, boolean>>({});

	const key = (type: NotificationType, channel: NotificationChannel) => `${type}:${channel}`;

	function current(row: Row, channel: NotificationChannel): boolean {
		return pending[key(row.type, channel)] ?? (channel === 'in_app' ? row.inApp : row.email);
	}

	function submit(
		type: NotificationType,
		channel: NotificationChannel,
		next: boolean
	): SubmitFunction {
		return () => {
			pending[key(type, channel)] = next;
			return async ({ update }) => {
				await update({ reset: false });
				delete pending[key(type, channel)];
			};
		};
	}

	const error = $derived(
		form && 'error' in form
			? form.error === 'locked'
				? m.notifications_pref_error_locked()
				: m.notifications_pref_error_unavailable()
			: null
	);
</script>

<svelte:head>
	<title>{documentTitle(m.notifications_pref_title())}</title>
</svelte:head>

{#snippet toggle(row: Row, channel: NotificationChannel)}
	{@const checked = current(row, channel)}
	{@const locked = channel === 'in_app' && row.inAppLocked}
	<form
		method="POST"
		action="?/set"
		use:enhance={submit(row.type, channel, !checked)}
		class="inline-flex"
	>
		<input type="hidden" name="type" value={row.type} />
		<input type="hidden" name="channel" value={channel} />
		<input type="hidden" name="enabled" value={String(!checked)} />
		<Switch
			type="submit"
			{checked}
			disabled={locked}
			label={m.notifications_pref_switch_label({
				type: describe(row.type),
				channel: channelName(channel)
			})}
			aria-describedby={locked ? lockedHintId(row.type) : undefined}
		/>
	</form>
{/snippet}

<div class="flex min-h-dvh items-center justify-center bg-[var(--surface-0)] p-6 sm:p-12">
	<PageLayout variant="form" class="w-full">
		<div
			class="mx-auto w-full rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)] p-8 shadow-[var(--shadow-lg)]"
		>
			<Logo size="lg" />
			<h1 class="mt-[var(--space-5)] font-display text-xl font-semibold text-[var(--ink)]">
				{m.notifications_pref_title()}
			</h1>
			<p class="mt-[var(--space-1)] text-sm text-[var(--ink-muted)]">
				{m.notifications_pref_lede()}
			</p>

			{#if !data.emailConfigured}
				<Alert tone="info" class="mt-[var(--space-5)]">
					{m.notifications_pref_no_smtp()}
				</Alert>
			{/if}

			{#if error}
				<Alert tone="danger" class="mt-[var(--space-5)]">{error}</Alert>
			{/if}

			{#if data.preferences.length === 0}
				<p class="mt-[var(--space-6)] text-sm text-[var(--ink-muted)]">
					{m.notifications_pref_empty()}
				</p>
			{:else}
				<table class="mt-[var(--space-6)] w-full text-sm">
					<thead>
						<tr class="border-b border-[var(--border)] text-xs text-[var(--ink-muted)]">
							<th scope="col" class="py-[var(--space-2)] pr-[var(--space-3)] text-left font-medium">
								{m.notifications_pref_column_type()}
							</th>
							<th
								scope="col"
								class="px-[var(--space-3)] py-[var(--space-2)] text-center font-medium"
							>
								{m.notifications_pref_in_app()}
							</th>
							<th
								scope="col"
								class="py-[var(--space-2)] pl-[var(--space-3)] text-center font-medium"
							>
								{m.notifications_pref_email()}
							</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-[var(--border)]">
						{#each data.preferences as row (row.type)}
							<tr>
								<th
									scope="row"
									class="py-[var(--space-3)] pr-[var(--space-3)] text-left font-normal text-[var(--ink)]"
								>
									{describe(row.type)}
									{#if row.inAppLocked}
										<span
											id={lockedHintId(row.type)}
											class="mt-0.5 block text-xs text-[var(--ink-muted)]"
										>
											{m.notifications_pref_locked()}
										</span>
									{/if}
								</th>
								<td class="px-[var(--space-3)] py-[var(--space-3)] text-center">
									{@render toggle(row, 'in_app')}
								</td>
								<td class="py-[var(--space-3)] pl-[var(--space-3)] text-center">
									{@render toggle(row, 'email')}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}

			<div class="mt-[var(--space-6)] flex justify-end">
				<a href="/" class={button({ variant: 'ghost', size: 'lg' })}>
					{m.notifications_pref_back()}
				</a>
			</div>

			<footer class="mt-[var(--space-8)] flex items-center justify-center gap-[var(--space-3)]">
				<AppVersion />
			</footer>
		</div>
	</PageLayout>
</div>
