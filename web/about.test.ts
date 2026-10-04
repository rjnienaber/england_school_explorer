import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CODE_LICENCE, codeLicenceLine, REPO_URL, repoUrl } from './about.ts';

test('the page makes no code licence claim until one is set', () => {
  assert.equal(CODE_LICENCE, null);
  assert.equal(codeLicenceLine(), '');
  assert.equal(codeLicenceLine('MIT'), 'The source code is released under the MIT licence.');
});

test('repository links are built from the one constant', () => {
  assert.equal(repoUrl(), REPO_URL);
  assert.equal(repoUrl('/issues/new'), `${REPO_URL}/issues/new`);
  assert.equal(repoUrl('#download-the-data', 'https://github.com/x/y'), 'https://github.com/x/y#download-the-data');
});
