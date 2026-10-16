<script lang="ts">
	import Alert from '#lib/components/unitati/Alert.svelte';
	import Button from '#lib/components/unitati/Button.svelte';
	import KpiCard from '#lib/components/unitati/KpiCard.svelte';
	import Logo from '#lib/components/unitati/Logo.svelte';
	import StatusBadge from '#lib/components/unitati/StatusBadge.svelte';
	import { deriveBrand, parseHex, type BrandTokens } from '#lib/domain/brand-color.js';
	import type { BrandView } from '#lib/domain/brand.js';
	import { m } from '#lib/paraglide/messages.js';

	interface Props {
		/** What the colour field holds right now, typed or picked: parsed here, on every input. */
		color: string;
		productName: string;
		/** The saved logos: an upload applies on submit, so the preview never shows a pending file. */
		assets: BrandView['assets'];
	}

	let { color, productName, assets }: Props = $props();

	/** The blue Unitati ships, used while the field is empty or not yet a valid hex. */
	const UNITATI_BLUE = '#1d5cf0';

	const input = $derived(parseHex(color));
	const result = $derived(deriveBrand(input ?? UNITATI_BLUE));
	const adjusted = $derived(input !== null && result.adjusted);
	const brand = $derived({
		productName: productName.trim() || 'Unitati',
		customised: true,
		assets
	});

	function vars(tokens: BrandTokens): string {
		return [
			`--brand:${tokens.brand}`,
			`--brand-hover:${tokens.brandHover}`,
			`--brand-soft:${tokens.brandSoft}`,
			`--on-brand:${tokens.onBrand}`,
			`--focus:${tokens.brand}`
		].join(';');
	}

	const panels = $derived([
		{ id: 'light', label: m.branding_preview_light(), tokens: result.light, dark: false },
		{ id: 'dark', label: m.branding_preview_dark(), tokens: result.dark, dark: true }
	]);
</script>

<section class="space-y-[var(--space-3)]" aria-labelledby="brand-preview-title">
	<h2 id="brand-preview-title" class="text-sm font-semibold text-[var(--ink)]">
		{m.branding_preview_title()}
	</h2>

	{#if adjusted && input}
		<Alert tone="info">
			{m.branding_adjusted({ applied: result.light.brand, input })}
			<span class="mt-[var(--space-2)] flex flex-wrap items-center gap-[var(--space-4)]">
				{#each [{ label: m.branding_adjusted_applied(), hex: result.light.brand }, { label: m.branding_adjusted_original(), hex: input }] as swatch (swatch.label)}
					<span class="inline-flex items-center gap-[var(--space-2)] text-xs">
						<span
							class="size-4 rounded-[var(--radius-sm)] border border-[var(--border-strong)]"
							style:background-color={swatch.hex}
							aria-hidden="true"
						></span>
						{swatch.label}: <code class="font-mono">{swatch.hex}</code>
					</span>
				{/each}
			</span>
		</Alert>
	{/if}

	<div class="grid gap-[var(--space-4)] md:grid-cols-2">
		{#each panels as panel (panel.id)}
			<div
				class="{panel.dark
					? 'dark '
					: ''}space-y-[var(--space-3)] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-0)] p-[var(--space-4)] text-[var(--ink)]"
				style={vars(panel.tokens)}
				data-testid="brand-preview-{panel.id}"
			>
				<p class="text-xs font-semibold text-[var(--ink-muted)]">
					{panel.label}
					{#if panel.dark}
						<span class="font-mono font-normal">
							· {m.branding_preview_dark_color({ hex: panel.tokens.brand })}
						</span>
					{/if}
				</p>

				<div class="flex items-center gap-[var(--space-3)]">
					<Logo {brand} size="sm" />
					<Logo {brand} variant="mark" size="sm" />
				</div>

				<nav class="flex flex-col gap-0.5" aria-hidden="true">
					<span
						class="flex min-h-10 items-center rounded-[var(--radius-md)] bg-[var(--brand-soft)] px-[var(--space-2)] text-sm leading-5 font-medium text-[var(--brand)]"
					>
						{m.branding_preview_nav_active()}
					</span>
					<span
						class="flex min-h-10 items-center rounded-[var(--radius-md)] px-[var(--space-2)] text-sm leading-5 font-medium text-[var(--ink)]"
					>
						{m.branding_preview_nav_other()}
					</span>
				</nav>

				<div class="flex flex-wrap items-center gap-[var(--space-3)]">
					<StatusBadge status="new" label={m.branding_preview_badge()} />
					<label class="inline-flex items-center gap-[var(--space-2)] text-sm">
						<input type="checkbox" checked class="accent-[var(--brand)]" />
						{m.branding_preview_checkbox()}
					</label>
					<Button
						type="button"
						variant="secondary"
						size="sm"
						class="ring-2 ring-[var(--focus)] ring-offset-2 ring-offset-[var(--surface-0)]"
					>
						{m.branding_preview_focus()}
					</Button>
				</div>

				<KpiCard label={m.branding_preview_kpi()} value={12} tone="brand" />
			</div>
		{/each}
	</div>
</section>
