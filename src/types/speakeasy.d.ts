declare module 'speakeasy' {
    interface Secret {
        base32: string;
        hex: string;
        qr_code_ascii: string;
        otpauth_url?: string;
    }

    interface GenerateSecretOptions {
        name: string;
        issuer: string;
        length?: number;
    }

    interface VerifyTOTPOptions {
        secret: string;
        encoding: string;
        token: string;
        window?: number;
    }

    export function generateSecret(options: GenerateSecretOptions): Secret;

    export const totp: {
        verify(options: VerifyTOTPOptions): boolean | null;
    };
}
