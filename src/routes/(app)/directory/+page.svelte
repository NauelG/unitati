<script lang="ts">
	import PageHeader from '#lib/components/unitati/PageHeader.svelte';
	import PageLayout from '#lib/components/unitati/PageLayout.svelte';
	import { m } from '#lib/paraglide/messages.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const roleLabels: Record<string, string> = {
		admin: m.role_admin(),
		technician: m.role_technician(),
		employee: m.role_employee()
	};
</script>

<svelte:head>
	<title>{m.directory_title()} · {m.app_name()}</title>
</svelte:head>

<PageLayout variant="index">
	<PageHeader title={m.directory_title()}>
		{#snippet summary()}{m.directory_lede()}{/snippet}
	</PageHeader>

	<div
		class="mt-6 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)]"
	>
		<table class="w-full text-sm">
			<thead>
				<tr class="border-b border-[var(--border)] text-left text-[var(--ink-muted)]">
					<th class="px-4 py-3 font-medium">{m.directory_column_name()}</th>
					<th class="px-4 py-3 font-medium">{m.directory_column_email()}</th>
					<th class="px-4 py-3 font-medium">{m.directory_column_department()}</th>
					<th class="px-4 py-3 font-medium">{m.directory_column_role()}</th>
				</tr>
			</thead>
			<tbody>
				{#each data.people as person (person.id)}
					<tr class="border-b border-[var(--border)] last:border-0">
						<td class="px-4 font-medium text-[var(--ink)]" style:height="var(--size-row)">
							{person.fullName}
						</td>
						<td class="px-4 text-[var(--ink-muted)]">{person.email}</td>
						<td class="px-4 text-[var(--ink-muted)]">
							{person.departmentName ?? m.directory_no_department()}
						</td>
						<td class="px-4 text-[var(--ink-muted)]">
							{person.role ? (roleLabels[person.role] ?? person.role) : '—'}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</PageLayout>
