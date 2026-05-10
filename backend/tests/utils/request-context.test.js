import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runWithContext, getRequestId } from '../../utils/request-context.js';

describe('request-context', () => {
  it('runWithContext 内可读取 requestId', () => {
    runWithContext({ requestId: 'rid-123' }, () => {
      assert.equal(getRequestId(), 'rid-123');
    });
  });

  it('上下文外读取返回 undefined', () => {
    assert.equal(getRequestId(), undefined);
  });

  it('嵌套上下文不互相污染', () => {
    runWithContext({ requestId: 'outer' }, () => {
      runWithContext({ requestId: 'inner' }, () => {
        assert.equal(getRequestId(), 'inner');
      });
      assert.equal(getRequestId(), 'outer');
    });
  });
});
