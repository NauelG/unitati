<script lang="ts">
	import { enhance } from '$app/forms';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import CircleX from '@lucide/svelte/icons/circle-x';
	import Clock from '@lucide/svelte/icons/clock';
	import Lock from '@lucide/svelte/icons/lock';
	import Link2Off from '@lucide/svelte/icons/link-2-off';
	import AppVersion from '#lib/components/AppVersion.svelte';
	import Button from '#lib/components/unitati/Button.svelte';
	import FormError from '#lib/components/unitati/FormError.svelte';
	import Logo from '#lib/components/unitati/Logo.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import TextAreaField from '#lib/components/unitati/TextAreaField.svelte';
	import { prose } from '#lib/components/unitati/prose.js';
	import { handoverConditionLabel } from '#lib/components/unitati/handover-condition.js';
	import { documentTitle } from '#lib/brand.svelte.js';
	import { MAX_DECISION_REASON } from '#lib/domain/handover.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';
	import SignaturePad from './SignaturePad.svelte';

	let { data, form }: PageProps = $props();

	/**
	 * What to show: the outcome of the decision just made, a link state the
	 * action discovered (it expired, or was decided elsewhere, while the page was
	 * open), or what the load found.
	 */
	const view = $derived(form?.decided ?? form?.state ?? data.signing.state);

	const signing = $derived(data.signing.state === 'pending' ? data.signing : null);

	let signature = $state('');
	let confirmed = $state(false);
	let reason = $state('');
	let pending = $state<'accept' | 'reject' | null>(null);

	const acceptError = $derived(form?.action === 'accept' ? form.message : undefined);
	const rejectError = $derived(form?.action === 'reject' ? form.message : undefined);

	const OUTCOMES = {
		accepted: {
			icon: CircleCheck,
			tone: 'text-[var(--success)]',
			title: m.signing_accepted_title,
			body: m.signing_accepted_body
		},
		rejected: {
			icon: CircleX,
			tone: 'text-[var(--ink-muted)]',
			title: m.signing_rejected_title,
			body: m.signing_rejected_body
		},
		decided: {
			icon: Lock,
			tone: 'text-[var(--ink-muted)]',
			title: m.signing_decided_title,
			body: m.signing_decided_body
		},
		expired: {
			icon: Clock,
			tone: 'text-[var(--warning)]',
			title: m.signing_expired_title,
			body: m.signing_expired_body
		},
		unknown: {
			icon: Link2Off,
			tone: 'text-[var(--ink-muted)]',
			title: m.signing_unknown_title,
			body: m.signing_unknown_body
		}
	} as const;

	function submitting(action: 'accept' | 'reject') {
		return () => {
			pending = action;
			return async ({ update }: { update: (options?: { reset?: boolean }) => Promise<void> }) => {
				pending = null;
				await update({ reset: false });
			};
		};
	}
</script>

<svelte:head>
	<title>{documentTitle(m.signing_document_title())}</title>
	<meta name="robots" content="noindex, nofollow" />
	<meta name="referrer" content="no-referrer" />
</svelte:head>

