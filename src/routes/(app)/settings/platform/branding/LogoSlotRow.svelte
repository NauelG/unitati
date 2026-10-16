<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import { brandAssetUrl } from '#lib/brand.svelte.js';
	import Button from '#lib/components/unitati/Button.svelte';
	import Logo from '#lib/components/unitati/Logo.svelte';
	import { LOGO_MAX_BYTES, type BrandView, type UploadSlot } from '#lib/domain/brand.js';
	import { m } from '#lib/paraglide/messages.js';

	interface Props {
		slot: UploadSlot;
		label: string;
		hint: string;
		brand: Pick<BrandView, 'productName' | 'assets'>;
		/** The refusal the server sent for this slot, if the last submit was this row's. */
		serverError?: string;
	}

	let { slot, label, hint, brand, serverError }: Props = $props();

	let busy = $state(false);
	/** Set by the pre-check: the file never leaves the browser. */
	let clientError = $state('');
	let input: HTMLInputElement | undefined = $state();
	let chosen = $state(false);

	const url = $derived(brandAssetUrl(slot, brand));
	const error = $derived(clientError || serverError || '');
	const dark = $derived(slot === 'lockup_dark');

	/**
	 * What would show if nothing were uploaded here. The dark row inherits the horizontal
	 * logo (the golden rule), so its fallback sees that slot and nothing else.
	 */
	const fallbackBrand = $derived({
		productName: brand.productName,
		customised: true,
		assets: dark && brand.assets.lockup ? { lockup: brand.assets.lockup } : {}
	});

	function onchange() {
		const file = input?.files?.[0];
		clientError = '';
		chosen = Boolean(file);
		if (file && file.size > LOGO_MAX_BYTES) {
			clientError = m.branding_logo_error_too_large();
			if (input) input.value = '';
			chosen = false;
		}
	}
</script>

<form
	method="POST"
	action="?/uploadAsset"
	enctype="multipart/form-data"
	use:enhance={({ action, cancel }) => {
		const removing = action.search === '?/removeAsset';
		if (!removing && !chosen) {
			clientError = m.branding_logo_error_missing();
			cancel();
			return;
		}
		busy = true;
		return async ({ result, update }) => {
			await update();
			busy = false;
			chosen = false;
			if (result.type === 'success') {
				toast.success(removing ? m.branding_logo_removed() : m.branding_logo_uploaded());
			}
		};
	}}
	class="grid items-center gap-x-[var(--space-4)] gap-y-[var(--space-2)] sm:grid-cols-[minmax(0,12rem)_1fr]"
	data-testid="logo-row-{slot}"
>
	<input type="hidden" name="slot" value={slot} />

	<div
		class="{dark
			? 'dark bg-[var(--surface-1)] '
			: ''}flex h-20 items-center overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-strong)] [background-image:conic-gradient(var(--surface-2)_25%,transparent_0_50%,var(--surface-2)_0_75%,transparent_0)] [background-size:16px_16px] p-[var(--space-2)]"
	>
		{#if url}
			<img src={url} alt="" class="max-h-full w-auto max-w-full object-contain" />
		{:else}
			<Logo brand={fallbackBrand} variant={slot === 'mark' ? 'mark' : 'lockup'} size="md" />
		{/if}
	</div>

	<div class="space-y-[var(--space-2)]">
		<label for="logo-file-{slot}" class="block text-[13px] leading-4 font-medium text-[var(--ink)]">
			{label}
		</label>
		<input
			bind:this={input}
			id="logo-file-{slot}"
			type="file"
			name="file"
			accept="image/svg+xml,image/png,image/webp,image/jpeg"
			{onchange}
			aria-describedby="logo-help-{slot}"
			aria-invalid={error ? 'true' : undefined}
			class="block w-full text-sm text-[var(--ink)]"
		/>
		<p
			id="logo-help-{slot}"
			class="text-[13px] leading-[18px] {error
				? 'text-[var(--danger)]'
				: 'text-[var(--ink-muted)]'}"
			role={error ? 'alert' : undefined}
		>
			{error || hint}
		</p>
		<div class="flex items-center gap-[var(--space-2)]">
			<Button type="submit" size="sm" variant="secondary" {busy}>
				{url ? m.branding_logo_replace() : m.branding_logo_upload()}
			</Button>
			{#if url}
				<Button
					type="submit"
					size="sm"
					variant="ghost"
					formaction="?/removeAsset"
					formenctype="application/x-www-form-urlencoded"
					formnovalidate
				>
					{m.branding_logo_remove()}
				</Button>
			{/if}
		</div>
	</div>
</form>
