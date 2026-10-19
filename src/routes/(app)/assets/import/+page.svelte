<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '$app/forms';
	import { documentTitle } from '#lib/brand.svelte.js';
	import Alert from '#lib/components/unitati/Alert.svelte';
	import Button from '#lib/components/unitati/Button.svelte';
	import Field from '#lib/components/unitati/Field.svelte';
	import FormError from '#lib/components/unitati/FormError.svelte';
	import ImportErrors from '#lib/components/unitati/import/ImportErrors.svelte';
	import ImportSteps from '#lib/components/unitati/import/ImportSteps.svelte';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import SelectField, { type SelectOption } from '#lib/components/unitati/SelectField.svelte';
	import { statusLabel } from '#lib/components/unitati/status.js';
	import type { AssetsMapping, FieldSource, Mapping } from '#lib/domain/imports.js';
	import type { AssetState } from '#lib/domain/status.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	type Step = 'file' | 'columns' | 'preview' | 'done';
	type Summary = {
		create: number;
		skipped: number;
		newManufacturers: string[];
		newCategories: string[];
		newModels: string[];
		newLocations: string[];
		newPeople: string[];
		warnings: { noIdentity: number; categoryIgnored: number };
		ignoredColumns: string[];
		errorCount: number;
		groups: { kind: string; count: number; rows: number[] }[];
		errors: { row: number | null; column: string | null; value: string | null; kind: string }[];
	};
	type StateSuggestions = Record<string, { value: string; suggested: AssetState | null }[]>;

	/** The browser keeps the file and resends it on every step: the server remembers nothing. */
	let file = $state<File | null>(null);
	let step = $state<Step>('file');
	let headers = $state<string[]>([]);
	let sample = $state<string[][]>([]);
	/** Per target field: `''` unassigned, `'fixed'`, or `'c<index>'` for a CSV column. */
	let choice = $state<Record<string, string>>({});
	let fixed = $state<Record<string, string>>({});
	let summary = $state<Summary | null>(null);
	let stateSuggestions = $state<StateSuggestions>({});
	/** What the user picked per raw state value; anything not picked keeps the suggestion. */
	let stateOverride = $state<Record<string, string>>({});
	let result = $state<{ created: number; skipped: number } | null>(null);
	let message = $state<string | null>(null);
	let busy = $state(false);

	const stepIndex = $derived(['file', 'columns', 'preview', 'done'].indexOf(step));

	const options = $derived<SelectOption[]>([
		...headers.map((header, index) => ({
			value: `c${index}`,
			label: header
		})),
		{ value: 'fixed', label: m.import_fixed_value() }
	]);

	const fields = $derived.by<Mapping>(() => {
		const out: Mapping = {};
		for (const field of data.fields) {
			const picked = choice[field.key] ?? '';
			let source: FieldSource = null;
			if (picked === 'fixed') source = { fixed: fixed[field.key] ?? '' };
			else if (picked.startsWith('c')) source = { column: headers[Number(picked.slice(1))] };
			out[field.key] = source;
		}
		return out;
	});

	/** The distinct values of the state column, each with the state it will get. */
	const stateRows = $derived.by(() => {
		const source = fields.state;
		if (!source || !('column' in source)) return [];
		return (stateSuggestions[source.column] ?? []).map((entry) => ({
			value: entry.value,
			picked: stateOverride[entry.value] ?? entry.suggested ?? ''
		}));
	});

	const mapping = $derived<AssetsMapping>({
		fields,
		stateValues: Object.fromEntries(
			stateRows.filter((row) => row.picked !== '').map((row) => [row.value, row.picked])
		) as AssetsMapping['stateValues']
	});

	const stateOptions = $derived<SelectOption[]>(
		data.states.map((state) => ({ value: state, label: statusLabel(state) }))
	);

	const assigned = (key: string) => {
		const source = fields[key];
		return source != null && !('fixed' in source && source.fixed.trim() === '');
	};
	const canContinue = $derived(assigned('model') && stateRows.every((row) => row.picked !== ''));

	const hint = (key: string) => {
		const index = Number((choice[key] ?? '').slice(1));
		return choice[key]?.startsWith('c') ? sample[index]?.join(' · ') : undefined;
	};

	let fileError = $state<string | null>(null);

	function pick(event: Event) {
		const chosen = (event.currentTarget as HTMLInputElement).files?.[0] ?? null;
		fileError = null;
		file = chosen;
		if (chosen && chosen.size > data.maxBytes) {
			fileError = m.import_csv_too_large({ megabytes: data.maxBytes / (1024 * 1024) });
			file = null;
		}
	}

	const submit: SubmitFunction = ({ formData }) => {
		if (!file) return ({ update }) => update({ reset: false });
		formData.set('file', file);
		formData.set('mapping', JSON.stringify(mapping));
		busy = true;
		message = null;
		return async ({ result: outcome }) => {
			busy = false;
			if (outcome.type !== 'success' && outcome.type !== 'failure') {
				message = m.import_error_unexpected();
				return;
			}
			const payload = (outcome.data ?? {}) as Record<string, unknown>;
			if (typeof payload.message === 'string') {
				message = payload.message;
				return;
			}
			switch (payload.step) {
				case 'analyse': {
					headers = payload.headers as string[];
					sample = payload.sample as string[][];
					const suggested = payload.suggested as Mapping;
					choice = Object.fromEntries(
						data.fields.map((field) => {
							const source = suggested[field.key];
							const index = source && 'column' in source ? headers.indexOf(source.column) : -1;
							return [field.key, index === -1 ? '' : `c${index}`];
						})
					);
					fixed = {};
					stateSuggestions = payload.stateValues as StateSuggestions;
					stateOverride = {};
					step = 'columns';
					break;
				}
				case 'preview':
					summary = payload as unknown as Summary;
					step = 'preview';
					break;
				case 'commit':
					result = { created: payload.created as number, skipped: payload.skipped as number };
					step = 'done';
					break;
			}
		};
	};

	const KINDS: Record<string, () => string> = {
		file_unreadable: m.import_assets_error_file_unreadable,
		mapping_missing: m.import_assets_error_mapping_missing,
		too_many_state_values: m.import_assets_error_too_many_state_values,
		state_value_unmapped: m.import_assets_error_state_value_unmapped,
		state_invalid: m.import_assets_error_state_invalid,
		reserved_tag: m.import_assets_error_reserved_tag,
		duplicate_in_file: m.import_assets_error_duplicate_in_file,
		serial_taken: m.import_assets_error_serial_taken,
		model_missing: m.import_assets_error_model_missing,
		model_ambiguous: m.import_assets_error_model_ambiguous,
		model_needs_manufacturer: m.import_assets_error_model_needs_manufacturer,
		model_needs_category: m.import_assets_error_model_needs_category,
		model_category_conflict: m.import_assets_error_model_category_conflict,
		custodian_inactive: m.import_assets_error_custodian_inactive,
		custodian_not_found: m.import_assets_error_custodian_not_found,
		custodian_ambiguous: m.import_assets_error_custodian_ambiguous,
		custodian_email_invalid: m.import_assets_error_custodian_email_invalid,
		custodian_name_required: m.import_assets_error_custodian_name_required,
		location_ambiguous: m.import_assets_error_location_ambiguous,
		invalid_boolean: m.import_assets_error_invalid_boolean,
		catalogue_conflict: m.import_assets_error_catalogue_conflict,
		asset_conflict: m.import_assets_error_asset_conflict
	};

	const errorKinds = $derived(
		summary
			? Object.fromEntries(
					summary.groups.map((group) => [group.kind, KINDS[group.kind]?.() ?? group.kind])
				)
			: {}
	);
