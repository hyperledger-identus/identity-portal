import { describe, expect, it } from 'vitest';

import { claimsToRecord, toStoredClaims } from './claims';

describe('claims storage', () => {
  it('reads every claim back with the JSON type it was stored with', () => {
    const claims = {
      fullName: 'Probe Holder',
      age: 41,
      score: 9.5,
      member: true,
      banned: false,
      address: { city: 'Ashgabat', zip: '744000' },
      tags: ['a', 'b'],
      code: '007',
    };

    expect(claimsToRecord(toStoredClaims(claims))).toEqual(claims);
  });

  it('stores numbers and booleans as strings and keeps their type', () => {
    expect(toStoredClaims({ age: 41, member: true })).toEqual([
      { name: 'age', value: '41', type: 'number' },
      { name: 'member', value: 'true', type: 'boolean' },
    ]);
  });

  it('keeps a numeric-looking string a string', () => {
    expect(claimsToRecord([{ name: 'code', value: '007', type: 'string' }])).toEqual({
      code: '007',
    });
  });

  it('keeps the stored text when a number row does not parse back', () => {
    expect(claimsToRecord([{ name: 'age', value: 'null', type: 'number' }])).toEqual({
      age: 'null',
    });
  });

  it('keeps the stored text when an object row is not valid JSON', () => {
    expect(claimsToRecord([{ name: 'note', value: '{not json', type: 'string' }])).toEqual({
      note: '{not json',
    });
  });
});
