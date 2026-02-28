/**
 * Copyright (c) 2025 heyworkly
 * SPDX-License-Identifier: Apache-2.0
 */
import { Settings, Sun, Moon } from 'lucide-react';

import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
} from '@renderer/components/ui/sidebar';
import { useStore } from '@renderer/hooks/useStore';
import { api } from '@renderer/api';

interface NavSettingsProps {
  onClick: () => void;
}

export function NavSettings({ onClick }: NavSettingsProps) {
  const { theme } = useStore();
  const isDark = theme !== 'light';

  const toggleTheme = () => {
    const next = isDark ? 'light' : 'dark';
    api.setTheme({ theme: next });
  };

  return (
    <SidebarGroup>
      <SidebarMenu className="items-center">
        <SidebarMenuButton className="font-medium" onClick={toggleTheme}>
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          <span>{isDark ? 'Light Mode' : 'Dark Mode'}</span>
        </SidebarMenuButton>
        <SidebarMenuButton className="font-medium" onClick={onClick}>
          <Settings />
          <span>Settings</span>
        </SidebarMenuButton>
      </SidebarMenu>
    </SidebarGroup>
  );
}
