/**
 * The least a picker needs to know about an asset.
 *
 * The same shape as `AssetChoice` in `server/assets`, kept as its own type on
 * purpose: this file ships to the browser and the server module must not, so
 * the two agree by structure (the picker parses the endpoint's JSON as this)
 * and not by import.
 */
export interface PickedAsset {
	id: string;
	assetTag: string;
	name: string;
}
