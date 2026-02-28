/**
 * Copyright (c) 2025 heyworkly
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarTrigger,
} from '@renderer/components/ui/sidebar';

import heyworklyLogo from '@renderer/assets/heyworkly-logo.svg?url';

interface HeaderProps {
  showTrigger: boolean;
}

export function UITarsHeader({ showTrigger }: HeaderProps) {
  return (
    <SidebarMenu className="items-center">
      <SidebarMenuButton
        className="group-data-[collapsible=icon]:p-0! mb-2 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground hover:bg-transparent"
      >
        <div className="flex aspect-square size-8 items-center justify-center rounded-lg">
          <img src={heyworklyLogo} alt="heyworkly" className="size-8" />
        </div>
        <div className="grid flex-1 text-left text-sm leading-tight">
          <span className="truncate font-semibold bg-gradient-to-r from-orange-400 to-orange-600 bg-clip-text text-transparent">heyworkly</span>
          <span className="truncate text-xs pb-[1px] text-muted-foreground">Desktop Agent</span>
        </div>
      </SidebarMenuButton>
      {showTrigger && (
        <SidebarTrigger className="absolute top-12 right-2 group-data-[collapsible=icon]:right-[-36px]" />
      )}
    </SidebarMenu>
  );
}
