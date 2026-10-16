import { m } from '#lib/paraglide/messages.js';
import type { SetBrandAssetFailure } from '#lib/server/directory/index.js';

/** One Spanish message per way an upload can be refused (`ImageFailure`). */
export function logoErrorMessage(failure: Exclude<SetBrandAssetFailure, 'forbidden'>): string {
	switch (failure) {
		case 'too-large':
			return m.branding_logo_error_too_large();
		case 'unsupported-type':
			return m.branding_logo_error_unsupported_type();
		case 'too-many-pixels':
			return m.branding_logo_error_too_many_pixels();
		case 'invalid-image':
			return m.branding_logo_error_invalid_image();
		case 'invalid-svg':
			return m.branding_logo_error_invalid_svg();
		case 'output-too-large':
			return m.branding_logo_error_output_too_large();
	}
}
