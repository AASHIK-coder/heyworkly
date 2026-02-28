/**
 * Copyright (c) 2025 heyworkly
 * SPDX-License-Identifier: Apache-2.0
 */
import { ElectronHandler } from '../../../preload/index';

declare global {
  // eslint-disable-next-line no-unused-vars
  interface Window {
    electron: ElectronHandler;
    platform: NodeJS.Platform;
    zustandBridge: any;
  }

  // eslint-disable-next-line no-unused-vars
  namespace JSX {
    // eslint-disable-next-line no-unused-vars
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          src?: string;
          preload?: string;
          partition?: string;
          allowpopups?: string;
          nodeintegration?: string;
          disablewebsecurity?: string;
          webpreferences?: string;
        },
        HTMLElement
      >;
    }
  }
}

export {};
