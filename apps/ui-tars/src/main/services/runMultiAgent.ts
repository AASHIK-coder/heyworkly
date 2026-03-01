/**
 * Copyright (c) 2025 heyworkly
 * SPDX-License-Identifier: Apache-2.0
 */
import { StatusEnum } from '@ui-tars/shared/types';
import { ToolCallingModel, AgentLoop } from '@ui-tars/sdk';
import { Orchestrator } from '../agent/orchestrator/Orchestrator';
import {
  getBrowserToolDefinitions,
  createBrowserToolHandlers,
} from '../agent/tools/browserTools';
import {
  getDesktopToolDefinitions,
  createDesktopToolHandlers,
} from '../agent/tools/desktopTools';
import { NutJSElectronOperator } from '../agent/operator';
import { EmbeddedBrowserOperator } from '../agent/webviewOperator';
import { SettingStore } from '@main/store/setting';
import { AppState } from '@main/store/types';
import { logger } from '@main/logger';
import { beforeAgentRun, afterAgentRun } from '../utils/agent';
import {
  mouse,
  keyboard,
  Button,
  Key,
  Point,
  straightTo,
} from '@computer-use/nut-js';
import { clipboard } from 'electron';
import {
  showCursorOverlay,
  hideCursorOverlay,
  showScreenWaterFlow,
  hideScreenWaterFlow,
  setWaterFlowState,
} from '@main/window/ScreenMarker';
import { transformToWidget, expandFromWidget } from '@main/window/index';

