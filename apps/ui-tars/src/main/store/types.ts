/**
 * Copyright (c) 2025 heyworkly
 * SPDX-License-Identifier: Apache-2.0
 */
import { GUIAgentData, Message } from '@ui-tars/shared/types';

import { LocalStore, PresetSource } from './validate';
import { ConversationWithSoM } from '@main/shared/types';
import { ProcessedFile } from '@main/services/fileProcessor';

export type NextAction =
  | { type: 'key'; text: string }
  | { type: 'type'; text: string }
  | { type: 'mouse_move'; x: number; y: number }
  | { type: 'left_click' }
  | { type: 'left_click_drag'; x: number; y: number }
  | { type: 'right_click' }
  | { type: 'middle_click' }
  | { type: 'double_click' }
  | { type: 'screenshot' }
  | { type: 'cursor_position' }
  | { type: 'finish' }
  | { type: 'error'; message: string };

export interface OrchestratorPlanStep {
  id: number;
  agent: 'browser' | 'desktop' | 'api';
  task: string;
  depends_on: number[];
}

export interface OrchestratorStepResult {
  stepId: number;
  success: boolean;
  result?: string;
  error?: string;
  retries: number;
  startTime?: number;
  endTime?: number;
}

export interface OrchestratorToolCall {
  stepId: number;
  toolName: string;
  args: Record<string, unknown>;
  status: 'pending' | 'success' | 'error';
  result?: string;
  timestamp: number;
}

export interface CursorState {
  x: number;
  y: number;
  action: string;
  visible: boolean;
}

export type AppState = {
  theme: 'dark' | 'light';
  ensurePermissions: { screenCapture?: boolean; accessibility?: boolean };
  instructions: string | null;
  restUserData: Omit<GUIAgentData, 'status' | 'conversations'> | null;
  status: GUIAgentData['status'];
  errorMsg: string | null;
  sessionHistoryMessages: Message[];
  messages: ConversationWithSoM[];
  abortController: AbortController | null;
  thinking: boolean;
  browserAvailable: boolean;
  attachments: ProcessedFile[];
  // Mission Control orchestrator state
  orchestratorPlan: OrchestratorPlanStep[] | null;
  orchestratorActiveStep: number | null;
  orchestratorStepResults: OrchestratorStepResult[];
  orchestratorToolCalls: OrchestratorToolCall[];
  orchestratorCursor: CursorState | null;
  orchestratorPhase:
    | 'idle'
    | 'planning'
    | 'plan-reveal'
    | 'executing'
    | 'complete';
  orchestratorStartTime: number | null;
};

export enum VlmProvider {
  // Ollama = 'ollama',
  Huggingface = 'Hugging Face',
  vLLM = 'vLLM',
}

export enum VLMProviderV2 {
  openrouter = 'OpenRouter',
  custom = 'Custom (OpenAI-Compatible)',
}

export enum SearchEngineForSettings {
  GOOGLE = 'google',
  BAIDU = 'baidu',
  BING = 'bing',
}

export enum Operator {
  RemoteComputer = 'Remote Computer Operator',
  RemoteBrowser = 'Remote Browser Operator',
  LocalComputer = 'Local Computer Operator',
  LocalBrowser = 'Local Browser Operator',
}

export type { PresetSource, LocalStore };
