<script lang="ts">
	import { documentTitle } from '#lib/brand.svelte.js';
	import Button from '#lib/components/unitati/Button.svelte';
	import EmptyState from '#lib/components/unitati/EmptyState.svelte';
	import { field } from '#lib/components/unitati/Field.svelte';
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import Pager from '#lib/components/unitati/Pager.svelte';
	import { projectHref, taskHref, ticketHref } from '#lib/domain/routes.js';
	import { decimalHours, formatMinutes } from '#lib/domain/time.js';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const input = field().input();
	const report = $derived(data.report);

	/** The current filters as a query string, with an optional page, shared by the pager and the export. */
	function query(extra: Record<string, string> = {}): string {
		const { from, to, personId, typeId, projectTag, recordTag } = data.filters;
		const pairs: Record<string, string | undefined> = {
			from,
			to,
			person: personId,
			type: typeId,
			project: projectTag,
			record: recordTag,
			...extra
		};
		const parts = Object.entries(pairs)
			.filter(([, value]) => value)
			.map(([key, value]) => `${key}=${encodeURIComponent(value!)}`);
		return parts.length ? `?${parts.join('&')}` : '';
	}

	const cell = 'px-[var(--space-3)] py-[var(--space-2)] align-top';
	const head =
		'px-[var(--space-3)] h-8 text-left align-middle text-xs leading-4 font-semibold tracking-[0.04em] text-[var(--ink-muted)] bg-[var(--surface-2)]';
	const recordHref = (kind: 'ticket' | 'task', tag: string) =>
		kind === 'ticket' ? ticketHref(tag) : taskHref(tag);
</script>

<svelte:head>
	<title>{documentTitle(m.time_report_title())}</title>
</svelte:head>

<PageLayout variant="index">
	<PageHeader title={m.time_report_title()}>
		{#snippet summary()}{m.time_report_lede()}{/snippet}
		{#snippet actions()}
			<Button href="/time/export.csv{query()}" variant="secondary">{m.time_report_export()}</Button>
		{/snippet}
	</PageHeader>

	<form
		method="GET"
		class="mt-[var(--space-6)] grid gap-[var(--space-3)] sm:grid-cols-3 lg:grid-cols-6"
	>
		<label class="flex flex-col gap-[var(--space-1)]">
			<span class="text-label text-[var(--ink)]">{m.time_report_from()}</span>
			<input type="date" name="from" value={data.filters.from ?? ''} class={input} />
		</label>
		<label class="flex flex-col gap-[var(--space-1)]">
			<span class="text-label text-[var(--ink)]">{m.time_report_to()}</span>
			<input type="date" name="to" value={data.filters.to ?? ''} class={input} />
		</label>
		<label class="flex flex-col gap-[var(--space-1)]">
			<span class="text-label text-[var(--ink)]">{m.time_report_person()}</span>
			<select name="person" class={input}>
				<option value="">{m.time_report_any()}</option>
				{#each data.people as person (person.id)}
					<option value={person.id} selected={person.id === data.filters.personId}>
						{person.fullName}
					</option>
				{/each}
			</select>
		</label>
		<label class="flex flex-col gap-[var(--space-1)]">
			<span class="text-label text-[var(--ink)]">{m.time_panel_type()}</span>
			<select name="type" class={input}>
				<option value="">{m.time_report_any()}</option>
				{#each data.types as type (type.id)}
					<option value={type.id} selected={type.id === data.filters.typeId}>
						{type.name}{type.archived ? ` (${m.time_settings_archived()})` : ''}
					</option>
				{/each}
			</select>
		</label>
		<label class="flex flex-col gap-[var(--space-1)]">
			<span class="text-label text-[var(--ink)]">{m.time_report_project()}</span>
			<input
				name="project"
				value={data.filters.projectTag ?? ''}
				placeholder="PRJ-0001"
				class={input}
			/>
		</label>
		<label class="flex flex-col gap-[var(--space-1)]">
			<span class="text-label text-[var(--ink)]">{m.time_report_record()}</span>
			<input
				name="record"
				value={data.filters.recordTag ?? ''}
				placeholder="TCK-0001 / TSK-0001"
				class={input}
			/>
		</label>
		<div class="flex items-end gap-[var(--space-2)] sm:col-span-3 lg:col-span-6">
			<Button type="submit" size="sm">{m.time_report_filter()}</Button>
			<Button href="/time" variant="ghost" size="sm">{m.time_report_clear()}</Button>
		</div>
	</form>

	<p class="mt-[var(--space-4)] mb-0 text-sm text-[var(--ink)]" data-testid="report-total">
		{m.time_report_total({
			count: report.total,
			duration: formatMinutes(report.totalMinutes),
			hours: decimalHours(report.totalMinutes)
		})}
	</p>

	<div
		class="mt-[var(--space-3)] overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)]"
	>
		{#if report.rows.length === 0}
			<EmptyState description={m.time_report_empty()} />
		{:else}
			<table class="w-full border-collapse text-sm">
				<thead>
					<tr>
						<th scope="col" class={head}>{m.time_panel_date()}</th>
						<th scope="col" class={head}>{m.time_report_person()}</th>
						<th scope="col" class={head}>{m.time_panel_type()}</th>
						<th scope="col" class="{head} text-right">{m.time_report_duration()}</th>
						<th scope="col" class={head}>{m.time_report_record()}</th>
						<th scope="col" class={head}>{m.time_report_project()}</th>
						<th scope="col" class={head}>{m.time_panel_note()}</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-[var(--border)]">
					{#each report.rows as row (row.id)}
						<tr>
							<td class="{cell} whitespace-nowrap tabular-nums">{row.workDate}</td>
							<td class={cell}>{row.personName}</td>
							<td class={cell}>{row.typeName}</td>
							<td class="{cell} text-right whitespace-nowrap tabular-nums">
								{formatMinutes(row.minutes)}
							</td>
							<td class={cell}>
								<a
									class="text-[var(--brand)] hover:underline"
									href={recordHref(row.record.kind, row.record.tag)}>{row.record.tag}</a
								>
								<span class="text-[var(--ink-muted)]">{row.record.title}</span>
							</td>
							<td class={cell}>
								{#if row.project}
									<a
										class="text-[var(--brand)] hover:underline"
										href={projectHref(row.project.tag)}
									>
										{row.project.tag}
									</a>
									<span class="text-[var(--ink-muted)]">{row.project.name}</span>
								{/if}
							</td>
							<td class="{cell} whitespace-pre-line">{row.note ?? ''}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</div>

	<Pager
		class="mt-[var(--space-4)]"
		page={report.page}
		pageCount={report.pageCount}
		perPage={report.perPage}
		total={report.total}
		href={(next) => `/time${query({ page: String(next) })}`}
	/>
</PageLayout>
