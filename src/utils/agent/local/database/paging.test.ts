import { describe, expect, it } from 'vitest';

import { pageOptions } from './paging';

describe('store paging', () => {
  it('passes offset and limit on to find', () => {
    expect(pageOptions({ offset: 20, limit: 10 })).toEqual({ offset: 20, limit: 10 });
  });

  it('keeps an offset of 0', () => {
    expect(pageOptions({ offset: 0, limit: 1 })).toEqual({ offset: 0, limit: 1 });
  });

  it('passes only the fields the query sets', () => {
    expect(pageOptions({ limit: 5 })).toEqual({ limit: 5 });
    expect(pageOptions({ offset: 3 })).toEqual({ offset: 3 });
  });

  it('gives no options for a query without paging, so every row is read', () => {
    expect(pageOptions(undefined)).toBeUndefined();
    expect(pageOptions({})).toBeUndefined();
  });
});
