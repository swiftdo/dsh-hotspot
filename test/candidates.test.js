import test from 'node:test';
import assert from 'node:assert/strict';
import { findCandidateDigest, pickCandidate } from '../src/core/candidates.js';

const digest = {
  date: '2026-11-05',
  items: [
    { id: 'h-20261105-01', title: '第一条' },
    { id: 'h-20261105-03', title: '第三条' },
    { id: 'h-20261105-13', title: '第十三条' },
  ],
};

test('#3 命中补零后缀，不被 -13 截胡', () => {
  assert.equal(pickCandidate(digest, '#3').id, 'h-20261105-03');
  assert.equal(pickCandidate(digest, '3').id, 'h-20261105-03');
});

test('#13 才是第十三条', () => {
  assert.equal(pickCandidate(digest, '#13').id, 'h-20261105-13');
});

test('完整 id 精确命中', () => {
  assert.equal(pickCandidate(digest, 'h-20261105-13').id, 'h-20261105-13');
});

test('超出候选数量的序号返回 null，不越界取最后一条', () => {
  assert.equal(pickCandidate(digest, '#9'), null);
  assert.equal(pickCandidate(digest, '0'), null);
});

test('空 key、空 digest 都返回 null', () => {
  assert.equal(pickCandidate(digest, ''), null);
  assert.equal(pickCandidate(digest, '#'), null);
  assert.equal(pickCandidate(null, '3'), null);
  assert.equal(pickCandidate({ items: [] }, '3'), null);
});

test('id 尾段带连字符才认，不完整的尾段不会被硬凑上', () => {
  assert.equal(pickCandidate(digest, '20261105-13').id, 'h-20261105-13');
  assert.equal(pickCandidate(digest, '105-13'), null);
});

test('findCandidateDigest 在历史 digest 里按 id 找回候选', () => {
  const today = { date: '2026-11-06', items: [{ id: 'h-20261106-01' }] };
  const yesterday = { date: '2026-11-05', items: [{ id: 'h-20261105-03' }] };
  const hit = findCandidateDigest([today, yesterday], 'h-20261105-03');
  assert.equal(hit.digest.date, '2026-11-05');
  assert.equal(hit.candidate.id, 'h-20261105-03');
  assert.equal(findCandidateDigest([today, yesterday], 'h-20261105-99'), null);
  assert.equal(findCandidateDigest([today], ''), null);
});
