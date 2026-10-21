import QRCode from 'qrcode';

/**
 * The signing link as a QR code, for signing at the desk on the person's own
 * phone (ADR 0035, decision 4). Drawn on the server, like asset labels, so the
 * plain token never needs a client-side encoder.
 *
 * Error correction L: the code is read off a clean screen, never a scuffed
 * sticker, and the lowest level keeps a 70-character link at the fewest
 * modules, so it stays readable at arm's length. The 4-module quiet zone is
 * drawn in, since a full-screen overlay gives it no padding of its own.
 */
export function signingLinkQr(link: string): Promise<string> {
	return QRCode.toString(link, {
		type: 'svg',
		errorCorrectionLevel: 'L',
		margin: 4,
		color: { dark: '#000000', light: '#ffffff' }
	});
}
