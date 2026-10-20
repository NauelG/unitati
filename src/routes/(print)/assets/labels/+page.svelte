<script lang="ts">
	import { goto } from '$app/navigation';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import { documentTitle, brandAssetUrl } from '#lib/brand.svelte.js';
	import Alert from '#lib/components/unitati/Alert.svelte';
	import Button from '#lib/components/unitati/Button.svelte';
	import Field from '#lib/components/unitati/Field.svelte';
	import SelectField from '#lib/components/unitati/SelectField.svelte';
	import {
		LABEL_FORMATS,
		LABEL_FORMAT_KEYS,
		labelsPerSheet,
		parseFormat,
		type LabelFormatKey
	} from '#lib/domain/label-formats.js';
	import { m } from '#lib/paraglide/messages.js';
	import LabelSheets from './LabelSheets.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const spec = $derived(LABEL_FORMATS[data.format]);
	const pageRule = $derived(
		`@page { size: ${spec.pageMm.width}mm ${spec.pageMm.height}mm; margin: 0 }`
	);

	const formatNames: Record<LabelFormatKey, () => string> = {
		'a4-3x8': m.labels_format_a4_3x8,
		'a4-4x10': m.labels_format_a4_4x10,
		'roll-62x29': m.labels_format_roll
	};
	const formatOptions = LABEL_FORMAT_KEYS.map((key) => ({ value: key, label: formatNames[key]() }));

	/** Where "Volver" goes: the one asset's record, or the list a batch came from. */
	const backHref = $derived(
		data.requested.length === 1 ? `/assets/${encodeURIComponent(data.requested[0])}` : '/assets'
	);

	// The skip is shown 1-based; the URL carries it 0-based, like the layout module.
	let position = $derived(data.skip + 1);

	function reload(format: LabelFormatKey, skip: number) {
		const params = new SvelteURLSearchParams();
		for (const tag of data.requested) params.append('tag', tag);
		params.set('format', format);
		if (LABEL_FORMATS[format].sheet && skip > 0) params.set('skip', String(skip));
		goto(`?${params}`, { replace: true, reset: false });
	}

	function onPosition(event: Event) {
		const value = Number((event.currentTarget as HTMLInputElement).value);
		const perSheet = labelsPerSheet(data.format);
		const clamped = Number.isInteger(value) ? Math.min(Math.max(value, 1), perSheet) : 1;
		reload(data.format, clamped - 1);
	}
</script>

<svelte:head>
	<title>{documentTitle(m.labels_title())}</title>
	<!-- Millimetres, not pixels: the page size is the sheet size (ADR 0038). -->
	<svelte:element this={"style"}>{pageRule}</svelte:element>
</svelte:head>

<div
	class="toolbar flex flex-wrap items-end gap-4 border-b border-zinc-200 bg-white p-4 print:hidden"
>
	<SelectField
		label={m.labels_format()}
		name="format"
		options={formatOptions}
		value={data.format}
		onchange={(value) => reload(parseFormat(value), data.skip)}
		class="w-64"
	/>

	{#if spec.sheet}
		<Field
			label={m.labels_start_position()}
			name="skip"
			type="number"
			min="1"
			max={labelsPerSheet(data.format)}
			value={String(position)}
			onchange={onPosition}
			class="w-40"
		/>
	{/if}

	<Button type="button" onclick={() => window.print()}>{m.labels_print()}</Button>
	<Button href={backHref} variant="ghost">{m.labels_back()}</Button>

	<p class="w-full text-sm text-zinc-600" data-origin>
		{m.labels_points_to({ address: data.origin })}
	</p>

	{#if data.originMismatch}
		<Alert tone="warning" class="w-full">
			{m.labels_origin_mismatch({ requestOrigin: data.requestOrigin, origin: data.origin })}
		</Alert>
	{/if}

	{#if data.missing.length > 0}
		<Alert tone="warning" class="w-full">
			{m.labels_missing({ n: data.missing.length, tags: data.missing.join(', ') })}
		</Alert>
	{/if}
</div>

{#if data.labels.length === 0}
	<p class="p-4 print:hidden">{m.labels_empty()}</p>
{:else}
	<LabelSheets
		labels={data.labels}
		format={data.format}
		skip={data.skip}
		productName={data.brand.productName}
		markUrl={brandAssetUrl('mark', data.brand)}
		qrModules={data.qrModules}
	/>
{/if}
