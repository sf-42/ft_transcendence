import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';
import { Database } from 'sqlite';


export async function generate2FASecret(user: any, db: Database) {
	try {
		// Check if QrCode already exists
		const existingData = await db.get(
			'SELECT twofa_secret, qrCodeUrl FROM users WHERE id = ?',
			user.id
		);

		if (existingData?.twofa_secret && existingData?.qrCodeUrl) {
			return { qrCodeImageUrl: existingData.qrCodeUrl };
		}

		// Generate a new secret and URI
		const secret = authenticator.generateSecret();
		const serviceName = 'ft_transcendence';
		const keyUri = authenticator.keyuri(user.username ?? user.name, serviceName, secret);

		// Generate the QR Code (data:image/png;base64,...)
		const qrCodeImageUrl = await generateQRCode(keyUri);

		// Save to database
		await db.run('UPDATE users SET twofa_secret = ?, qrCodeUrl = ? WHERE id = ?', secret, qrCodeImageUrl, user.id);

		return { qrCodeImageUrl };
	} catch (error) {
		console.error('[ERROR]: generate2FASecret failed:', error);
		throw new Error('Failed to generate 2FA secret or QR code');
	}
}

export async function generateQRCode(keyUri: string) {
    try {
        const qrCodeImageUrl = await QRCode.toDataURL(keyUri);
        return qrCodeImageUrl;
    } catch (error) {
        console.error('Error generating QR code', error);
        throw error;
    }
}

export async function verify2faCode(twoFactorSecret: string, code: string): Promise<boolean> {
    const ret = await authenticator.check(code, twoFactorSecret);
    return ret;
}
