const { test } = require('node:test');
const assert = require('node:assert/strict');
const { eventHasRestrictedContent, collectIssueReferences } = require('../dist/issue-delivery');

test('secondary and embedded issue references prevent broad delivery', async () => {
  const seen = [];
  const db = {
    query: async (_sql, params) => {
      seen.push(params);
      return [
        { id: 'open', key: 'EPD-1', access_state: 'unrestricted' },
        { id: 'secret', key: 'EPD-31', access_state: 'restricted' },
      ];
    },
  };
  assert.equal(
    await eventHasRestrictedContent(db, 'tenant_test', {
      issueKey: 'EPD-1',
      targetIssueId: 'secret',
      content: { text: 'See https://weaver.example/issues/EPD-31' },
    }),
    true,
  );
  assert.deepEqual(seen[0], [['EPD-1', 'EPD-31'], ['secret']]);
});

test('queued payloads are blocked for quarantined projects or missing references', async () => {
  const db = {
    query: async () => [{ key: 'EPD-1', access_state: 'unrestricted', import_quarantined: true }],
  };
  assert.equal(await eventHasRestrictedContent(db, 'tenant_test', { issueKey: 'EPD-1' }), true);
  assert.equal(
    await eventHasRestrictedContent({ query: async () => [] }, 'tenant_test', {
      issueKey: 'EPD-2',
    }),
    true,
  );
});

test('ordinary verified references remain deliverable', async () => {
  const db = {
    query: async () => [{ key: 'EPD-1', access_state: 'unrestricted', import_quarantined: false }],
  };
  assert.equal(await eventHasRestrictedContent(db, 'tenant_test', { issueKey: 'EPD-1' }), false);
});

test('separates UUID identity fields from issue references while retaining explicit issue IDs', async () => {
  const actor = 'aaaaaaaa-1234-4123-8123-123456789012';
  const issue = 'bbbbbbbb-5678-4567-8567-123456789012';
  assert.deepEqual(
    collectIssueReferences({
      userId: actor,
      project_id: actor,
      webhookId: actor,
      opaque: actor,
      issueIds: [issue],
      targetIssueId: issue,
      issueKey: 'EPD-1',
      content: { href: '/issues/EPD%2D31' },
    }),
    { keys: ['EPD-1', 'EPD-31'], ids: [issue] },
  );
  const seen = [];
  const db = {
    query: async (_sql, params) => {
      seen.push(params);
      return [{ id: issue, key: 'EPD-1', access_state: 'unrestricted' }];
    },
  };
  assert.equal(
    await eventHasRestrictedContent(db, 'tenant_test', {
      userId: actor,
      issueId: issue,
      issueKey: 'EPD-1',
    }),
    false,
  );
  assert.deepEqual(seen, [[['EPD-1'], [issue]]]);
  // Removing UUID false positives must not allow restricted explicit ID-only references.
  assert.equal(
    await eventHasRestrictedContent(
      { query: async () => [{ id: issue, key: 'EPD-1', access_state: 'restricted' }] },
      'tenant_test',
      { userId: actor, issueId: issue },
    ),
    true,
  );
});
