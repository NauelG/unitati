<script lang="ts">
	import ComponentDocPage from '../ComponentDocPage.svelte';
	import SchemaFieldTable from '#lib/components/unitati/SchemaFieldTable.svelte';

	const rows = [
		{ name: 'subject', type: 'string', required: true, description: 'One line.' },
		{ name: 'queueId', type: 'string (uuid)', required: true, description: '' },
		{ name: 'priority', type: '"low" | "normal" | "high"', required: false, description: '' },
		{ name: 'assetTags', type: 'string[]', required: false, description: 'Up to 20.' }
	];
</script>

<ComponentDocPage
	name="SchemaFieldTable"
	summary="Los campos de una petición o una respuesta: nombre, tipo, obligatorio y descripción."
	role="Una tabla, no una lista: un lector compara tipos y obligatoriedad de arriba abajo. El nombre es una ruta con puntos (data.queue.id), así un objeto anidado cabe en las mismas cuatro columnas. Sin campos, dice que no hay."
	whenToUse={[
		'En la documentación de la API, con las filas que salen de leer el JSON Schema del documento OpenAPI.',
		'Para cualquier contrato plano de campos que se lea, no se edite.'
	]}
	whenNotToUse={[
		'Para datos de negocio paginables u ordenables: usa DataTable.',
		'Para editar los valores: esto describe, no recoge.'
	]}
	propsDoc={[
		{
			name: 'rows',
			type: '{ name; type; required; description }[]',
			description: 'Una fila por campo. Vacío muestra «Sin campos.».'
		},
		{
			name: 'caption',
			type: 'string',
			description: 'Nombra la tabla para lectores de pantalla; no se ve.'
		}
	]}
	usage={`<SchemaFieldTable {rows} caption="Cuerpo de la petición" />`}
	referenceHref="https://github.com/NauelG/unitati/blob/main/docs/adr/0022-api-layer-and-api-keys.md"
	referenceLabel="ADR 0022 — la API y las claves"
>
	{#snippet demo()}
		<SchemaFieldTable {rows} caption="Ejemplo" />
		<SchemaFieldTable rows={[]} caption="Vacía" />
	{/snippet}
</ComponentDocPage>