export const runMultiAgent = async (
  setState: (state: AppState) => void,
  getState: () => AppState,
) => {
  const settings = SettingStore.getStore();
  const { instructions, abortController } = getState();
  if (!instructions) return;

  // Initialize orchestrator state
  const startTime = Date.now();
  setState({
    ...getState(),
    status: StatusEnum.RUNNING,
    orchestratorPhase: 'planning',
    orchestratorStartTime: startTime,
    orchestratorPlan: null,
    orchestratorActiveStep: null,
    orchestratorStepResults: [],
    orchestratorToolCalls: [],
  });

  // Create per-agent models with shared base config
  const baseConfig = {
    baseURL: settings.vlmBaseUrl,
    apiKey: settings.vlmApiKey,
  };

  const plannerModel = new ToolCallingModel({
    ...baseConfig,
    model: settings.plannerModel || settings.vlmModelName,
  });

  // Browser agent setup (may fail if webview is not available)
  let browserLoop: AgentLoop | null = null;
  try {
    const browserOp = new EmbeddedBrowserOperator();
    await browserOp.connect();
    const browserModel = new ToolCallingModel({
      ...baseConfig,
      model: settings.browserAgentModel || settings.vlmModelName,
    });

    // The EmbeddedBrowserOperator uses CDP, not Puppeteer Page.
    // For browser tools we create a minimal Page-like proxy via CDP.
    // For now, browser tools operate through the existing EmbeddedBrowserOperator's
    // screenshot/execute interface - we pass null page and tools will report the error.
    // TODO: In a future iteration, bridge CDP webContents to Puppeteer Page interface
    browserLoop = new AgentLoop({
      model: browserModel,
      tools: getBrowserToolDefinitions(),
      toolHandlers: createBrowserToolHandlers(() => null),
      maxIterations: 25,
      signal: abortController?.signal,
      logger,
    });
  } catch (e) {
    logger.warn('[runMultiAgent] Browser agent not available:', e);
  }

  // Desktop agent setup with real nut-js bindings
  const desktopOp = new NutJSElectronOperator();
  const desktopModel = new ToolCallingModel({
    ...baseConfig,
    model: settings.desktopAgentModel || settings.vlmModelName,
  });

  const desktopLoop = new AgentLoop({
    model: desktopModel,
    tools: getDesktopToolDefinitions(),
    toolHandlers: createDesktopToolHandlers({
      screenshot: () => desktopOp.screenshot(),
      click: async (x, y, opts) => {
        await mouse.move(straightTo(new Point(x, y)));
        if (opts?.double) {
          await mouse.doubleClick(
            opts?.button === 'right' ? Button.RIGHT : Button.LEFT,
          );
        } else {
          const btn =
            opts?.button === 'right'
              ? Button.RIGHT
              : opts?.button === 'middle'
                ? Button.MIDDLE
                : Button.LEFT;
          await mouse.click(btn);
        }
      },
      type: async (text) => {
        await keyboard.type(text);
      },
      hotkey: async (keys) => {
        const nutKeys = keys
          .map((k) => {
            const upper = k.charAt(0).toUpperCase() + k.slice(1);
            return (Key as unknown as Record<string, number>)[upper] ?? null;
          })
          .filter((k): k is number => k !== null);
        if (nutKeys.length > 0) {
          await keyboard.pressKey(...(nutKeys as Key[]));
          await keyboard.releaseKey(...(nutKeys as Key[]));
        }
      },
      scroll: async (direction, amount) => {
        const pixels = (amount ?? 3) * 100;
        switch (direction.toLowerCase()) {
          case 'up':
            await mouse.scrollUp(pixels);
            break;
          case 'down':
            await mouse.scrollDown(pixels);
            break;
          case 'left':
            await mouse.scrollLeft(pixels);
            break;
          case 'right':
            await mouse.scrollRight(pixels);
            break;
        }
      },
      drag: async (sx, sy, ex, ey) => {
        await mouse.move(straightTo(new Point(sx, sy)));
        await mouse.drag(straightTo(new Point(ex, ey)));
      },
    }),
    maxIterations: 25,
    signal: abortController?.signal,
    logger,
  });

  // Override clipboard placeholders with real Electron clipboard
  const handlers = desktopLoop['config'].toolHandlers;
  handlers.clipboard_get = async () => {
    try {
      return { success: true, result: clipboard.readText() };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  };
  handlers.clipboard_set = async (args) => {
    try {
      clipboard.writeText(args.text as string);
      return { success: true, result: 'Clipboard updated' };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  };

  // Track step start times for elapsed-time display
  const stepStartTimes = new Map<number, number>();

  // Create orchestrator with state-emitting callbacks
  const orchestrator = new Orchestrator({
    plannerModel,
    agents: {
      browser: browserLoop ? { type: 'browser', loop: browserLoop } : null,
      desktop: { type: 'desktop', loop: desktopLoop },
      api: null, // Phase 3 — MCP integration
    },
    signal: abortController?.signal,
    onPlanCreated: (plan) => {
      logger.info(`[Orchestrator] Plan created: ${plan.plan.length} steps`);
      setState({
        ...getState(),
        orchestratorPlan: plan.plan.map((s) => ({
          id: s.id,
          agent: s.agent,
          task: s.task,
          depends_on: s.depends_on,
        })),
        orchestratorPhase: 'plan-reveal',
      });
      // After brief reveal, transition to executing and transform window
      setTimeout(() => {
        if (getState().orchestratorPhase === 'plan-reveal') {
          setState({ ...getState(), orchestratorPhase: 'executing' });
          transformToWidget();
        }
      }, 2000);
    },
    onStepStart: (step) => {
      logger.info(`[Orchestrator] Starting step ${step.id}: ${step.task}`);
      stepStartTimes.set(step.id, Date.now());
      setWaterFlowState('active');
      setState({
        ...getState(),
        orchestratorActiveStep: step.id,
      });
    },
    onStepComplete: (step, result) => {
      logger.info(
        `[Orchestrator] Step ${step.id} ${result.success ? 'succeeded' : 'failed'}`,
      );
      setWaterFlowState(result.success ? 'step-complete' : 'error');
      const current = getState();
      setState({
        ...current,
        orchestratorStepResults: [
          ...current.orchestratorStepResults,
          {
            stepId: result.stepId,
            success: result.success,
            result: result.result,
            error: result.error,
            retries: result.retries,
            startTime: stepStartTimes.get(result.stepId),
            endTime: Date.now(),
          },
        ],
      });
    },
  });

  beforeAgentRun(settings.operator);

  // Start visual effects
  showScreenWaterFlow();
  showCursorOverlay();

  try {
    const result = await orchestrator.run(instructions);

    logger.info(
      `[runMultiAgent] Completed in ${((Date.now() - startTime) / 1000).toFixed(1)}s — ${result.results.length} steps, ${result.results.filter((r) => r.success).length} succeeded`,
    );

    setState({
      ...getState(),
      status: result.success ? StatusEnum.END : StatusEnum.ERROR,
      orchestratorPhase: 'complete',
      orchestratorActiveStep: null,
      errorMsg: result.success
        ? null
        : `Some steps failed: ${result.results
            .filter((r) => !r.success)
            .map((r) => `Step ${r.stepId}: ${r.error}`)
            .join('; ')}`,
    });
  } catch (e) {
    logger.error('[runMultiAgent] error:', e);
    setState({
      ...getState(),
      status: StatusEnum.ERROR,
      orchestratorPhase: 'complete',
      orchestratorActiveStep: null,
      errorMsg: e instanceof Error ? e.message : String(e),
    });
  } finally {
    afterAgentRun(settings.operator);
    hideCursorOverlay();
    setWaterFlowState('fadeout');
    setTimeout(() => {
      hideScreenWaterFlow();
      expandFromWidget();
    }, 1500);
  }
};
