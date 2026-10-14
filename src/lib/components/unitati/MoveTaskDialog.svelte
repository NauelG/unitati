<script lang="ts">
	import { applyAction, enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { m } from '#lib/paraglide/messages.js';
	import Alert from './Alert.svelte';
	import Button from './Button.svelte';
	import Dialog from './Dialog.svelte';
	import SearchSelectField from './SearchSelectField.svelte';

	export interface MoveTaskProject {
		id: string;
		projectTag: string;
		name: string;
	}

	interface Props {
		open: boolean;
		onOpenChange: (open: boolean) => void;
		/** The task being moved; the dialog posts to its own record's action. */
		task: { taskTag: string; projectId: string };
		/** Active projects in scope. The task's own is left out here, not by the caller. */
		projects: MoveTaskProject[];
	}

	let { open, onOpenChange, task, projects }: Props = $props();

	/**
	 * One field, one primary action: a Dialog (ADR 0020). No second confirmation,
	 * because moving back undoes it. Domain refusals render inside, not as a page
	 * error, so the person keeps their place.
	 */
	let projectId = $state<string | null>(null);
	let pending = $state(false);
	let failure = $state<string>();

	$effect(() => {
		if (open) {
			projectId = null;
			failure = undefined;
		}
	});

	const candidates = $derived(projects.filter((project) => project.id !== task.projectId));
	const options = $derived(
		candidates.map((project) => ({
			value: project.id,
			label: `${project.projectTag} · ${project.name}`
		}))
	);
	const target = $derived(candidates.find((project) => project.id === projectId));
</script>

<Dialog
	{open}
	{onOpenChange}
	{pending}
	title={m.task_move_title({ tag: task.taskTag })}
	description={m.task_move_lede()}
>
	<form
		method="POST"
		action="/tasks/{encodeURIComponent(task.taskTag)}?/moveToProject"
		use:enhance={() => {
			pending = true;
			failure = undefined;
			return async ({ result }) => {
				pending = false;
				if (result.type === 'success') {
					onOpenChange(false);
					await invalidateAll();
				} else if (result.type === 'failure') {
					failure = String(result.data?.message ?? m.action_error_invalid());
				} else {
					await applyAction(result);
				}
			};
		}}
		class="space-y-[var(--space-4)]"
	>
		{#if failure}
			<Alert tone="danger">{failure}</Alert>
		{/if}

		{#if options.length === 0}
			<p class="text-sm text-[var(--ink-muted)]">{m.task_move_no_projects()}</p>
		{:else}
			<SearchSelectField
				label={m.task_move_project()}
				name="projectId"
				placeholder={m.task_move_placeholder()}
				{options}
				required
				bind:value={projectId}
			/>
		{/if}

		<div class="flex justify-end gap-[var(--space-2)]">
			<Button type="button" variant="ghost" size="sm" onclick={() => onOpenChange(false)}>
				{m.form_cancel()}
			</Button>
			<Button type="submit" size="sm" busy={pending} disabled={!target}>
				{target ? m.task_move_submit({ projectTag: target.projectTag }) : m.task_move_submit_none()}
			</Button>
		</div>
	</form>
</Dialog>
