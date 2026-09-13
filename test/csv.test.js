import test from 'node:test';
import assert from 'node:assert/strict';

import { splitCsvLine, parseCsv, col, cell } from '../src/csv.js';

test('quoted fields containing commas do not misalign the row', () => {
  // The whole reason this is not line.split(','): one quoted comma shifts every column after it,
  // and nothing about the result looks wrong until a value turns up in the wrong field.
  assert.deepEqual(splitCsvLine('DCA,"WASHINGTON, RONALD REAGAN",VA'),
    ['DCA', 'WASHINGTON, RONALD REAGAN', 'VA']);
});

test('doubled quotes inside a quoted field are one literal quote', () => {
  assert.deepEqual(splitCsvLine('A,"say ""hi""",B'), ['A', 'say "hi"', 'B']);
});

test('empty fields are preserved, including trailing ones', () => {
  assert.deepEqual(splitCsvLine('A,,B,'), ['A', '', 'B', '']);
});

test('headers are uppercased and blank lines dropped', () => {
  const { headers, rows } = parseCsv('Arpt_Id,Icao_Id\r\nDCA,KDCA\r\n\r\nIAD,KIAD\r\n');
  assert.deepEqual(headers, ['ARPT_ID', 'ICAO_ID']);
  assert.deepEqual(rows, [['DCA', 'KDCA'], ['IAD', 'KIAD']]);
});

test('an empty file is empty, not a crash', () => {
  assert.deepEqual(parseCsv(''), { headers: [], rows: [] });
  assert.deepEqual(parseCsv(null), { headers: [], rows: [] });
});

test('columns are found by any alias, and a missing one is -1 rather than 0', () => {
  // Returning 0 for "not found" would silently read the first column instead, which is how a
  // renamed FAA field becomes wrong data rather than an error.
  const headers = ['ARPT_ID', 'FREQ'];
  assert.equal(col(headers, 'freq'), 1);
  assert.equal(col(headers, 'FREQUENCY', 'FREQ'), 1, 'aliases are tried in order');
  assert.equal(col(headers, 'NOPE'), -1);
  assert.equal(cell(['a', 'b'], -1), '', 'a missing column reads empty, not undefined');
  assert.equal(cell(['a', ' b '], 1), 'b', 'cells are trimmed');
});
