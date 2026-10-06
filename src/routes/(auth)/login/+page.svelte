<script lang="ts">
	import AppVersion from '#lib/components/AppVersion.svelte';
</script>

<svelte:head>
	<title>Sign in · unitati</title>
</svelte:head>

<main class="flex min-h-screen items-center justify-center bg-neutral-50 p-6">
	<div class="w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-8 shadow-sm">
		<h1 class="text-xl font-semibold">unitati</h1>
		<p class="mt-1 text-sm text-neutral-600">Sign in to continue.</p>

		<!-- Placeholder until authentication lands (MVP slice 1, better-auth). -->
		<form class="mt-6 space-y-4" onsubmit={(event) => event.preventDefault()}>
			<label class="block text-sm">
				<span class="text-neutral-700">Email</span>
				<input
					type="email"
					name="email"
					autocomplete="email"
					disabled
					class="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2"
				/>
			</label>
			<button
				type="submit"
				disabled
				class="w-full rounded-md bg-neutral-900 px-3 py-2 text-sm text-white disabled:opacity-50"
			>
				Sign in
			</button>
			<p class="text-xs text-neutral-500">Authentication is not implemented yet.</p>
		</form>

		<footer class="mt-8 text-center">
			<AppVersion />
		</footer>
	</div>
</main>
