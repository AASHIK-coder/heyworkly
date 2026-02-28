/**
 * Copyright (c) 2025 heyworkly
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Monitor, Globe } from 'lucide-react';

import { Button } from '@renderer/components/ui/button';

import { Operator } from '@main/store/types';
import { useSession } from '../../hooks/useSession';
import {
  checkVLMSettings,
  LocalSettingsDialog,
} from '@renderer/components/Settings/local';

import { sleep } from '@ui-tars/shared/utils';

import { FreeTrialDialog } from '../../components/AlertDialog/freeTrialDialog';
import { DragArea } from '../../components/Common/drag';

const Home = () => {
  const navigate = useNavigate();
  const { createSession } = useSession();
  const [localConfig, setLocalConfig] = useState({
    open: false,
    operator: Operator.LocalComputer,
  });
  const [remoteConfig, setRemoteConfig] = useState({
    open: false,
    operator: Operator.RemoteComputer,
  });

  const toRemoteComputer = async (value: 'free' | 'paid') => {
    const session = await createSession('New Session', {
      operator: Operator.RemoteComputer,
      isFree: value === 'free',
    });

    if (value === 'free') {
      navigate('/free-remote', {
        state: {
          operator: Operator.RemoteComputer,
          sessionId: session?.id,
          isFree: true,
          from: 'home',
        },
      });
      return;
    }

    navigate('/paid-remote', {
      state: {
        operator: Operator.RemoteComputer,
        sessionId: session?.id,
        isFree: false,
        from: 'home',
      },
    });
  };

  const toRemoteBrowser = async (value: 'free' | 'paid') => {
    const session = await createSession('New Session', {
      operator: Operator.RemoteBrowser,
      isFree: value === 'free',
    });

    if (value === 'free') {
      navigate('/free-remote', {
        state: {
          operator: Operator.RemoteBrowser,
          sessionId: session?.id,
          isFree: true,
          from: 'home',
        },
      });
      return;
    }

    navigate('/paid-remote', {
      state: {
        operator: Operator.RemoteBrowser,
        sessionId: session?.id,
        isFree: false,
        from: 'home',
      },
    });
  };

  const toLocal = async (operator: Operator) => {
    const session = await createSession('New Session', {
      operator: operator,
    });

    navigate('/local', {
      state: {
        operator: operator,
        sessionId: session?.id,
        from: 'home',
      },
    });
  };

  const handleLocalPress = async (operator: Operator) => {
    const hasVLM = await checkVLMSettings();

    if (hasVLM) {
      toLocal(operator);
    } else {
      setLocalConfig({ open: true, operator: operator });
    }
  };

  const handleFreeDialogComfirm = async () => {
    if (remoteConfig.operator === Operator.RemoteBrowser) {
      toRemoteBrowser('free');
    } else {
      toRemoteComputer('free');
    }
  };

  const handleRemoteDialogClose = (status: boolean) => {
    setRemoteConfig({ open: status, operator: remoteConfig.operator });
  };

  const handleLocalSettingsSubmit = async () => {
    setLocalConfig({ open: false, operator: localConfig.operator });
    await sleep(200);
    await toLocal(localConfig.operator);
  };

  const handleLocalSettingsClose = () => {
    setLocalConfig({ open: false, operator: localConfig.operator });
  };

  return (
    <div className="w-full h-full flex flex-col">
      <DragArea />
      <div className="w-full h-full flex flex-col items-center justify-center relative">
        {/* Subtle background grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />

        {/* Coral glow effect */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] bg-orange-500/5 rounded-full blur-[100px]" />

        <div className="relative z-10 flex flex-col items-center">
          {/* Brand title */}
          <h1 className="text-5xl font-bold tracking-tight mb-2">
            <span className="bg-gradient-to-r from-orange-400 via-orange-500 to-orange-600 bg-clip-text text-transparent">
              heyworkly
            </span>
          </h1>
          <p className="text-lg text-muted-foreground mb-12 tracking-wide">
            Desktop Agent
          </p>

          {/* Operator cards */}
          <div className="flex gap-5">
            {/* Computer Operator */}
            <button
              onClick={() => handleLocalPress(Operator.LocalComputer)}
              className="group relative w-[340px] p-6 rounded-2xl border border-border bg-card/50 backdrop-blur-sm hover:border-orange-500/40 hover:bg-card/80 transition-all duration-300"
            >
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-orange-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="relative flex flex-col items-start gap-4">
                <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-orange-500/10 text-orange-500">
                  <Monitor className="w-6 h-6" />
                </div>
                <div className="text-left">
                  <h3 className="text-base font-semibold text-foreground mb-1.5">
                    Computer Operator
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Automate tasks directly on your computer with AI-powered desktop control.
                  </p>
                </div>
                <div className="flex items-center gap-1.5 text-xs font-medium text-orange-500 opacity-0 group-hover:opacity-100 transition-opacity">
                  Get started
                  <span className="transition-transform group-hover:translate-x-0.5">&rarr;</span>
                </div>
              </div>
            </button>

            {/* Browser Operator */}
            <button
              onClick={() => handleLocalPress(Operator.LocalBrowser)}
              className="group relative w-[340px] p-6 rounded-2xl border border-border bg-card/50 backdrop-blur-sm hover:border-orange-500/40 hover:bg-card/80 transition-all duration-300"
            >
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-orange-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="relative flex flex-col items-start gap-4">
                <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-orange-500/10 text-orange-500">
                  <Globe className="w-6 h-6" />
                </div>
                <div className="text-left">
                  <h3 className="text-base font-semibold text-foreground mb-1.5">
                    Browser Operator
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Navigate pages, fill forms, and automate browser workflows with AI assistance.
                  </p>
                </div>
                <div className="flex items-center gap-1.5 text-xs font-medium text-orange-500 opacity-0 group-hover:opacity-100 transition-opacity">
                  Get started
                  <span className="transition-transform group-hover:translate-x-0.5">&rarr;</span>
                </div>
              </div>
            </button>
          </div>
        </div>
        <LocalSettingsDialog
          isOpen={localConfig.open}
          onSubmit={handleLocalSettingsSubmit}
          onClose={handleLocalSettingsClose}
        />
        <FreeTrialDialog
          open={remoteConfig.open}
          onOpenChange={handleRemoteDialogClose}
          onConfirm={handleFreeDialogComfirm}
        />
      </div>
      <DragArea />
    </div>
  );
};

export default Home;
