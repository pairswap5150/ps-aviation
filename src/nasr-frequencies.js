/**
 * Airport communication frequencies from the FAA NASR FRQ.csv.
 *
 * Ported from jetpanel's tools/navdata/nasr.ts (parseNasrFreqs / freqKind), converted from
 * TypeScript to plain ESM.
 *
 * FRQ.csv keys rows by FAA location identifier (DCA), not ICAO (KDCA), so the caller supplies
 * APT_BASE.csv to build the mapping. Airports without an ICAO keep their LID.
 */
import { cell, col, parseCsv } from './csv.js';

/**
 * FREQ_USE text to a stable kind.
 *
 * Ordered, and the order matters: "CD" would match nothing useful if tested after the generic
 * patterns, and ATIS has to win before anything else because a D-ATIS row's use string often names
 * the service as well.
 * @type {ReadonlyArray<readonly [RegExp, string]>}
 */
const FREQ_KIND = Object.freeze([
    [/ATIS/, 'atis'],
    [/^LCL\b/, 'tower'],
    [/^GND\b/, 'ground'],
    [/CLNC|CLEARANCE|^CD\b/, 'clearance'],
    [/APCH|FINAL|\bSTAR\b|CLASS [BCD]/, 'approach'],
    [/^DEP\b|\bDP\b/, 'departure'],
    // Ramp/apron control: pushback and ramp movement, hands off to and from ground.
    [/RAMP|APRON/, 'ramp'],
    [/CTAF/, 'ctaf'],
    [/UNICOM/, 'unicom'],
    [/EMERG/, 'emergency'],
]);

/** Civil VHF voice band. Anything outside it is not something a crew tunes. */
const VHF_MIN_MHZ = 118;
const VHF_MAX_MHZ = 137;

/**
 * Classifies a FREQ_USE string.
 * @param {string} use - Raw FREQ_USE text.
 * @returns {string} One of atis, tower, ground, clearance, approach, departure, ramp, ctaf,
 *   unicom, emergency, or other.
 */
export function freqKind(use) {
    const text = String(use ?? '').toUpperCase();
    for (const [pattern, kind] of FREQ_KIND) if (pattern.test(text)) return kind;
    return 'other';
}

/**
 * Parses FRQ.csv into a per-airport list of frequencies.
 *
 * Keeps only rows serving an AIRPORT (the file also carries ARTCC and FSS facilities) and only
 * civil VHF voice, deduplicated by kind and frequency. `sect` carries the runway or sector split
 * for fields that publish several tower or ground frequencies.
 * @param {string} frqCsv - Contents of FRQ.csv.
 * @param {string|Map<string,string>} [lidToKey] - APT_BASE.csv contents, or a ready-made
 *   FAA-LID to emit-key map. Either way, airports without an ICAO keep their LID.
 * @returns {Record<string, Array<{use:string, kind:string, freq:number, call?:string, sect?:string}>>}
 *   Frequencies keyed by ICAO where known, else by FAA LID, each sorted ascending.
 */
export function parseNasrFrequencies(frqCsv, lidToKey = '') {
    // Either APT_BASE.csv (what jetpanel has to hand) or a ready-made map (what PairSwap has, in
    // its own airports table -- and building it from there avoids a second 8MB download for two
    // columns it already stores).
    let keyForLid = new Map();
    if (lidToKey instanceof Map) {
        keyForLid = lidToKey;
    } else if (lidToKey) {
        const apt = parseCsv(lidToKey);
        const lidColumn = col(apt.headers, 'ARPT_ID');
        const icaoColumn = col(apt.headers, 'ICAO_ID');
        for (const row of apt.rows) {
            const lid = cell(row, lidColumn);
            if (lid) keyForLid.set(lid, cell(row, icaoColumn) || lid);
        }
    }

    const frq = parseCsv(frqCsv);
    const facilityColumn = col(frq.headers, 'SERVICED_FACILITY');
    const siteTypeColumn = col(frq.headers, 'SERVICED_SITE_TYPE');
    const freqColumn = col(frq.headers, 'FREQ');
    const useColumn = col(frq.headers, 'FREQ_USE');
    const callColumn = col(frq.headers, 'TOWER_OR_COMM_CALL');
    const sectorColumn = col(frq.headers, 'SECTORIZATION');

    const out = {};
    const seen = new Map();
    for (const row of frq.rows) {
        if (cell(row, siteTypeColumn).toUpperCase() !== 'AIRPORT') continue;
        const lid = cell(row, facilityColumn);
        if (!lid) continue;
        // "122.1R" parses to 122.1, dropping the receive/transmit suffix.
        const freq = Number.parseFloat(cell(row, freqColumn));
        if (!(freq >= VHF_MIN_MHZ && freq <= VHF_MAX_MHZ)) continue;
        const use = cell(row, useColumn);
        if (!use) continue;

        const key = keyForLid.get(lid) ?? lid;
        const kind = freqKind(use);
        const dedupe = `${kind}@${freq.toFixed(3)}`;
        let keys = seen.get(key);
        if (!keys) seen.set(key, (keys = new Set()));
        if (keys.has(dedupe)) continue;
        keys.add(dedupe);

        const entry = { use, kind, freq };
        const call = cell(row, callColumn);
        const sector = cell(row, sectorColumn);
        if (call) entry.call = call;
        if (sector) entry.sect = sector;
        (out[key] ??= []).push(entry);
    }
    for (const list of Object.values(out)) list.sort((a, b) => a.freq - b.freq);
    return out;
}

/**
 * Picks the frequency a crew would actually tune for one purpose.
 *
 * Prefers the lowest frequency of the requested kind, which for fields publishing several is
 * reliably the primary rather than a sector split.
 * @param {Array<{kind:string, freq:number}>|undefined} frequencies - One airport's list.
 * @param {string} kind - Kind to find, e.g. "atis" or "clearance".
 * @returns {{use:string, kind:string, freq:number, call?:string, sect?:string}|null} The frequency, or null.
 */
export function pickFrequency(frequencies, kind) {
    if (!Array.isArray(frequencies)) return null;
    return frequencies.find((entry) => entry?.kind === kind) ?? null;
}

/**
 * The frequency to call for a clearance, and whether it is really clearance delivery.
 *
 * Not every field has a clearance delivery position; at many you get your clearance from ground.
 * Returning which one it is matters more than returning a number: a crew calling "clearance" on a
 * ground frequency is a small embarrassment, and calling ground expecting clearance and getting
 * neither is worse.
 * @param {Array<{kind:string, freq:number}>|undefined} frequencies - One airport's list.
 * @returns {{freq:number, kind:'clearance'|'ground', isGround:boolean}|null} The frequency, or null.
 */
export function clearanceFrequency(frequencies) {
    const clearance = pickFrequency(frequencies, 'clearance');
    if (clearance) return { freq: clearance.freq, kind: 'clearance', isGround: false };
    const ground = pickFrequency(frequencies, 'ground');
    if (ground) return { freq: ground.freq, kind: 'ground', isGround: true };
    return null;
}
