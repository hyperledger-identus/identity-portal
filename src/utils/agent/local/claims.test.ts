import { describe, expect, it } from 'vitest';

import { claimsToRecord, claimsToSubject, toStoredClaims } from './claims';

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

describe('credential subject claims', () => {
  it('gives the credential the same claims the offer was created with', () => {
    const claims = {
      fullName: 'Probe Holder',
      age: 41,
      member: true,
      banned: false,
      address: { city: 'Ashgabat', zip: '744000' },
      tags: ['a', 'b'],
      code: '007',
    };

    expect(claimsToSubject(toStoredClaims(claims))).toEqual(claims);
  });

  it('puts an object and an array into the subject, not their JSON text', () => {
    const subject = claimsToSubject([
      { name: 'address', value: '{"city":"Ashgabat"}', type: 'string' },
      { name: 'tags', value: '["a","b"]', type: 'string' },
    ]);

    expect(subject.address).toEqual({ city: 'Ashgabat' });
    expect(subject.tags).toEqual(['a', 'b']);
  });

  it('keeps a plain string a string', () => {
    expect(
      claimsToSubject([
        { name: 'code', value: '007', type: 'string' },
        { name: 'note', value: '{not json', type: 'string' },
      ]),
    ).toEqual({ code: '007', note: '{not json' });
  });

  it('turns a date row into a Date', () => {
    const subject = claimsToSubject([
      { name: 'birthDate', value: '2000-01-31T00:00:00.000Z', type: 'date' },
    ]);

    expect(subject.birthDate).toEqual(new Date('2000-01-31T00:00:00.000Z'));
  });
});
