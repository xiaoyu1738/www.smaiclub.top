import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseXuiClientStats } from '../src/xui.ts';

test('parseXuiClientStats extracts client traffic from 3x-ui list payload', () => {
  const stats = parseXuiClientStats({
    obj: [
      {
        clientStats: [
          { email: 'label-a', uuid: 'uuid-a', up: 1024, down: 2048 },
          { id: 'uuid-b', upload: 10, download: 20 },
        ],
      },
    ],
  });

  assert.deepEqual(stats, [
    { uuid: 'uuid-a', used: 3072 },
    { uuid: 'uuid-b', used: 30 },
  ]);
});
