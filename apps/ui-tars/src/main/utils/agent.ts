import { UITarsModelVersion } from '@ui-tars/shared/constants';
import {
  Operator,
  SearchEngineForSettings,
  VLMProviderV2,
} from '../store/types';
import {
  getSystemPromptV1_5,
  getSystemPromptGeneralVLM,
} from '../agent/prompts';
import {
  closeScreenMarker,
  hideScreenWaterFlow,
  hideWidgetWindow,
  showScreenWaterFlow,
  showWidgetWindow,
} from '../window/ScreenMarker';
import { hideMainWindow, showMainWindow } from '../window';
import { SearchEngine } from '@ui-tars/operator-browser';

/**
 * Known UI-TARS native model patterns.
 * These models were specifically trained with the <|box_start|> coordinate format.
 */
const UI_TARS_MODEL_PATTERNS = ['ui-tars', 'uitars', 'ui_tars'];

/**
 * Detect if a model name refers to a UI-TARS native model.
 * General VLMs (Claude, GPT, Gemini, Qwen, etc.) need a different prompt format.
 */
export const isUITarsModel = (modelName: string | undefined): boolean => {
  if (!modelName) return false;
  const lower = modelName.toLowerCase();
  return UI_TARS_MODEL_PATTERNS.some((pattern) => lower.includes(pattern));
};

export const getModelVersion = (
  _provider: VLMProviderV2 | string | undefined,
): UITarsModelVersion => {
  // All providers use V1_5 format (0-1000 coordinate range)
  return UITarsModelVersion.V1_5;
};

/**
 * Select the appropriate system prompt based on the model.
 * - UI-TARS models: Use V1.5 format with <|box_start|> tokens (native training format)
 * - General VLMs (Claude, GPT, Gemini, etc.): Use standard [x,y,x,y] coordinate format
 *   with detailed instructions since these models weren't trained for GUI automation
 */
export const getSpByModelVersion = (
  _modelVersion: UITarsModelVersion,
  language: 'zh' | 'en',
  operatorType: 'browser' | 'computer',
  modelName?: string,
) => {
  if (isUITarsModel(modelName)) {
    return getSystemPromptV1_5(language, 'normal');
  }
  // General VLM — use comprehensive prompt with standard coordinate format
  return getSystemPromptGeneralVLM(language, operatorType);
};

export const getLocalBrowserSearchEngine = (
  engine?: SearchEngineForSettings,
) => {
  return (engine || SearchEngineForSettings.GOOGLE) as unknown as SearchEngine;
};

export const beforeAgentRun = async (operator: Operator) => {
  switch (operator) {
    case Operator.RemoteComputer:
      break;
    case Operator.RemoteBrowser:
      break;
    case Operator.LocalComputer:
      showWidgetWindow();
      showScreenWaterFlow();
      hideMainWindow();
      break;
    case Operator.LocalBrowser:
      // Browser runs headless — main window stays visible with workspace panel
      break;
    default:
      break;
  }
};

export const afterAgentRun = (operator: Operator) => {
  switch (operator) {
    case Operator.RemoteComputer:
      break;
    case Operator.RemoteBrowser:
      break;
    case Operator.LocalComputer:
      hideWidgetWindow();
      closeScreenMarker();
      hideScreenWaterFlow();
      showMainWindow();
      break;
    case Operator.LocalBrowser:
      // No widget to hide, main window was never hidden
      break;
    default:
      break;
  }
};
