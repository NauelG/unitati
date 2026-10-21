<script lang="ts">
	import { enhance } from '$app/forms';
	import { documentTitle } from '#lib/brand.svelte.js';
	import AssetTimeline from '#lib/components/unitati/AssetTimeline.svelte';
	import Breadcrumbs from '#lib/components/unitati/Breadcrumbs.svelte';
	import Button from '#lib/components/unitati/Button.svelte';
	import DescriptionList from '#lib/components/unitati/DescriptionList.svelte';
	import FormError from '#lib/components/unitati/FormError.svelte';
	import { handoverDirectionLabel } from '#lib/components/unitati/handover-state.js';
	import HandoverStateBadge from '#lib/components/unitati/HandoverStateBadge.svelte';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import RecordRef from '#lib/components/unitati/RecordRef.svelte';
	import WorkPanel from '#lib/components/unitati/WorkPanel.svelte';
	import { formatDateTime } from '#lib/format-date.js';
	import { m } from '#lib/paraglide/messages.js';
	import SigningLinkPanel from '../../SigningLinkPanel.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const handover = $derived(data.handover);
	const resendable = $derived(
		data.canManage && (handover.state === 'pending' || handover.state === 'expired')
	);
	const decided = $derived(handover.state === 'accepted' || handover.state === 'rejected');
	const timeline = $derived(
		handover.activity.map((entry) => ({
			kind: 'activity' as const,
			id: entry.id,
			at: entry.occurredAt,
			entry
		}))
	);
	const conditionWord = (condition: 'good' | 'damaged' | 'incomplete') =>
		({
			good: m.handover_condition_good,
			damaged: m.handover_condition_damaged,
			incomplete: m.handover_condition_incomplete
		})[condition]();

	const resent = $derived.by(() => {
		if (!form || !('action' in form) || form.action !== 'resend' || !('link' in form)) return null;
		return {
			link: form.link as string,
			qrSvg: form.qrSvg as string,
			mailed: form.mailed as boolean,
			expiresAt: form.expiresAt as string
		};
	});
</script>

