import { UITarsModelVersion } from '@ui-tars/shared/constants';
import {
  Operator,
  SearchEngineForSettings,
  VLMProviderV2,
} from '../store/types';
import {
  getSystemPromptV1_5,
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

export const getModelVersion = (
  _provider: VLMProviderV2 | string | undefined,
): UITarsModelVersion => {
  // All providers use V1_5 format (0-1000 coordinate range)
  return UITarsModelVersion.V1_5;
};

export const getSpByModelVersion = (
  _modelVersion: UITarsModelVersion,
  language: 'zh' | 'en',
  _operatorType: 'browser' | 'computer',
) => {
  return getSystemPromptV1_5(language, 'normal');
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
