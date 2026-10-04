import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFromFixtures } from '../../lib/test-fixtures.ts';
import type { School } from '../../web/toolkit.ts';
import { dioceseLabel, ethosAddsToCharacter, isFaithSchool } from './faith.ts';
import { dioceseOf, loadFaith } from './parse.ts';
import { filters, popupTags } from './web.ts';

// The GIAS file belongs to gias-core, so that is where its fixture lives
const fixture = new URL('../gias-core/fixtures/gias.csv', import.meta.url).pathname;

test('parser: diocese and ethos, with "Not applicable" and "Does not apply" as null', async () => {
  const faith = await loadFaith(fixture);
  assert.equal(faith.get(100055)?.diocese, 'Archdiocese of Westminster');
  assert.equal(faith.get(100055)?.ethos, null);
  assert.equal(faith.get(100001)?.ethos, 'Inter- / non- denominational');
  assert.equal(faith.has(100049), false);
  assert.equal(dioceseOf('Diocese is not trustees'), null);
});

test('ethosAddsToCharacter', () => {
  assert.equal(ethosAddsToCharacter(null, 'Roman Catholic'), false);
  assert.equal(ethosAddsToCharacter('Roman Catholic', 'Roman Catholic'), false);
  assert.equal(ethosAddsToCharacter('Islam', 'Muslim'), false);
  assert.equal(ethosAddsToCharacter('Church of England', 'Church of England/Roman Catholic'), false);
  assert.equal(ethosAddsToCharacter('Christian', 'Church of England'), true);
  assert.equal(ethosAddsToCharacter('Christian', null), true);
});

test('isFaithSchool and dioceseLabel', () => {
  assert.equal(isFaithSchool('Roman Catholic', null), true);
  assert.equal(isFaithSchool(null, 'Christian'), true);
  assert.equal(isFaithSchool(null, 'Inter- / non- denominational'), false);
  assert.equal(isFaithSchool(null, null), false);
  assert.equal(dioceseLabel('Diocese of Leeds (rc)'), 'Diocese of Leeds');
  assert.equal(dioceseLabel('Archdiocese of Westminster'), 'Archdiocese of Westminster');
});

test('religion: rows from fixtures', async () => {
  const { rows } = await buildFromFixtures('religion');
  const all = rows('religion');
  assert.equal(all.get(100055)?.faithSchool, true);
  assert.equal(all.get(100055)?.diocese, 'Archdiocese of Westminster');
  assert.equal(all.get(131726)?.diocese, 'Diocese of Salford');
  assert.equal(all.get(100001)?.faithSchool, false); // non-denominational ethos
  assert.equal(all.has(100049), false);
});

const school = (o: Partial<School>) => o as School;

test('filter: faith / secular / any', () => {
  const f = filters[0] as Extract<(typeof filters)[number], { control: { kind: 'select' } }>;
  assert.equal(f.test(school({ faithSchool: false }), ''), true);
  assert.equal(f.test(school({ faithSchool: false }), 'faith'), false);
  assert.equal(f.test(school({ faithSchool: true }), 'faith'), true);
  assert.equal(f.test(school({ faithSchool: true }), 'secular'), false);
  assert.equal(f.test(school({ faithSchool: false }), 'secular'), true);
});

test('popup tags: religion with diocese, ethos only when it adds something', () => {
  const [religion, ethos] = popupTags;
  assert.deepEqual(religion.tag(school({ religion: 'Roman Catholic', diocese: 'Archdiocese of Westminster' })), {
    text: 'Roman Catholic · Archdiocese of Westminster',
  });
  assert.deepEqual(religion.tag(school({ religion: 'Muslim', diocese: null })), { text: 'Muslim' });
  assert.equal(religion.tag(school({ religion: null, diocese: null })), null);
  assert.equal(ethos.tag(school({ religion: 'Muslim', religiousEthos: 'Islam' })), null);
  assert.deepEqual(ethos.tag(school({ religion: null, religiousEthos: 'Christian' })), { text: 'Christian ethos' });
});
