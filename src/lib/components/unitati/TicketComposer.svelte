<script lang="ts" module>
	import { tv } from 'tailwind-variants';

	/**
	 * The `.ut-composer`: a box at the end of the thread with the textarea above
	 * and a bar below it — the internal-note toggle, the attach control, and the
	 * send button with its shortcut.
	 */
	export const composer = tv({
		slots: {
			root: 'rounded-[var(--radius-lg)] border border-[var(--border-strong)] bg-[var(--surface-1)]',
			textarea: [
				'block min-h-[76px] w-full resize-y rounded-t-[var(--radius-lg)] border-0 bg-transparent',
				'p-[var(--space-3)] text-[15px] leading-[22px] text-[var(--ink)]',
				'placeholder:text-[var(--ink-muted)]'
			],
			bar: 'flex flex-wrap items-center gap-[var(--space-2)] border-t border-[var(--border)] p-[var(--space-2)]',
			toggle: [
				'inline-flex h-[var(--size-control-sm)] items-center rounded-[var(--radius-full)] px-[var(--space-3)]',
				'text-xs font-semibold text-[var(--ink)] hover:bg-[var(--surface-2)]'
			],
			attach: 'text-xs text-[var(--ink-muted)]',
			error:
				'px-[var(--space-3)] pb-[var(--space-2)] text-[13px] leading-[18px] text-[var(--danger)]'
		},
		variants: {
			internal: {
				true: {
					root: 'border-[var(--warning)] bg-[var(--warning-soft)]',
					toggle:
						'bg-[var(--warning-soft)] text-[var(--warning)] shadow-[inset_0_0_0_1px_var(--warning)]'
				}
			}
		}
	});
</script>

<script lang="ts">
	import Paperclip from '@lucide/svelte/icons/paperclip';
	import { enhance } from '$app/forms';
	import { m } from '#lib/paraglide/messages.js';
	import Button from './Button.svelte';

	interface Props {
		/** The form action, e.g. `?/reply`. */
		action: string;
		/** Whether the viewer may write internal notes; employees never see the toggle. */
		allowInternal?: boolean;
		/** Shown under the box when the last submission was refused. */
		error?: string;
		placeholder?: string;
		class?: string;
	}

	let { action, allowInternal = false, error, placeholder, class: className }: Props = $props();

	let internal = $state(false);
	let body = $state('');
	let form: HTMLFormElement | undefined = $state();

	const styles = $derived(composer({ internal }));

	/** ⌘↵ or Ctrl+↵ sends, as the design system's composer promises. */
	function sendWithKeyboard(event: KeyboardEvent) {
		if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
			event.preventDefault();
			form?.requestSubmit();
		}
	}
</script>

<form
	bind:this={form}
	method="POST"
	{action}
	enctype="multipart/form-data"
	class={styles.root({ class: className })}
	use:enhance={() =>
		async ({ update }) => {
			await update();
			body = '';
			internal = false;
		}}
>
	<textarea
		name="body"
		class={styles.textarea()}
		aria-label={m.composer_label()}
		placeholder={placeholder ??
			(internal ? m.composer_placeholder_internal() : m.composer_placeholder_portal())}
		required
		bind:value={body}
		onkeydown={sendWithKeyboard}></textarea>

	<input type="hidden" name="visibility" value={internal ? 'internal' : 'public'} />

	{#if error}
		<p class={styles.error()} role="alert">{error}</p>
	{/if}

	<div class={styles.bar()}>
		{#if allowInternal}
			<button
				type="button"
				class={styles.toggle()}
				aria-pressed={internal}
				onclick={() => (internal = !internal)}
			>
				{m.composer_internal_toggle()}
			</button>
		{/if}

		<label class={styles.attach()}>
			<span class="sr-only">{m.composer_attach()}</span>
			<Paperclip class="mr-1 inline size-3.5" aria-hidden="true" />
			<input type="file" name="files" multiple />
		</label>

		<Button type="submit" size="sm" class="ml-auto">
			{internal ? m.composer_send_internal() : m.composer_send()}
			<span class="text-[11px] opacity-80" aria-hidden="true">{m.composer_shortcut()}</span>
		</Button>
	</div>
</form>
