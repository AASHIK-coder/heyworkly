/*
 * Copyright (c) 2025 heyworkly
 * SPDX-License-Identifier: Apache-2.0
 */
import { Conversation } from '@ui-tars/shared/types';
import type { ProcessedFile } from '@main/services/fileProcessor';

export interface ConversationWithSoM extends Conversation {
  screenshotBase64WithElementMarker?: string;
  attachments?: ProcessedFile[];
}
