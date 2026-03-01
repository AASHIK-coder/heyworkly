import { describe, it, expect } from 'vitest';
import { Verifier } from '../src/Verifier';

describe('Verifier', () => {
  describe('verifyApiResult', () => {
    it('should return success for 2xx status', () => {
      const result = Verifier.verifyApiResult({
        status: 200,
        body: { ok: true },
      });
      expect(result.success).toBe(true);
      expect(result.changes).toContain('api_success');
    });

    it('should return failure for 4xx status', () => {
      const result = Verifier.verifyApiResult({
        status: 404,
        body: { error: 'not found' },
      });
      expect(result.success).toBe(false);
      expect(result.changes).toContain('api_error');
    });

    it('should return failure for 5xx status', () => {
      const result = Verifier.verifyApiResult({
        status: 500,
        body: { error: 'fail' },
      });
      expect(result.success).toBe(false);
    });
  });

  describe('verifyDomChange', () => {
    it('should detect URL change', () => {
      const result = Verifier.verifyDomChange({
        before: { url: 'https://example.com', title: 'A' },
        after: { url: 'https://example.com/page2', title: 'B' },
      });
      expect(result.success).toBe(true);
      expect(result.changes).toContain('url_changed');
      expect(result.changes).toContain('title_changed');
    });

    it('should detect title change only', () => {
      const result = Verifier.verifyDomChange({
        before: { url: 'https://example.com', title: 'Old' },
        after: { url: 'https://example.com', title: 'New' },
      });
      expect(result.success).toBe(true);
      expect(result.changes).toEqual(['title_changed']);
    });

    it('should detect no change', () => {
      const state = { url: 'https://example.com', title: 'A' };
      const result = Verifier.verifyDomChange({ before: state, after: state });
      expect(result.success).toBe(false);
      expect(result.changes).toHaveLength(0);
    });

    it('should detect element count change', () => {
      const result = Verifier.verifyDomChange({
        before: {
          url: 'https://example.com',
          title: 'A',
          elementCount: 10,
        },
        after: {
          url: 'https://example.com',
          title: 'A',
          elementCount: 15,
        },
      });
      expect(result.success).toBe(true);
      expect(result.changes).toContain('element_count_changed');
    });
  });

  describe('verifyScreenshotDiff', () => {
    it('should detect change when hashes differ', () => {
      const result = Verifier.verifyScreenshotDiff({
        beforeHash: 'abcdef1234567890',
        afterHash: 'zzzzzzz123456789',
      });
      expect(result.success).toBe(true);
      expect(result.changes).toContain('screenshot_changed');
    });

    it('should detect no change when hashes match', () => {
      const result = Verifier.verifyScreenshotDiff({
        beforeHash: 'abcdef1234567890',
        afterHash: 'abcdef1234567890',
      });
      expect(result.success).toBe(false);
      expect(result.changes).toHaveLength(0);
    });
  });
});
