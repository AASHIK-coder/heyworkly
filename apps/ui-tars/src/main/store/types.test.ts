/*
 * Copyright (c) 2025 heyworkly
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect } from 'vitest';
import { VLMProviderV2 } from './types';

describe('VLMProviderV2', () => {
  it('should have correct values for each provider', () => {
    expect(VLMProviderV2.openrouter).toBe('OpenRouter');
    expect(VLMProviderV2.custom).toBe('Custom (OpenAI-Compatible)');
  });

  it('should contain exactly two providers', () => {
    const providerCount = Object.keys(VLMProviderV2).length;
    expect(providerCount).toBe(2);
  });
});
