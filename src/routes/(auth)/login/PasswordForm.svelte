<script lang="ts">
	import { untrack } from 'svelte';
	import { superForm } from 'sveltekit-superforms';
	import type { SuperValidated } from 'sveltekit-superforms';
	import Button from '#lib/components/unitati/Button.svelte';
	import Field from '#lib/components/unitati/Field.svelte';
	import FormError from '#lib/components/unitati/FormError.svelte';
	import { m } from '#lib/paraglide/messages.js';

	/** The email and password form, shared by `/login` and the break-glass `/login/local`. */
	interface Props {
		form: SuperValidated<{ email: string; password: string; redirectTo?: string }>;
		class?: string;
	}

	let { form: initial, class: className = '' }: Props = $props();

	// superForm owns the form state from here on and re-syncs itself on
	// navigation, so it is seeded with the initial value on purpose.
	const { form, errors, message, enhance, submitting } = superForm(untrack(() => initial));
</script>

<form method="POST" use:enhance class="space-y-[var(--space-4)] {className}">
	<input type="hidden" name="redirectTo" bind:value={$form.redirectTo} />
	<Field
		label={m.login_email_label()}
		name="email"
		type="email"
		autocomplete="email"
		spellcheck={false}
		autocapitalize="off"
		placeholder={m.login_email_placeholder()}
		bind:value={$form.email}
		error={$errors.email?.[0]}
		required
	/>

	<Field
		label={m.login_password_label()}
		name="password"
		type="password"
		autocomplete="current-password"
		bind:value={$form.password}
		error={$errors.password?.[0]}
		required
	/>

	{#if $message}
		<FormError>{$message}</FormError>
	{/if}

	<Button type="submit" size="lg" class="w-full" busy={$submitting}>
		{$submitting ? m.login_submitting() : m.login_submit()}
	</Button>
</form>
