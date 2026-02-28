import { useEffect } from 'react';
import { Outlet } from 'react-router';
import { AppSidebar } from '@/renderer/src/components/SideBar/app-sidebar';
import { SidebarInset, SidebarProvider } from '@renderer/components/ui/sidebar';
import { useStore } from '@renderer/hooks/useStore';

export function MainLayout() {
  const { theme } = useStore();

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light') {
      root.classList.remove('dark');
      root.classList.add('light');
      document.body.style.backgroundColor = '#f8f8fa';
    } else {
      root.classList.remove('light');
      root.classList.add('dark');
      document.body.style.backgroundColor = '#1a1a2e';
    }
  }, [theme]);

  return (
    <SidebarProvider
      style={{ '--sidebar-width-icon': '72px' }}
      className="flex h-screen w-full bg-background"
    >
      <AppSidebar />
      <SidebarInset className="flex-1">
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  );
}
