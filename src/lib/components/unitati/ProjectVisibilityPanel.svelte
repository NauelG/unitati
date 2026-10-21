<script lang="ts">
	import X from '@lucide/svelte/icons/x';
	import { enhance } from '$app/forms';
	import Button from './Button.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import FormError from './FormError.svelte';
	import SearchSelectField from './SearchSelectField.svelte';
	import { badge } from './StatusBadge.svelte';
	import WorkPanel from './WorkPanel.svelte';
	import { m } from '#lib/paraglide/messages.js';

	/**
	 * The "Visibilidad" panel of a project record (ADR 0041): who can see the
	 * project, and, when it is members-only, the list of members. Editable only
	 * for the owner and admins (`editable`); everybody else reads it. The server
	 * actions re-check who is asking, so hiding the controls is a courtesy.
	 */
	interface Member {
		personId: string;
		fullName: string;
		isOwner: boolean;
		taskCount: number;
	}

	interface Props {
		visibility: 'organisation' | 'members';
		members: Member[];
		candidates: { id: string; fullName: string }[];
		editable: boolean;
		/** Refusals from the three actions, by action. */
		errors: { setVisibility?: string; addMember?: string; removeMember?: string };
	}

	let { visibility, members, candidates, editable, errors }: Props = $props();

	let chosen = $derived(visibility);
	let newMember = $state<string | null>(null);
	let saving = $state(false);
	let removing = $state<Member | null>(null);
	let removePending = $state(false);

	const options = $derived([
		{ value: 'organisation', label: m.project_visibility_organisation() },
		{ value: 'members', label: m.project_visibility_members() }
	]);
	const candidateOptions = $derived(
		candidates.map((person) => ({ value: person.id, label: person.fullName }))
	);
</script>

<WorkPanel heading={m.project_visibility_title()} id="project-visibility">
	{#if editable}
		<form
			method="POST"
			action="?/setVisibility"
			class="space-y-[var(--space-3)]"
			use:enhance={() => {
				saving = true;
				return async ({ update }) => {
					await update({ reset: false });
					saving = false;
				};
			}}
		>
			<fieldset class="space-y-[var(--space-2)]">
				<legend class="sr-only">{m.project_visibility_title()}</legend>
				{#each options as option (option.value)}
					<label class="flex items-center gap-[var(--space-2)] text-sm text-[var(--ink)]">
						<input type="radio" name="visibility" value={option.value} bind:group={chosen} />
						{option.label}
					</label>
				{/each}
			</fieldset>
			<FormError>{errors.setVisibility}</FormError>
			{#if chosen !== visibility}
				<Button type="submit" size="sm" busy={saving}>{m.project_visibility_save()}</Button>
			{/if}
		</form>
	{:else}
		<p class="text-sm text-[var(--ink)]">
			{visibility === 'members'
				? m.project_visibility_members()
				: m.project_visibility_organisation()}
		</p>
	{/if}

	<p class="mt-[var(--space-2)] text-small text-[var(--ink-muted)]">
		{visibility === 'members'
			? m.project_visibility_hint_members()
			: m.project_visibility_hint_organisation()}
	</p>

	{#if visibility === 'members'}
		<h3 class="mt-[var(--space-4)] text-sm font-medium text-[var(--ink)]">
			{m.project_members_title()}
		</h3>
		<ul class="mt-[var(--space-2)] divide-y divide-[var(--border)]">
			{#each members as member (member.personId)}
				<li class="flex items-center justify-between gap-[var(--space-2)] py-[var(--space-2)]">
					<span class="flex min-w-0 items-center gap-[var(--space-2)] text-sm text-[var(--ink)]">
						<span class="truncate">{member.fullName}</span>
						{#if member.isOwner}
							<span class={badge({ tone: 'neutral', plain: true })}
								>{m.project_members_owner()}</span
							>
						{/if}
					</span>
					{#if editable && !member.isOwner}
						{#if member.taskCount > 0}
							<Button
								type="button"
								variant="ghost"
								size="sm"
								aria-label={m.project_members_remove({ name: member.fullName })}
								onclick={() => (removing = member)}
							>
								<X class="size-4" aria-hidden="true" />
							</Button>
						{:else}
							<form method="POST" action="?/removeMember" use:enhance>
								<input type="hidden" name="personId" value={member.personId} />
								<Button
									type="submit"
									variant="ghost"
									size="sm"
									aria-label={m.project_members_remove({ name: member.fullName })}
								>
									<X class="size-4" aria-hidden="true" />
								</Button>
							</form>
						{/if}
					{/if}
				</li>
			{:else}
				<li class="py-[var(--space-2)] text-sm text-[var(--ink-muted)]">
					{m.project_members_empty()}
				</li>
			{/each}
		</ul>
		<FormError class="mt-[var(--space-2)]">{errors.removeMember}</FormError>

		{#if editable}
			<form
				method="POST"
				action="?/addMember"
				class="mt-[var(--space-3)] space-y-[var(--space-2)]"
				use:enhance={() => {
					return async ({ update }) => {
						await update();
						newMember = null;
					};
				}}
			>
				<SearchSelectField
					label={m.project_members_add()}
					name="personId"
					placeholder={m.project_members_add_placeholder()}
					options={candidateOptions}
					bind:value={newMember}
					error={errors.addMember}
				/>
				<Button type="submit" size="sm" variant="secondary" disabled={newMember === null}>
					{m.project_members_add_submit()}
				</Button>
			</form>
		{/if}
	{:else if members.length > 0 && editable}
		<p class="mt-[var(--space-2)] text-small text-[var(--ink-muted)]">
			{m.project_members_kept()}
		</p>
	{/if}
</WorkPanel>

{#if removing}
	<ConfirmDialog
		open={removing !== null}
		onOpenChange={(next) => {
			if (!next) removing = null;
		}}
		title={m.project_members_confirm_title({ name: removing.fullName })}
		description={removing.taskCount === 1
			? m.project_members_confirm_one({ name: removing.fullName })
			: m.project_members_confirm_other({
					name: removing.fullName,
					count: removing.taskCount
				})}
		confirmLabel={m.project_members_confirm_submit()}
		pending={removePending}
		error={errors.removeMember}
	>
		{#snippet action(confirm)}
			<form
				method="POST"
				action="?/removeMember"
				use:enhance={() => {
					removePending = true;
					return async ({ result, update }) => {
						await update();
						removePending = false;
						if (result.type === 'success') removing = null;
					};
				}}
			>
				<input type="hidden" name="personId" value={removing?.personId} />
				<input type="hidden" name="confirm" value="1" />
				{@render confirm()}
			</form>
		{/snippet}
	</ConfirmDialog>
{/if}
