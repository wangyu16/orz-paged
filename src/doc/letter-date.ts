/**
 * A letter's date line (D-97), kept out of the isomorphic assembler (claim
 * A.2: the assembler modules name no clock): callers pass the day,
 * `letterDate(new Date())`, and `newDocument({ date })` writes it.
 */
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** A letter's date line for a day, as the starters write it (`October 22, 2026`; English, the reader's local day). */
export const letterDate = (d: Date): string => `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
