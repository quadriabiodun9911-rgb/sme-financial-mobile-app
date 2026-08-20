// External service configuration
// When rotating tokens, update ONLY this file.

export const Config = {
    // Pngme SDK token — loaded from environment variables only (never hardcode here).
    // Set EXPO_PUBLIC_PNGME_SDK_TOKEN_TEST and EXPO_PUBLIC_PNGME_SDK_TOKEN_PROD in .env.local
    // Rotate tokens at: admin.pngme.com → API & SDK Integration → SDK Tokens
    PNGME_SDK_TOKEN_TEST: process.env.EXPO_PUBLIC_PNGME_SDK_TOKEN_TEST ?? '',
    PNGME_SDK_TOKEN_PROD: process.env.EXPO_PUBLIC_PNGME_SDK_TOKEN_PROD ?? '',

    // Driven by APP_ENV set in eas.json build profiles
    IS_PRODUCTION: process.env.APP_ENV === 'production',

    // WhatsApp support contact — left empty until a real number is provisioned.
    // Set EXPO_PUBLIC_SUPPORT_WHATSAPP_NUMBER in .env.local (E.164, no "+").
    // Never hardcode a placeholder number here — the UI must handle "" gracefully.
    SUPPORT_WHATSAPP_NUMBER: process.env.EXPO_PUBLIC_SUPPORT_WHATSAPP_NUMBER ?? '',

    get PNGME_SDK_TOKEN(): string {
        return this.IS_PRODUCTION ? this.PNGME_SDK_TOKEN_PROD : this.PNGME_SDK_TOKEN_TEST;
    },
} as const;
