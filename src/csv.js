/**
 * Minimal CSV reading for FAA NASR files.
 *
 * Ported from jetpanel's tools/navdata/nasr.ts, converted from TypeScript to plain ESM so a
 * browser can import it unbundled (see the README).
 *
 * A hand-rolled splitter rather than a dependency, because NASR CSVs use exactly one feature
 * beyond splitting on commas -- double-quoted fields containing commas -- and a naive
 * `line.split(',')` silently misaligns every column after the first quoted one. That misalignment
 * has already cost real debugging time in PairSwap.
 */

/**
 * Splits one CSV line, honouring double-quoted fields and doubled quotes inside them.
 * @param {string} line - One line, without its terminator.
 * @returns {string[]} Field values, unquoted and untrimmed.
 */
export function splitCsvLine(line) {
    const out = [];
    let current = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
        const char = line[i];
        if (quoted) {
            if (char === '"') {
                // A doubled quote inside a quoted field is a literal quote.
                if (line[i + 1] === '"') { current += '"'; i += 1; } else { quoted = false; }
            } else {
                current += char;
            }
        } else if (char === '"') {
            quoted = true;
        } else if (char === ',') {
            out.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    out.push(current);
    return out;
}

/**
 * Parses a whole CSV into uppercased headers and raw rows.
 * @param {string} text - Entire file contents.
 * @returns {{headers: string[], rows: string[][]}} Parsed table.
 */
export function parseCsv(text) {
    const lines = String(text ?? '').split(/\r?\n/).filter((line) => line.length > 0);
    if (!lines.length) return { headers: [], rows: [] };
    return {
        headers: splitCsvLine(lines[0]).map((header) => header.trim().toUpperCase()),
        rows: lines.slice(1).map(splitCsvLine),
    };
}

/**
 * Index of the first header matching any alias.
 *
 * Aliases exist because the FAA renames columns between cycles without warning, and a hard-coded
 * index is how a rename becomes silently wrong data rather than an error.
 * @param {string[]} headers - Uppercased headers from parseCsv.
 * @param {...string} aliases - Acceptable names, in preference order.
 * @returns {number} Column index, or -1 when absent.
 */
export function col(headers, ...aliases) {
    for (const alias of aliases) {
        const index = headers.indexOf(String(alias).toUpperCase());
        if (index >= 0) return index;
    }
    return -1;
}

/**
 * Reads one trimmed cell, tolerating a missing column.
 * @param {string[]} row - A row from parseCsv.
 * @param {number} index - Column index, possibly -1.
 * @returns {string} The value, or '' when the column or cell is absent.
 */
export function cell(row, index) {
    return index >= 0 ? String(row?.[index] ?? '').trim() : '';
}
