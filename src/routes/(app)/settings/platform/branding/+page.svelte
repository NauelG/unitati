<script lang="ts">
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import { documentTitle } from '#lib/brand.svelte.js';
	import Button from '#lib/components/unitati/Button.svelte';
	import Field from '#lib/components/unitati/Field.svelte';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import { parseHex } from '#lib/domain/brand-color.js';
	import { m } from '#lib/paraglide/messages.js';
	import BrandPreview from './BrandPreview.svelte';
	import LogoSlotRow from './LogoSlotRow.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let busy = $state(false);

	/** What the person typed if the save was refused, so a mistake never costs them the text. */
	const failed = $derived(form && 'error' in form ? form : null);

	const logoRows = $derived([
		{ slot: 'lockup', label: m.branding_logo_lockup(), hint: m.branding_logo_lockup_hint() },
		{
			slot: 'lockup_dark',
			label: m.branding_logo_lockup_dark(),
			hint: m.branding_logo_lockup_dark_hint()
		},
		{ slot: 'mark', label: m.branding_logo_mark(), hint: m.branding_logo_mark_hint() }
	] as const);

	/** The refusal of the last upload, keyed by the slot that earned it. */
	const assetError = $derived(form && 'assetError' in form ? form.assetError : null);

	let formEl: HTMLFormElement | undefined = $state();

	// The picker and the text field are two views of one value, so they stay in sync.
	// Seeded from the stored colour (or what was refused), then owned by the editor.
	let productName = $state('');
	let color = $state('');
	let seeded = false;
	$effect.pre(() => {
		if (seeded) return;
		seeded = true;
		productName = failed?.productName ?? data.brand.productName;
		color = failed?.brandColor ?? data.brand.brandColor ?? '';
	});

	/** `<input type="color">` only takes a full `#rrggbb`; fall back to Unitati's blue while empty. */
	const pickerValue = $derived(parseHex(color) ?? '#1d5cf0');

	function useUnitatiColor() {
		color = '';
		formEl?.requestSubmit();
	}
</script>

<svelte:head>
	<title>{documentTitle(m.branding_title())}</title>
</svelte:head>

<PageLayout variant="form">
	<PageHeader title={m.branding_title()}>
		{#snippet summary()}{m.branding_lede()}{/snippet}
	</PageHeader>

	<form
		bind:this={formEl}
		method="POST"
		action="?/save"
		use:enhance={() => {
			busy = true;
			return async ({ result, update }) => {
				await update({ reset: false });
				busy = false;
				if (result.type === 'success') toast.success(m.branding_saved());
			};
		}}
		class="mt-[var(--space-6)] space-y-[var(--space-4)]"
	>
		<Field
			label={m.branding_product_name()}
			name="productName"
			bind:value={productName}
			maxlength={data.productNameMax}
			hint={m.branding_product_name_hint()}
			error={failed?.error ?? undefined}
			required
		/>

		<div class="space-y-[var(--space-2)]">
			<div class="flex items-end gap-[var(--space-3)]">
				<input
					type="color"
					aria-label={m.branding_color_picker()}
					value={pickerValue}
					oninput={(event) => (color = event.currentTarget.value)}
					class="h-[var(--size-control-md)] w-12 shrink-0 cursor-pointer rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface-1)] p-1"
				/>
				<Field
					class="flex-1"
					label={m.branding_color()}
					name="brandColor"
					bind:value={color}
					placeholder="#1d5cf0"
					spellcheck={false}
					autocomplete="off"
					hint={m.branding_color_hint()}
					error={failed?.colorError ?? undefined}
				/>
			</div>
			<Button type="button" variant="ghost" size="sm" onclick={useUnitatiColor}>
				{m.branding_color_reset()}
			</Button>
		</div>

		<BrandPreview {color} {productName} assets={data.brand.assets} />

		<div class="flex items-center gap-[var(--space-3)]">
			<Button type="submit" {busy}>{m.branding_save()}</Button>
		</div>
	</form>

	<section class="mt-[var(--space-8)] space-y-[var(--space-4)]" aria-labelledby="brand-logos-title">
		<h2 id="brand-logos-title" class="text-sm font-semibold text-[var(--ink)]">
			{m.branding_logos_title()}
		</h2>
		{#each logoRows as row (row.slot)}
			<LogoSlotRow
				{...row}
				brand={data.brand}
				serverError={assetError?.slot === row.slot ? assetError.message : undefined}
			/>
		{/each}
	</section>
</PageLayout>