{#snippet failure(action: string)}
	{#if form && 'action' in form && form.action === action && 'message' in form}
		<FormError>{form.message}</FormError>
	{/if}
{/snippet}

<svelte:head>
	<title>{documentTitle(handover.code, handover.personName)}</title>
</svelte:head>

<PageLayout variant="record">
	<Breadcrumbs
		class="mb-[var(--space-5)]"
		segments={[
			{ label: m.assets_nav_assets(), href: '/assets' },
			{ label: m.handover_detail_breadcrumb(), href: '/assets/handovers' },
			{ label: handover.code }
		]}
	/>

	<PageHeader title={handover.personName} code={handover.code} level="record" />

	<div class="mt-[var(--space-2)] flex items-center gap-[var(--space-2)]">
		<HandoverStateBadge state={handover.state} />
		<span class="text-sm text-[var(--ink-muted)]">
			{m.handover_detail_issued_by({
				name: handover.issuedByName ?? '—',
				date: formatDateTime(handover.issuedAt)
			})}
		</span>
	</div>

	<div class="mt-[var(--space-6)] space-y-[var(--space-6)]">
		<WorkPanel heading={m.handover_detail_person()}>
			<DescriptionList
				items={[
					{ label: m.handover_detail_person(), value: handover.personName },
					{ label: m.handover_detail_email(), value: handover.recipientEmail },
					{
						label: m.handover_detail_direction(),
						value: handoverDirectionLabel(handover.direction)
					},
					{
						label: m.handover_detail_expires(),
						value: handover.expiresAt ? formatDateTime(handover.expiresAt) : null
					}
				]}
			/>
		</WorkPanel>

		<WorkPanel heading={m.handover_detail_assets()}>
			<p class="mb-[var(--space-3)] text-small text-[var(--ink-muted)]">
				{m.handover_detail_asset_snapshot()}
			</p>
			<ul class="divide-y divide-[var(--border)]">
				{#each handover.assets as asset (asset.assetId)}
					<li class="py-[var(--space-2)] text-sm">
						<p class="flex flex-wrap items-baseline gap-x-[var(--space-2)]">
							{#if asset.currentTag}
								<a
									href="/assets/{encodeURIComponent(asset.currentTag)}"
									class="font-mono text-xs hover:underline">{asset.assetTag}</a
								>
							{:else}
								<span class="font-mono text-xs">{asset.assetTag}</span>
							{/if}
							<span class="font-medium">{asset.name}</span>
							<span class="text-[var(--ink-muted)]">
								{asset.model}{asset.serial ? ` · ${asset.serial}` : ''}
							</span>
						</p>
						{#if asset.condition}
							<p class="text-[var(--ink-muted)]">
								{m.handover_detail_condition({
									condition: conditionWord(asset.condition)
								})}{asset.conditionNotes ? `: ${asset.conditionNotes}` : ''}
							</p>
						{/if}
					</li>
				{/each}
			</ul>
		</WorkPanel>

		<WorkPanel heading={m.handover_detail_text()}>
			{#if handover.body}
				<pre class="font-sans text-sm whitespace-pre-wrap">{handover.body}</pre>
			{:else}
				<p class="text-sm text-[var(--ink-muted)]">{m.handover_detail_text_none()}</p>
			{/if}
		</WorkPanel>

		<WorkPanel heading={m.handover_detail_evidence()}>
			{#if handover.state === 'waived'}
				<DescriptionList
					items={[{ label: m.handover_detail_waive_reason(), value: handover.waiveReason }]}
				/>
			{:else if decided}
				<DescriptionList
					items={[
						{
							label: m.handover_detail_decided_at(),
							value: handover.decidedAt ? formatDateTime(handover.decidedAt) : null
						},
						...(handover.state === 'accepted'
							? [
									{
										label: m.handover_detail_signature(),
										value: handover.hasSignature ? m.handover_detail_signature_stored() : null
									}
								]
							: [{ label: m.handover_detail_reason(), value: handover.decisionReason }]),
						{ label: m.handover_detail_signer_ip(), value: handover.signerIp },
						{ label: m.handover_detail_signer_agent(), value: handover.signerUserAgent },
						{ label: m.handover_detail_body_hash(), value: handover.bodySha256 }
					]}
				/>
			{:else}
				<p class="text-sm text-[var(--ink-muted)]">{m.handover_detail_no_evidence()}</p>
			{/if}
		</WorkPanel>
	</div>

	{#snippet side()}
		{#if resendable}
			<WorkPanel heading={m.handover_resend()}>
				<p class="mb-[var(--space-3)] text-small text-[var(--ink-muted)]">
					{m.handover_resend_lede()}
				</p>
				<form method="POST" action="?/resend" use:enhance>
					<Button type="submit" variant="secondary">{m.handover_resend()}</Button>
				</form>
				{@render failure('resend')}
				{#if resent}
					<div class="mt-[var(--space-4)] space-y-[var(--space-2)]">
						<p class="text-sm font-medium">{m.handover_resend_done()}</p>
						<p class="text-small text-[var(--ink-muted)]">
							{resent.mailed ? m.handover_resend_mailed() : m.handover_resend_not_mailed()}
						</p>
						<p class="text-small text-[var(--ink-muted)]">
							{m.handover_resend_expires({ date: formatDateTime(new Date(resent.expiresAt)) })}
						</p>
						<SigningLinkPanel link={resent.link} qrSvg={resent.qrSvg} />
					</div>
				{/if}
			</WorkPanel>
		{/if}

		<WorkPanel heading={m.handover_document()}>
			{#if handover.hasDocument}
				<Button href="/handover-documents/{handover.id}" variant="secondary" data-sveltekit-reload>
					{m.handover_document_download()}
				</Button>
			{:else if decided}
				<p class="mb-[var(--space-3)] text-sm text-[var(--ink-muted)]">
					{m.handover_document_missing()}
				</p>
				{#if data.canManage}
					<form method="POST" action="?/generateDocument" use:enhance>
						<Button type="submit" variant="secondary">{m.handover_document_generate()}</Button>
					</form>
					{@render failure('generateDocument')}
				{/if}
			{:else}
				<p class="text-sm text-[var(--ink-muted)]">{m.handover_document_none()}</p>
			{/if}
		</WorkPanel>

		<WorkPanel heading={m.handover_detail_tickets()}>
			{#if data.tickets.length === 0}
				<p class="text-sm text-[var(--ink-muted)]">{m.handover_detail_tickets_empty()}</p>
			{:else}
				<ul class="space-y-[var(--space-2)]">
					{#each data.tickets as ticket (ticket.id)}
						<li><RecordRef record={ticket} /></li>
					{/each}
				</ul>
			{/if}
		</WorkPanel>

		<WorkPanel heading={m.handover_detail_activity()}>
			<AssetTimeline items={timeline} />
		</WorkPanel>
	{/snippet}
</PageLayout>
