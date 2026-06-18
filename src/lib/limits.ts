// Client-safe limits (no server-only imports) so both the browser-side file
// check and the server-side validation share one source of truth.
export const MAX_PDF_MB = 30;
export const MAX_PDF_BYTES = MAX_PDF_MB * 1024 * 1024;
