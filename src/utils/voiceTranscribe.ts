/**
 * Voice quick-add transcription -- lets a business owner record a short
 * voice note ("Sold 3 bags of rice for 15000") instead of typing it, and
 * get back plain text that lands in exactly the same place typed text does
 * (see quickAddParser.ts's own doc comment, which named this as this
 * feature's eventual landing point: transcription is the only new step,
 * after which a voice note is just text like any other).
 *
 * Calls supabase.functions.invoke('transcribe-voice'), matching the same
 * pattern statementScan.ts uses for 'statement-scan' -- the audio is sent
 * server-side to OpenAI's Whisper API so no separate API key reaches the
 * client.
 */

import { supabase } from './supabase';

export async function transcribeVoiceNote(base64: string, mimeType: string): Promise<string> {
    const { data, error } = await supabase.functions.invoke('transcribe-voice', {
        body: { audioBase64: base64, mimeType },
    });
    if (error) {
        // Same FunctionsHttpError unwrap statementScan.ts uses -- the edge
        // function always replies with a JSON { error } body on failure.
        const errResponse = (error as { context?: Response }).context;
        if (errResponse && typeof errResponse.json === 'function') {
            const body = await errResponse.json().catch(() => null);
            if (body?.error) throw new Error(body.error);
        }
        throw new Error(error.message || 'Could not reach the transcription service.');
    }
    if (typeof data?.text !== 'string') throw new Error('Could not transcribe that recording -- try again, or type it instead.');
    return data.text;
}
