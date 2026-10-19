<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '$app/forms';
	import { documentTitle } from '#lib/brand.svelte.js';
	import Alert from '#lib/components/unitati/Alert.svelte';
	import Button from '#lib/components/unitati/Button.svelte';
	import Field from '#lib/components/unitati/Field.svelte';
	import FormError from '#lib/components/unitati/FormError.svelte';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import SelectField, { type SelectOption } from '#lib/components/unitati/SelectField.svelte';
	import type { FieldSource, Mapping } from '#lib/domain/imports.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	type Step = 'file' | 'columns' | 'preview' | 'done';
	type Summary = {
		create: number;
		skipped: number;
		newDepartments: string[];
		newLocations: string[];
		ignoredColumns: string[];
		errorCount: number;
		groups: { kind: string; count: number; rows: number[] }[];
		errors: { row: number | null; column: string | null; value: string | null; kind: string }[];
	};

	/** The browser keeps the file and resends it on every step: the server remembers nothing. */
	let file = $state<File | null>(null);
	let step = $state<Step>('file');
	let headers = $state<string[]>([]);
	let sample = $state<string[][]>([]);
	/** Per target field: `''` unassigned, `'fixed'`, or `'c<index>'` for a CSV column. */
	let choice = $state<Record<string, string>>({});
	let fixed = $state<Record<string, string>>({});
	let summary = $state<Summary | null>(null);
	let result = $state<{ created: number; skipped: number } | null>(null);
	let message = $state<string | null>(null);
	let busy = $state(false);

	const STEPS: { id: Step; label: () => string }[] = [
		{ id: 'file', label: () => m.import_step_file() },
		{ id: 'columns', label: () => m.import_step_columns() },
		{ id: 'preview', label: () => m.import_step_preview() },
		{ id: 'done', label: () => m.import_step_result() }
	];
	const stepIndex = $derived(STEPS.findIndex((entry) => entry.id === step));

	const options = $derived<SelectOption[]>([
		...headers.map((header, index) => ({
			value: `c${index}`,
			label: header
		})),
		{ value: 'fixed', label: m.import_fixed_value() }
	]);

	const mapping = $derived.by<Mapping>(() => {
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

	const assigned = (key: string) => {
		const source = mapping[key];
		return source != null && !('fixed' in source && source.fixed.trim() === '');
	};
	const canContinue = $derived(
		assigned('email') && (assigned('fullName') || (assigned('firstName') && assigned('lastName')))
	);

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

	const errorKinds = $derived(
		summary
			? Object.fromEntries(
					summary.groups.map((group) => [
						group.kind,
						(
							{
								file_unreadable: m.import_error_file_unreadable,
								mapping_missing: m.import_error_mapping_missing,
								full_name_missing: m.import_error_full_name_missing,
								full_name_too_long: m.import_error_full_name_too_long,
								email_missing: m.import_error_email_missing,
								email_invalid: m.import_error_email_invalid,
								duplicate_in_file: m.import_error_duplicate_in_file,
								duplicate_email: m.import_error_duplicate_email,
								department_too_long: m.import_error_department_too_long,
								location_ambiguous: m.import_error_location_ambiguous,
								catalogue_conflict: m.import_error_catalogue_conflict
							} as Record<string, () => string>
						)[group.kind]?.() ?? group.kind
					])
				)
			: {}
	);
</script>

<svelte:head>
	<title>{documentTitle(m.import_title())}</title>
</svelte:head>

<PageLayout variant="form">
	<PageHeader title={m.import_title()}>
		{#snippet summary()}{m.import_lede()}{/snippet}
	</PageHeader>

	<ol
		class="mt-[var(--space-5)] flex flex-wrap gap-[var(--space-4)] text-sm"
		aria-label={m.import_steps_label()}
	>
		{#each STEPS as entry, index (entry.id)}
			<li
				class={index === stepIndex ? 'font-semibold text-[var(--ink)]' : 'text-[var(--ink-muted)]'}
				aria-current={index === stepIndex ? 'step' : undefined}
			>
				{index + 1}. {entry.label()}
			</li>
		{/each}
	</ol>

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
					<a href="/templates/unitati-people.csv" download class="underline">
						{m.import_template_link()}
					</a>
				</p>
				<FormError>{message}</FormError>
				<Button type="submit" {busy} disabled={!file}>{m.import_continue()}</Button>
			</form>
		{:else if step === 'columns'}
			<form method="POST" action="?/preview" use:enhance={submit} class="space-y-[var(--space-4)]">
				<p class="text-small text-[var(--ink-muted)]">{m.import_columns_lede()}</p>
				{#each data.fields as field (field.key)}
					<div class="grid gap-[var(--space-3)] sm:grid-cols-2">
						<SelectField
							label={field.required ? `${field.label} *` : field.label}
							placeholder={m.import_unassigned()}
							{options}
							bind:value={choice[field.key]}
							hint={hint(field.key)}
						/>
						{#if choice[field.key] === 'fixed'}
							<Field
								label={m.import_fixed_value_label({ field: field.label })}
								bind:value={fixed[field.key]}
							/>
						{/if}
					</div>
				{/each}
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
				<p>{m.import_preview_create({ n: summary.create })}</p>
				{#if summary.skipped > 0}
					<p>{m.import_preview_skipped({ n: summary.skipped })}</p>
				{/if}
				{#if summary.newDepartments.length > 0}
					<p>{m.import_preview_departments({ names: summary.newDepartments.join(', ') })}</p>
				{/if}
				{#if summary.newLocations.length > 0}
					<p>{m.import_preview_locations({ paths: summary.newLocations.join(', ') })}</p>
				{/if}
				{#if summary.ignoredColumns.length > 0}
					<p class="text-[var(--ink-muted)]">
						{m.import_preview_ignored({ columns: summary.ignoredColumns.join(', ') })}
					</p>
				{/if}
			</section>

			{#if summary.errorCount > 0}
				<Alert tone="danger" title={m.import_nothing_imported()}>
					<ul class="mt-[var(--space-2)] list-disc pl-5">
						{#each summary.groups as group (group.kind)}
							<li>
								{errorKinds[group.kind]} ({group.count}){#if group.rows.length > 0}
									— {m.import_error_rows({ rows: group.rows.join(', ') })}{/if}
							</li>
						{/each}
					</ul>
				</Alert>
				<div class="overflow-x-auto">
					<table class="w-full text-sm">
						<thead>
							<tr class="text-left">
								<th class="py-1 pr-3">{m.import_table_row()}</th>
								<th class="py-1 pr-3">{m.import_table_column()}</th>
								<th class="py-1 pr-3">{m.import_table_value()}</th>
								<th class="py-1">{m.import_table_reason()}</th>
							</tr>
						</thead>
						<tbody>
							{#each summary.errors as error, index (index)}
								<tr class="border-t border-[var(--border)]">
									<td class="py-1 pr-3">{error.row ?? ''}</td>
									<td class="py-1 pr-3">{error.column ?? ''}</td>
									<td class="py-1 pr-3">{error.value ?? ''}</td>
									<td class="py-1">{errorKinds[error.kind]}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				{#if summary.errorCount > summary.errors.length}
					<p class="text-small text-[var(--ink-muted)]">
						{m.import_errors_truncated({ shown: summary.errors.length, total: summary.errorCount })}
					</p>
				{/if}
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
			<Alert tone="success" title={m.import_done({ n: result.created })}>
				{#if result.skipped > 0}{m.import_done_skipped({ n: result.skipped })}{/if}
			</Alert>
			<Button href="/directory">{m.import_back_to_directory()}</Button>
		{/if}
	</div>
</PageLayout>