</script>

<svelte:head>
	<title>{documentTitle(m.import_assets_title())}</title>
</svelte:head>

<PageLayout variant="form">
	<PageHeader title={m.import_assets_title()}>
		{#snippet summary()}{m.import_assets_lede()}{/snippet}
	</PageHeader>

	<ImportSteps current={stepIndex} />

	<div class="mt-[var(--space-6)] space-y-[var(--space-5)]">
		{#if step === 'file'}
			<form method="POST" action="?/analyse" use:enhance={submit} class="space-y-[var(--space-4)]">
				<Field
					label={m.import_file_label()}
					type="file"
					accept=".csv,text/csv"
					onchange={pick}
					error={fileError ?? undefined}
					hint={m.import_file_hint({ megabytes: data.maxBytes / (1024 * 1024) })}
				/>
				<p class="text-small">
					<a href="/templates/unitati-assets.csv" download class="underline">
						{m.import_assets_template_link()}
					</a>
				</p>
				<FormError>{message}</FormError>
				<Button type="submit" {busy} disabled={!file}>{m.import_continue()}</Button>
			</form>
		{:else if step === 'columns'}
			<form method="POST" action="?/preview" use:enhance={submit} class="space-y-[var(--space-4)]">
				<p class="text-small text-[var(--ink-muted)]">{m.import_assets_columns_lede()}</p>
				{#each data.fields as field (field.key)}
					<div class="grid gap-[var(--space-3)] sm:grid-cols-2">
						<SelectField
							label={field.required ? `${field.label} *` : field.label}
							placeholder={m.import_unassigned()}
							{options}
							bind:value={choice[field.key]}
							hint={hint(field.key)}
						/>
						{#if choice[field.key] === 'fixed' && field.key === 'state'}
							<SelectField
								label={m.import_fixed_value_label({ field: field.label })}
								options={stateOptions}
								placeholder={m.import_unassigned()}
								bind:value={fixed[field.key]}
							/>
						{:else if choice[field.key] === 'fixed'}
							<Field
								label={m.import_fixed_value_label({ field: field.label })}
								bind:value={fixed[field.key]}
							/>
						{/if}
					</div>
				{/each}
				{#if stateRows.length > 0}
					<section class="space-y-[var(--space-3)]">
						<h2 class="text-base font-semibold">{m.import_assets_states_title()}</h2>
						<p class="text-small text-[var(--ink-muted)]">{m.import_assets_states_lede()}</p>
						{#each stateRows as row (row.value)}
							<SelectField
								label={m.import_assets_state_value_label({ value: row.value })}
								options={stateOptions}
								placeholder={m.import_unassigned()}
								value={row.picked}
								onchange={(picked) => (stateOverride[row.value] = picked ?? '')}
							/>
						{/each}
					</section>
				{/if}
				<FormError>{message}</FormError>
				<div class="flex items-center gap-[var(--space-3)]">
					<Button type="button" variant="ghost" onclick={() => (step = 'file')}>
						{m.import_back()}
					</Button>
					<Button type="submit" {busy} disabled={!canContinue}>{m.import_continue()}</Button>
				</div>
			</form>
		{:else if step === 'preview' && summary}
			<section class="space-y-[var(--space-3)]">
				<p>{m.import_assets_preview_create({ n: summary.create })}</p>
				{#if summary.skipped > 0}
					<p>{m.import_assets_preview_skipped({ n: summary.skipped })}</p>
				{/if}
				{#if summary.newManufacturers.length > 0}
					<p>
						{m.import_assets_preview_manufacturers({ names: summary.newManufacturers.join(', ') })}
					</p>
				{/if}
				{#if summary.newCategories.length > 0}
					<p>{m.import_assets_preview_categories({ names: summary.newCategories.join(', ') })}</p>
				{/if}
				{#if summary.newModels.length > 0}
					<p>{m.import_assets_preview_models({ names: summary.newModels.join(', ') })}</p>
				{/if}
				{#if summary.newLocations.length > 0}
					<p>{m.import_assets_preview_locations({ paths: summary.newLocations.join(', ') })}</p>
				{/if}
				{#if summary.newPeople.length > 0}
					<p>{m.import_assets_preview_people({ names: summary.newPeople.join(', ') })}</p>
				{/if}
				{#if summary.ignoredColumns.length > 0}
					<p class="text-[var(--ink-muted)]">
						{m.import_preview_ignored({ columns: summary.ignoredColumns.join(', ') })}
					</p>
				{/if}
			</section>

			{#if summary.warnings.noIdentity > 0 || summary.warnings.categoryIgnored > 0}
				<Alert tone="warning" title={m.import_assets_preview_warnings()}>
					<ul class="mt-[var(--space-2)] list-disc pl-5">
						{#if summary.warnings.noIdentity > 0}
							<li>{m.import_assets_warning_no_identity({ n: summary.warnings.noIdentity })}</li>
						{/if}
						{#if summary.warnings.categoryIgnored > 0}
							<li>
								{m.import_assets_warning_category_ignored({ n: summary.warnings.categoryIgnored })}
							</li>
						{/if}
					</ul>
				</Alert>
			{/if}

			{#if summary.errorCount > 0}
				<ImportErrors
					groups={summary.groups}
					errors={summary.errors}
					errorCount={summary.errorCount}
					kinds={errorKinds}
				/>
			{/if}

			<form method="POST" action="?/commit" use:enhance={submit} class="space-y-[var(--space-3)]">
				<FormError>{message}</FormError>
				<div class="flex items-center gap-[var(--space-3)]">
					<Button type="button" variant="ghost" onclick={() => (step = 'columns')}>
						{m.import_back()}
					</Button>
					{#if summary.errorCount > 0}
						<Button
							type="button"
							variant="secondary"
							onclick={() => ((file = null), (step = 'file'))}
						>
							{m.import_upload_again()}
						</Button>
					{/if}
					<Button type="submit" {busy} disabled={summary.errorCount > 0}>
						{m.import_commit()}
					</Button>
				</div>
			</form>
		{:else if step === 'done' && result}
			<Alert tone="success" title={m.import_assets_done({ n: result.created })}>
				{#if result.skipped > 0}{m.import_assets_done_skipped({ n: result.skipped })}{/if}
			</Alert>
			<Button href="/assets">{m.import_assets_back()}</Button>
		{/if}
	</div>
</PageLayout>
