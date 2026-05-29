'use client';

import { useState, createContext, useContext, ReactNode } from 'react';
import Sidebar from './sidebar';
import Header from './header';

interface SidebarContextType {
  sidebarOpen: boolean;
  setSidebarOpen: (v: boolean) => void;
}

const SidebarContext = createContext<SidebarContextType>({
  sidebarOpen: false,
  setSidebarOpen: () => {},
});

export function useSidebar() {
  return useContext(SidebarContext);
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <SidebarContext.Provider value={{ sidebarOpen, setSidebarOpen }}>
      <div style={{ display: 'flex', minHeight: '100vh' }}>
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div style={{ flex: 1, marginLeft: 'var(--sidebar-width)', minWidth: 0 }}>
          <Header onMenuClick={() => setSidebarOpen(true)} />
          <main style={{ padding: '1.5rem 2rem', minHeight: 'calc(100vh - var(--header-height))' }}>
            {children}
          </main>
        </div>
      </div>
    </SidebarContext.Provider>
  );
}
