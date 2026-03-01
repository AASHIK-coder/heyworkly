/**
 * Copyright (c) 2025 heyworkly
 * SPDX-License-Identifier: Apache-2.0
 */

export interface VerificationResult {
  success: boolean;
  changes: string[];
  details?: string;
}

interface DomState {
  url: string;
  title: string;
  elementCount?: number;
  bodyText?: string;
}

export class Verifier {
  static verifyApiResult(response: {
    status: number;
    body?: unknown;
  }): VerificationResult {
    const success = response.status >= 200 && response.status < 300;
    return {
      success,
      changes: success ? ['api_success'] : ['api_error'],
      details: success
        ? `HTTP ${response.status}`
        : `HTTP ${response.status}: ${JSON.stringify(response.body)}`,
    };
  }

  static verifyDomChange(params: {
    before: DomState;
    after: DomState;
  }): VerificationResult {
    const changes: string[] = [];

    if (params.before.url !== params.after.url) {
      changes.push('url_changed');
    }
    if (params.before.title !== params.after.title) {
      changes.push('title_changed');
    }
    if (
      params.before.elementCount !== undefined &&
      params.after.elementCount !== undefined &&
      params.before.elementCount !== params.after.elementCount
    ) {
      changes.push('element_count_changed');
    }
    if (
      params.before.bodyText !== undefined &&
      params.after.bodyText !== undefined &&
      params.before.bodyText !== params.after.bodyText
    ) {
      changes.push('content_changed');
    }

    return {
      success: changes.length > 0,
      changes,
      details:
        changes.length > 0
          ? `Detected: ${changes.join(', ')}`
          : 'No changes detected',
    };
  }

  static verifyScreenshotDiff(params: {
    beforeHash: string;
    afterHash: string;
    threshold?: number;
  }): VerificationResult {
    const different = params.beforeHash !== params.afterHash;
    return {
      success: different,
      changes: different ? ['screenshot_changed'] : [],
      details: different
        ? 'Screen content changed'
        : 'No visual change detected',
    };
  }
}