<div class="min-h-dvh bg-[var(--surface-0)] px-4 py-8 sm:px-8 sm:py-12">
	<PageLayout variant="form" class="mx-auto w-full">
		<header class="mb-[var(--space-6)]">
			<Logo size="md" />
		</header>

		{#if view === 'pending' && signing}
			<article class="space-y-[var(--space-6)]">
				<div class="space-y-[var(--space-1)]">
					<p class="font-mono text-xs text-[var(--ink-muted)]">
						{signing.direction === 'delivery'
							? m.signing_code_delivery({ code: signing.code })
							: m.signing_code_return({ code: signing.code })}
					</p>
					<h1 class="font-display text-xl font-semibold text-balance text-[var(--ink)]">
						{signing.direction === 'delivery'
							? m.signing_title_delivery()
							: m.signing_title_return()}
					</h1>
					<p class="text-sm text-[var(--ink-muted)]">
						{m.signing_expires({ date: signing.expiresOn })}
					</p>
				</div>

				<section
					aria-labelledby="handover-agreement"
					class="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)] p-[var(--space-5)]"
				>
					<h2 id="handover-agreement" class="sr-only">{m.signing_agreement()}</h2>
					<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitised by renderMarkdown on the server (ADR 0030) -->
					<div class={prose}>{@html signing.bodyHtml}</div>
				</section>

				<section aria-labelledby="handover-assets" class="space-y-[var(--space-3)]">
					<h2 id="handover-assets" class="text-label font-semibold text-[var(--ink)]">
						{m.signing_assets()}
					</h2>
					<ul
						class="divide-y divide-[var(--border)] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)]"
					>
						{#each signing.assets as asset (asset.assetTag)}
							<li class="space-y-[var(--space-1)] px-[var(--space-4)] py-[var(--space-3)]">
								<p class="font-medium text-[var(--ink)]">{asset.name}</p>
								<dl
									class="grid grid-cols-[auto_1fr] gap-x-[var(--space-3)] gap-y-0.5 text-sm text-[var(--ink-muted)]"
								>
									<dt>{m.signing_asset_model()}</dt>
									<dd class="text-[var(--ink)]">{asset.model}</dd>
									<dt>{m.signing_asset_tag()}</dt>
									<dd class="font-mono text-xs leading-5 text-[var(--ink)]">{asset.assetTag}</dd>
									<dt>{m.signing_asset_serial()}</dt>
									<dd class="font-mono text-xs leading-5 text-[var(--ink)]">
										{asset.serial ?? m.signing_asset_no_serial()}
									</dd>
									{#if asset.condition}
										<dt>{m.signing_asset_condition()}</dt>
										<dd class="text-[var(--ink)]">
											<span class={asset.condition === 'good' ? '' : 'font-medium'}>
												{handoverConditionLabel(asset.condition)}
											</span>
											{#if asset.conditionNotes}
												<span class="block text-[var(--ink-muted)]">{asset.conditionNotes}</span>
											{/if}
										</dd>
									{/if}
								</dl>
							</li>
						{/each}
					</ul>
				</section>

				<form
					method="POST"
					action="?/accept"
					class="space-y-[var(--space-4)]"
					use:enhance={submitting('accept')}
				>
					<SignaturePad
						name="signature"
						label={m.signing_signature_label()}
						hint={m.signing_signature_hint()}
						bind:value={signature}
					/>

					<label class="flex items-start gap-[var(--space-3)] text-sm text-[var(--ink)]">
						<input
							type="checkbox"
							name="confirm"
							class="mt-0.5 size-4 shrink-0 accent-[var(--action)]"
							bind:checked={confirmed}
							required
						/>
						<span>
							{signing.direction === 'delivery'
								? m.signing_confirm_delivery()
								: m.signing_confirm_return()}
						</span>
					</label>

					{#if acceptError}<FormError>{acceptError}</FormError>{/if}

					<Button
						type="submit"
						size="lg"
						class="w-full"
						busy={pending === 'accept'}
						disabled={pending !== null || !confirmed || !signature}
					>
						{m.signing_accept_submit()}
					</Button>
				</form>

				<details
					class="group rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)]"
					open={Boolean(rejectError)}
				>
					<summary
						class="cursor-pointer px-[var(--space-4)] py-[var(--space-3)] text-sm font-medium text-[var(--ink)]"
					>
						{m.signing_reject_toggle()}
					</summary>
					<form
						method="POST"
						action="?/reject"
						class="space-y-[var(--space-4)] px-[var(--space-4)] pb-[var(--space-4)]"
						use:enhance={submitting('reject')}
					>
						<TextAreaField
							label={m.signing_reject_reason()}
							hint={m.signing_reject_hint()}
							name="reason"
							rows={4}
							maxlength={MAX_DECISION_REASON}
							required
							bind:value={reason}
							error={rejectError}
						/>
						<Button
							type="submit"
							variant="danger"
							class="w-full"
							busy={pending === 'reject'}
							disabled={pending !== null || reason.trim() === ''}
						>
							{m.signing_reject_submit()}
						</Button>
					</form>
				</details>
			</article>
		{:else}
			{@const outcome = OUTCOMES[view === 'pending' ? 'unknown' : view]}
			<section class="space-y-[var(--space-3)]" aria-live="polite">
				<outcome.icon class="size-8 {outcome.tone}" aria-hidden="true" />
				<h1 class="font-display text-xl font-semibold text-[var(--ink)]">{outcome.title()}</h1>
				<p class="text-body-lg text-[var(--ink-muted)]">{outcome.body()}</p>
			</section>
		{/if}

		<footer class="mt-[var(--space-10)] flex justify-center">
			<AppVersion />
		</footer>
	</PageLayout>
</div>
