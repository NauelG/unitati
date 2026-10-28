<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import { documentTitle, productName } from '#lib/brand.svelte.js';
	import Button from '#lib/components/unitati/Button.svelte';
	import Field from '#lib/components/unitati/Field.svelte';
	import FormError from '#lib/components/unitati/FormError.svelte';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import Switch from '#lib/components/unitati/Switch.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// Seeded from the stored settings, then owned by the form until it is saved.
	let buttonLabel = $state('');
	let jitProvisioning = $state(false);
	let ssoRequired = $state(false);
	let autoRedirect = $state(false);
	let seeded = false;
	$effect.pre(() => {
		if (seeded) return;
		seeded = true;
		buttonLabel = data.settings.buttonLabel ?? '';
		jitProvisioning = data.settings.jitProvisioning;
		ssoRequired = data.settings.ssoRequired;
		autoRedirect = data.settings.autoRedirect;
	});

	let busy = $state(false);
	let copied = $state(false);

	// Auto-redirect only makes sense while SSO is required: the form and the database agree.
	function setRequired(next: boolean) {
		ssoRequired = next;
		if (!next) autoRedirect = false;
	}

	async function copyRedirectUri() {
		await navigator.clipboard.writeText(data.redirectUri);
		copied = true;
	}

	const saveError = $derived(form && 'error' in form ? form.error : null);
</script>

<svelte:head>
	<title>{documentTitle(m.authentication_title())}</title>
</svelte:head>

<PageLayout variant="form">
	<PageHeader title={m.authentication_title()}>
		{#snippet summary()}{m.authentication_lede({ name: productName() })}{/snippet}
	</PageHeader>

	<section
		class="mt-[var(--space-6)] space-y-[var(--space-2)]"
		aria-labelledby="redirect-uri-title"
	>
		<h2 id="redirect-uri-title" class="text-sm font-semibold text-[var(--ink)]">
			{m.authentication_redirect_heading()}
		</h2>
		<p class="text-sm text-[var(--ink-muted)]">{m.authentication_redirect_lede()}</p>
		<div class="flex items-center gap-[var(--space-2)]">
			<code
				class="flex-1 overflow-x-auto rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)] px-[var(--space-3)] py-[var(--space-2)] font-mono text-sm select-all"
			>
				{data.redirectUri}
			</code>
			<Button type="button" variant="ghost" size="sm" onclick={copyRedirectUri}>
				{copied ? m.authentication_redirect_copied() : m.authentication_redirect_copy()}
			</Button>
		</div>
	</section>

	<form
		method="POST"
		action="?/save"
		use:enhance={() => {
			busy = true;
			return async ({ result, update }) => {
				await update({ reset: false });
				busy = false;
				if (result.type === 'success') toast.success(m.authentication_saved());
			};
		}}
		class="mt-[var(--space-6)] space-y-[var(--space-5)]"
	>
		<input type="hidden" name="jitProvisioning" value={String(jitProvisioning)} />
		<input type="hidden" name="ssoRequired" value={String(ssoRequired)} />
		<input type="hidden" name="autoRedirect" value={String(autoRedirect)} />

		<Field
			label={m.authentication_button_label()}
			name="buttonLabel"
			bind:value={buttonLabel}
			maxlength={data.buttonLabelMax}
			placeholder={m.login_sso_default_label()}
			hint={m.authentication_button_label_hint()}
		/>

		<div class="flex items-start justify-between gap-[var(--space-4)]">
			<div class="space-y-[var(--space-1)]">
				<p id="jit-label" class="text-sm font-semibold text-[var(--ink)]">
					{m.authentication_jit_label()}
				</p>
				<p class="text-sm text-[var(--ink-muted)]">{m.authentication_jit_hint()}</p>
			</div>
			<Switch
				checked={jitProvisioning}
				label={m.authentication_jit_label()}
				aria-describedby="jit-label"
				onclick={() => (jitProvisioning = !jitProvisioning)}
			/>
		</div>

		<div class="flex items-start justify-between gap-[var(--space-4)]">
			<div class="space-y-[var(--space-1)]">
				<p id="required-label" class="text-sm font-semibold text-[var(--ink)]">
					{m.authentication_required_label()}
				</p>
				<p class="text-sm text-[var(--ink-muted)]">{m.authentication_required_hint()}</p>
			</div>
			<Switch
				checked={ssoRequired}
				label={m.authentication_required_label()}
				aria-describedby="required-label"
				onclick={() => setRequired(!ssoRequired)}
			/>
		</div>

		<div class="flex items-start justify-between gap-[var(--space-4)]">
			<div class="space-y-[var(--space-1)]">
				<p id="auto-redirect-label" class="text-sm font-semibold text-[var(--ink)]">
					{m.authentication_auto_redirect_label()}
				</p>
				<p class="text-sm text-[var(--ink-muted)]">{m.authentication_auto_redirect_hint()}</p>
			</div>
			<Switch
				checked={autoRedirect}
				disabled={!ssoRequired}
				label={m.authentication_auto_redirect_label()}
				aria-describedby="auto-redirect-label"
				onclick={() => (autoRedirect = !autoRedirect)}
			/>
		</div>

		<p class="text-sm text-[var(--ink-muted)]">
			{m.authentication_break_glass({ path: data.breakGlassPath })}
		</p>

		{#if saveError}
			<FormError>{saveError}</FormError>
		{/if}

		<Button type="submit" {busy}>{m.authentication_save()}</Button>
	</form>

	<section
		class="mt-[var(--space-8)] space-y-[var(--space-3)]"
		aria-labelledby="provisioning-warnings-title"
	>
		<h2 id="provisioning-warnings-title" class="text-sm font-semibold text-[var(--ink)]">
			{m.authentication_warnings_heading()}
		</h2>
		{#if data.warnings.length === 0}
			<p class="text-sm text-[var(--ink-muted)]">{m.authentication_warnings_empty()}</p>
		{:else}
			<ul class="space-y-[var(--space-2)]">
				{#each data.warnings as warning (warning.id)}
					<li
						class="flex items-start justify-between gap-[var(--space-4)] rounded-[var(--radius-md)] border border-[var(--border)] px-[var(--space-4)] py-[var(--space-3)]"
					>
						<p class="text-sm text-[var(--ink)]">
							{#if warning.holder}
								{m.authentication_warning_email_taken({
									email: warning.email ?? '',
									holder: warning.holder.fullName
								})}
							{:else}
								{m.authentication_warning_email_taken_unknown({ email: warning.email ?? '' })}
							{/if}
						</p>
						<form method="POST" action="?/dismiss" use:enhance>
							<input type="hidden" name="id" value={warning.id} />
							<Button type="submit" variant="ghost" size="sm">
								{m.authentication_warning_dismiss()}
							</Button>
						</form>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</PageLayout>
