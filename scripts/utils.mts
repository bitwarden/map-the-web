// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export const red = (s: string): string => `\x1b[31m${s}\x1b[0m`;
export const yellow = (s: string): string => `\x1b[33m${s}\x1b[0m`;
export const green = (s: string): string => `\x1b[32m${s}\x1b[0m`;
export const cyan = (s: string): string => `\x1b[36m${s}\x1b[0m`;
export const dim = (s: string): string => `\x1b[2m${s}\x1b[0m`;
