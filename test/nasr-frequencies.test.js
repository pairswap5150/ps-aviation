import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNasrFrequencies, freqKind, pickFrequency, clearanceFrequency } from '../src/nasr-frequencies.js';

// Real FRQ.csv column names; expected numbers are the actual published frequencies, checked
// against jetpanel's built frequencies.json (cycle 2609).
const H = 'SERVICED_FACILITY,SERVICED_SITE_TYPE,FREQ,FREQ_USE,TOWER_OR_COMM_CALL,SECTORIZATION';
const FRQ = [H,
  'DCA,AIRPORT,132.65,ATIS,WASHINGTON,',
  'DCA,AIRPORT,128.25,CLNC DEL,WASHINGTON,',
  'DCA,AIRPORT,121.7,GND/P,WASHINGTON,',
  'DCA,AIRPORT,119.1,LCL/P,WASHINGTON,RWY 01/19',
  'DCA,AIRPORT,121.275,LCL/P,WASHINGTON,RWY 15/33',
  'ZDC,ARTCC,134.15,APCH/P,WASHINGTON CENTER,',   // not airport-served
  'DCA,AIRPORT,348.6,LCL/P,WASHINGTON,',          // UHF, not tuneable by a crew
  'CAE,AIRPORT,120.15R,ATIS,COLUMBIA,',           // receive-only suffix
].join('\n');
const APT = ['ARPT_ID,ICAO_ID', 'DCA,KDCA', 'CAE,KCAE'].join('\n');

test('keys by ICAO, and by FAA id when APT_BASE is absent', () => {
  assert.ok(parseNasrFrequencies(FRQ, APT).KDCA);
  assert.equal(parseNasrFrequencies(FRQ, APT).DCA, undefined);
  assert.ok(parseNasrFrequencies(FRQ).DCA, 'degrades to LID keys rather than nothing');
});

test('the real DCA frequencies come out right', () => {
  const dca = parseNasrFrequencies(FRQ, APT).KDCA;
  assert.equal(pickFrequency(dca, 'atis').freq, 132.65);
  assert.equal(pickFrequency(dca, 'clearance').freq, 128.25);
  assert.equal(pickFrequency(dca, 'ground').freq, 121.7);
  assert.equal(pickFrequency(parseNasrFrequencies(FRQ, APT).KCAE, 'atis').freq, 120.15,
    'a receive-only suffix is one frequency, not a parse failure');
});

test('only airport-served civil VHF voice is kept', () => {
  const all = Object.values(parseNasrFrequencies(FRQ, APT)).flat();
  assert.ok(all.every((f) => f.freq >= 118 && f.freq <= 137));
  assert.ok(!all.some((f) => f.call === 'WASHINGTON CENTER'));
});

test('the sector split is carried, since it is how a crew picks between two towers', () => {
  const towers = parseNasrFrequencies(FRQ, APT).KDCA.filter((f) => f.kind === 'tower');
  assert.deepEqual(towers.map((f) => f.sect).sort(), ['RWY 01/19', 'RWY 15/33']);
});

test('use strings classify the way a crew reads them', () => {
  for (const [use, kind] of [['ATIS','atis'], ['D-ATIS','atis'], ['CLNC DEL','clearance'],
    ['CD','clearance'], ['GND/P','ground'], ['LCL/P','tower'], ['APCH/P','approach'],
    ['RAMP CONTROL','ramp'], ['SOMETHING ELSE','other'], ['','other'], [null,'other']]) {
    assert.equal(freqKind(use), kind, String(use));
  }
});

test('clearance falls back to ground, and says which it is', () => {
  // Many fields have no clearance delivery; you get your clearance from ground. Which one it is
  // matters more than the number.
  assert.deepEqual(clearanceFrequency(parseNasrFrequencies(FRQ, APT).KDCA),
    { freq: 128.25, kind: 'clearance', isGround: false });
  assert.deepEqual(clearanceFrequency(parseNasrFrequencies(`${H}\nDCA,AIRPORT,121.7,GND/P,X,`, APT).KDCA),
    { freq: 121.7, kind: 'ground', isGround: true });
  // An untowered field has nobody to call; say nothing rather than offer the tower.
  assert.equal(clearanceFrequency(parseNasrFrequencies(`${H}\nDCA,AIRPORT,119.1,LCL/P,X,`, APT).KDCA), null);
  assert.equal(clearanceFrequency(undefined), null);
});

test('malformed input yields nothing rather than throwing', () => {
  for (const bad of ['', 'not,a,frq\n1,2', null, undefined]) {
    assert.deepEqual(parseNasrFrequencies(bad, APT), {}, JSON.stringify(bad));
  }
});

test('the LID map can be supplied directly instead of APT_BASE.csv', () => {
  // PairSwap already stores the mapping in its airports table; making it re-serialise that into a
  // CSV just to be parsed back would be silly, and would cost an 8MB download for two columns.
  const freqs = parseNasrFrequencies(FRQ, new Map([['DCA', 'KDCA']]));
  assert.equal(pickFrequency(freqs.KDCA, 'atis').freq, 132.65);
  assert.ok(freqs.CAE, 'an airport missing from the map keeps its FAA identifier');
});
