const assert = require('node:assert/strict');
const test = require('node:test');
const { activationProblems } = require('./verify-plugin-activation.cjs');

const board = '@weaver/plugin-board';
const jam = '@weaver/plugin-jam';
const installed = (plugin_id, enabled = true) => ({ plugin_id, enabled });
const tenant = (installs, features) => ({ slug: 'example', installed: installs, projectPlugins: features });

test('detects the production Jam-only catalog with missing organization features', () => {
  const problems = activationProblems([{ id: jam }], [tenant([installed(jam)], [installed(board)])]);
  assert.deepEqual(problems, [`example: enabled project feature ${board} is not installed for the organization`]);
});

test('detects an installed feature skipped by the production trust list', () => {
  const problems = activationProblems([{ id: jam }], [tenant([installed(board)], [installed(board)])]);
  assert.ok(problems.some((problem) => problem.includes('WEAVER_TRUSTED_PLUGINS')));
  assert.ok(problems.some((problem) => problem.includes('enabled project feature')));
});

test('accepts loaded, installed and enabled project features', () => {
  assert.deepEqual(activationProblems([{ id: board }], [tenant([installed(board)], [installed(board)])]), []);
});

test('allows an organization to intentionally disable an installed feature', () => {
  assert.deepEqual(activationProblems([{ id: board }], [tenant([installed(board, false)], [installed(board)])]), []);
});

test('ignores disabled project features and deduplicates missing installations', () => {
  assert.deepEqual(activationProblems([], [tenant([], [installed(board, false)])]), []);
  assert.equal(activationProblems([], [tenant([], [installed(board), installed(board)])]).length, 1);
});

test('checks each organization independently', () => {
  const other = { ...tenant([], [installed(board)]), slug: 'other' };
  const problems = activationProblems([{ id: board }], [tenant([installed(board)], [installed(board)]), other]);
  assert.deepEqual(problems, [`other: enabled project feature ${board} is not installed for the organization`]);
});
