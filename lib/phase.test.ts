import assert from 'node:assert/strict';
import { test } from 'node:test';
import { choosePhase } from './phase.ts';

const q = (s: string) => new URLSearchParams(s);

test('choosePhase: ?phase= decides, then shortlist and similar links mean secondary, then the saved choice', () => {
  assert.equal(choosePhase(q('phase=primary'), 'secondary'), 'primary');
  assert.equal(choosePhase(q('phase=secondary&compare=1,2'), 'primary'), 'secondary');
  // Links made before phases existed have no phase in them
  assert.equal(choosePhase(q('compare=1,2'), 'primary'), 'secondary');
  assert.equal(choosePhase(q('similar=5'), 'primary'), 'secondary');
  // A shortlist link that names its phase keeps it
  assert.equal(choosePhase(q('compare=1,2&phase=primary'), 'secondary'), 'primary');
  // No hint in the address: what the visitor last used, or the default
  assert.equal(choosePhase(q(''), 'primary'), 'primary');
  assert.equal(choosePhase(q('urn=3'), null), 'secondary');
  assert.equal(choosePhase(q('phase=nonsense'), 'primary'), 'primary');
  assert.equal(choosePhase(q(''), 'nonsense'), 'secondary');
});
