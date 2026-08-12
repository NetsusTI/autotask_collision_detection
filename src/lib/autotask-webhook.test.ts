import { createHmac } from 'crypto';
import { describe, it, expect } from 'vitest';
import { verifyWebhookSignature, parseWebhookPayload, extractFieldValue } from './autotask-webhook';

function sign(body: string, secret: string): string {
  return `sha1=${createHmac('sha1', secret).update(body, 'utf8').digest('base64')}`;
}

describe('verifyWebhookSignature', () => {
  const secret = 'test-secret-123456';
  const body = JSON.stringify({ Action: 'Update', Id: 42, Fields: ['status'] });

  it('accepts a correctly signed payload', () => {
    expect(verifyWebhookSignature(body, sign(body, secret), secret)).toBe(true);
  });

  it('accepts the signature without the "sha1=" prefix too', () => {
    const header = sign(body, secret).replace(/^sha1=/, '');
    expect(verifyWebhookSignature(body, header, secret)).toBe(true);
  });

  it('rejects a tampered body', () => {
    const tampered = JSON.stringify({ Action: 'Update', Id: 999, Fields: ['status'] });
    expect(verifyWebhookSignature(tampered, sign(body, secret), secret)).toBe(false);
  });

  it('rejects the wrong secret', () => {
    expect(verifyWebhookSignature(body, sign(body, secret), 'wrong-secret')).toBe(false);
  });

  it('rejects a missing signature header', () => {
    expect(verifyWebhookSignature(body, null, secret)).toBe(false);
  });

  it('rejects an empty secret (never "verifies by accident")', () => {
    expect(verifyWebhookSignature(body, sign(body, secret), '')).toBe(false);
  });

  it('rejects a malformed/garbage header without throwing', () => {
    expect(verifyWebhookSignature(body, 'not-a-real-signature', secret)).toBe(false);
  });
});

describe('parseWebhookPayload', () => {
  it('parses a well-formed Update payload', () => {
    const parsed = parseWebhookPayload({ Action: 'Update', Id: 42, Fields: ['status', 'assignedResourceID'] });
    expect(parsed).toEqual({
      action: 'Update',
      id: 42,
      changedFields: ['status', 'assignedResourceID'],
      raw: { Action: 'Update', Id: 42, Fields: ['status', 'assignedResourceID'] },
    });
  });

  it('parses a Fields array of objects with a Name property', () => {
    const parsed = parseWebhookPayload({ Action: 'Update', Id: 1, Fields: [{ Name: 'status' }, { Name: 'priority' }] });
    expect(parsed.changedFields).toEqual(['status', 'priority']);
  });

  it('coerces a string Id to a number', () => {
    expect(parseWebhookPayload({ Action: 'Create', Id: '123' }).id).toBe(123);
  });

  it('falls back to action:"unknown" for an unrecognized action', () => {
    expect(parseWebhookPayload({ Action: 'SomethingElse', Id: 1 }).action).toBe('unknown');
  });

  it('never throws on null/non-object/garbage input', () => {
    expect(parseWebhookPayload(null)).toEqual({ action: 'unknown', id: null, changedFields: null, raw: null });
    expect(parseWebhookPayload('garbage')).toEqual({ action: 'unknown', id: null, changedFields: null, raw: 'garbage' });
    expect(parseWebhookPayload(undefined)).toEqual({ action: 'unknown', id: null, changedFields: null, raw: undefined });
  });

  it('returns id:null when Id is missing or unparseable', () => {
    expect(parseWebhookPayload({ Action: 'Update' }).id).toBeNull();
    expect(parseWebhookPayload({ Action: 'Update', Id: 'not-a-number' }).id).toBeNull();
  });
});

describe('extractFieldValue', () => {
  it('reads a value from a Fields array of {Name, Value} objects', () => {
    const raw = { Fields: [{ Name: 'status', Value: 5 }, { Name: 'priority', Value: 1 }] };
    expect(extractFieldValue(raw, ['status'])).toBe(5);
    expect(extractFieldValue(raw, ['priority'])).toBe(1);
  });

  it('reads a value from a loose root-level key', () => {
    expect(extractFieldValue({ assignedResourceID: 42 }, ['assignedResourceID'])).toBe(42);
  });

  it('reads a value from a nested Item/item object', () => {
    expect(extractFieldValue({ Item: { status: 7 } }, ['status'])).toBe(7);
  });

  it('coerces numeric strings', () => {
    expect(extractFieldValue({ status: '5' }, ['status'])).toBe(5);
  });

  it('returns null (not undefined) when the field is explicitly null', () => {
    expect(extractFieldValue({ assignedResourceID: null }, ['assignedResourceID'])).toBeNull();
  });

  it('returns undefined when the field is not present anywhere', () => {
    expect(extractFieldValue({ Fields: [{ Name: 'title', Value: 'x' }] }, ['status'])).toBeUndefined();
    expect(extractFieldValue({}, ['status'])).toBeUndefined();
  });

  it('never throws on null/non-object input', () => {
    expect(extractFieldValue(null, ['status'])).toBeUndefined();
    expect(extractFieldValue('garbage', ['status'])).toBeUndefined();
  });

  it('checks multiple candidate field names in order', () => {
    expect(extractFieldValue({ AssignedResourceID: 9 }, ['assignedResourceID', 'AssignedResourceID'])).toBe(9);
  });
});
