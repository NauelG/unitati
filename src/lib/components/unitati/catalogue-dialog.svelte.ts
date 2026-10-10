/**
 * The open/edit/close state machine `NameCatalogue` and `assets/models`
 * both reimplemented identically (#100 code review): a catalogue row opens
 * the same `Dialog` for create and for edit, one at a time, and the dialog
 * shows a server failure only when that failure actually belongs to the
 * dialog that's currently open — not a stale message left over from a
 * different row's last attempt, and not a different action's failure (a
 * `delete` failure must never surface inside the create/edit `Dialog`).
 *
 * What stays per page: the draft field values a form actually edits (one
 * name for `NameCatalogue`, name + manufacturer + category for models) —
 * those differ in shape, so seeding them is the caller's own `openCreate`/
 * `openEdit` wrapper, not this helper's concern.
 */

export interface CatalogueDialogResult {
	action: string;
	message: string | null;
	id: string | null;
}

export interface CatalogueDialogOptions {
	/** The action name a create POST reports back as `result.action`. */
	createAction: string;
	/** The action name an edit POST reports back as `result.action`. */
	editAction: string;
}

export function catalogueDialog<Entry extends { id: string }>(options: CatalogueDialogOptions) {
	let open = $state(false);
	let editing: Entry | null = $state(null);

	// A plain function parameter narrows cleanly; `editing` itself is a
	// reassignable `let` captured by the closure `$derived` wraps its
	// expression in, so TS widens it back to `Entry | null` before a
	// property access on the same mutable binding — a known rough edge with
	// Svelte 5 runes, not a real type error.
	function idOf(entry: Entry | null): string | null {
		return entry === null ? null : entry.id;
	}
	const editingId = $derived(idOf(editing));

	function openCreate() {
		editing = null;
		open = true;
	}

	function openEdit(entry: Entry) {
		editing = entry;
		open = true;
	}

	function close() {
		open = false;
	}

	/**
	 * `null` unless `result` is this dialog's own create/edit failure:
	 * the action must match what this dialog's own state currently expects
	 * (create when nothing is being edited, edit otherwise), and the id
	 * must match the row this dialog has open — the same two checks
	 * `NameCatalogue` and `assets/models` each wrote out by hand before.
	 */
	function failureFrom(result: CatalogueDialogResult | null | undefined): string | null {
		if (!open || !result) return null;
		const expectedAction = editingId === null ? options.createAction : options.editAction;
		return result.action === expectedAction && (result.id ?? null) === editingId
			? result.message
			: null;
	}

	return {
		get open() {
			return open;
		},
		get editing() {
			return editing;
		},
		get editingId() {
			return editingId;
		},
		openCreate,
		openEdit,
		close,
		failureFrom
	};
}

/**
 * A delete refusal (the row is still in use) that should surface at the
 * list level, not only inside the now-closed `ConfirmDialog` — the row that
 * caused it may no longer have a dialog open once the user dismisses it.
 * `NameCatalogue`, `assets/models` and `service-desk/queues` each wrote this
 * same check out by hand before this existed (#86 code review).
 */
export function deleteFailureFrom(
	result: CatalogueDialogResult | null | undefined,
	confirmingId: string | null
): string | null {
	if (!result || result.action !== 'delete' || !result.message) return null;
	return confirmingId !== result.id ? result.message : null;
}
