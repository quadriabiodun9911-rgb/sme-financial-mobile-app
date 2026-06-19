// External service configuration
// When rotating tokens, update ONLY this file.

export const Config = {
    // Backend URL — deployed on Render
    BACKEND_URL: 'https://quad360-backend.onrender.com',

    // Pngme SDK token — used in ConnectBankScreen to launch the SMS collection flow.
    // Switch to PNGME_SDK_TOKEN_PROD before going live.
    // To rotate: get new token from admin.pngme.com → API & SDK Integration → SDK Tokens
    PNGME_SDK_TOKEN_TEST: '4bf2b058f457a9d0bd42ac116989432fa8bfe32e99f98dab16b133d788a46ca92610d26a42a99045c8794c59801a48f9',
    PNGME_SDK_TOKEN_PROD: '', // fill in before production launch

    // Set to true to use production Pngme token
    IS_PRODUCTION: false,

    get PNGME_SDK_TOKEN(): string {
        return this.IS_PRODUCTION ? this.PNGME_SDK_TOKEN_PROD : this.PNGME_SDK_TOKEN_TEST;
    },
} as const;
