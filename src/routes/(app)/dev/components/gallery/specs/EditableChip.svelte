<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import EditableChip from '#lib/components/unitati/EditableChip.svelte';

	const statuses = [
		{ value: 'new', label: 'Nuevo', tone: 'brand' as const },
		{ value: 'in_progress', label: 'En curso', tone: 'desk' as const },
		{ value: 'waiting_on_user', label: 'En espera', tone: 'warning' as const },
		{ value: 'resolved', label: 'Resuelto', tone: 'success' as const },
		{ value: 'closed', label: 'Cerrado', tone: 'neutral' as const }
	];

	let editable = $state('new');
	let pending = $state('in_progress');
	let failed = $state('urgent');
	let readOnly = $state('resolved');

	/** What a record page does: write the mirror now, hand back the way to undo it. */
	function mirror(set: (v: string) => void, get: () => string) {
		return (formData: FormData) => {
			const before = get();
			set(String(formData.get('status')));
			return () => set(before);
		};
	}
</script>

<ComponentDocPage
	name="EditableChip"
	summary="Insignia de la cabecera que se edita en el sitio (estado, prioridad)."
	role="Una insignia con borde de 1 px que abre un popover con las opciones y guarda al elegir (ADR 0029). Aplica el valor al instante mediante optimisticEnhance; si el servidor lo rechaza, lo devuelve y avisa con un aviso emergente. Sin permiso es una insignia sin borde ni chevrón, que no se puede activar."
	whenToUse={[
		'El estado o la prioridad de un registro abierto, en su cabecera.',
		'Una sola propiedad de elección única que se guarda sola, sin botón.'
	]}
	whenNotToUse={[
		'Propiedades de la lista «Detalles»: usa EditableDetailRow.',
		'Varios campos a la vez: usa un Sheet (ADR 0020).',
		'Un marcador de solo lectura en una tabla: usa StatusBadge.'
	]}
	propsDoc={[
		{ name: 'value', type: 'string', description: 'El valor actual; el espejo de la página.' },
		{
			name: 'options',
			type: '{ value, label, tone?, disabled? }[]',
			description: 'Con más de 7 opciones aparece un filtro.'
		},
		{ name: 'action', type: 'string', description: 'URL de la acción del formulario.' },
		{ name: 'name', type: 'string', description: 'Nombre del campo que se envía.' },
		{
			name: 'editable',
			type: 'boolean',
			description: 'Sin permiso: insignia plana, sin borde, chevrón ni botón.'
		},
		{
			name: 'optimistic',
			type: '(formData) => () => void',
			description: 'Escribe el espejo y devuelve el deshacer; se pasa a optimisticEnhance.'
		},
		{
			name: 'openOnHash',
			type: 'string',
			description: 'Fragmento (#action-status) que abre el popover al cargar la página.'
		},
		{ name: 'label', type: 'string', description: 'Nombre accesible de la propiedad.' },
		{
			name: 'extraFields',
			type: 'Record<string, string>',
			description: 'Campos ocultos que se envían con la elección.'
		}
	]}
	usage={`<EditableChip
  value={ticket.status}
  options={statusOptions}
  action="?/changeStatus"
  name="status"
  editable={canManage}
  optimistic={applyStatus}
  openOnHash="#action-status"
  label="Estado"
/>`}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/adr/0029-in-place-editing-on-record-pages.md"
	referenceLabel="ADR 0029 — edición en el sitio"
>
	{#snippet demo()}
		<div class="grid gap-[var(--space-5)] sm:grid-cols-2">
			<div>
				<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">Editable</p>
				<EditableChip
					value={editable}
					options={statuses}
					action="?/save"
					name="status"
					editable
					label="Estado"
					optimistic={mirror(
						(v) => (editable = v),
						() => editable
					)}
				/>
			</div>
			<div>
				<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
					Guardando (600 ms)
				</p>
				<EditableChip
					value={pending}
					options={statuses}
					action="?/save"
					name="status"
					editable
					label="Estado"
					optimistic={mirror(
						(v) => (pending = v),
						() => pending
					)}
				/>
			</div>
			<div>
				<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
					Falla (se devuelve y avisa)
				</p>
				<EditableChip
					value={failed}
					options={[
						{ value: 'low', label: 'Baja', tone: 'neutral' },
						{ value: 'high', label: 'Alta', tone: 'warning' },
						{ value: 'urgent', label: 'Urgente', tone: 'danger' }
					]}
					action="?/fail"
					name="priority"
					editable
					label="Prioridad"
					optimistic={mirror(
						(v) => (failed = v),
						() => failed
					)}
				/>
			</div>
			<div>
				<p class="ut-muted mb-2 text-xs font-semibold tracking-[0.04em] uppercase">
					Solo lectura (sin permiso)
				</p>
				<EditableChip
					value={readOnly}
					options={statuses}
					action="?/save"
					name="status"
					editable={false}
					label="Estado"
					optimistic={mirror(
						(v) => (readOnly = v),
						() => readOnly
					)}
				/>
			</div>
		</div>
	{/snippet}
</ComponentDocPage>
