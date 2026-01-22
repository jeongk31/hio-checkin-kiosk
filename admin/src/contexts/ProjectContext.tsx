'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';

interface ProjectSettings {
  daily_reset_time?: string;
  payment_agent_url?: string;
  type?: string;
  province?: string;
  location?: string;
}

interface ProjectContextType {
  projectId: string | null;
  projectSettings: ProjectSettings;
  loadProjectSettings: (projectId: string) => Promise<void>;
  paymentAgentUrl: string;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectSettings, setProjectSettings] = useState<ProjectSettings>({});

  const loadProjectSettings = async (pid: string) => {
    try {
      const response = await fetch(`/api/projects/${pid}/settings`);
      if (response.ok) {
        const data = await response.json();
        setProjectId(pid);
        setProjectSettings(data.settings || {});
      }
    } catch (error) {
      console.error('Error loading project settings:', error);
    }
  };

  // Get payment agent URL with fallback to env variable
  const paymentAgentUrl = projectSettings.payment_agent_url || 
                          process.env.NEXT_PUBLIC_PAYMENT_AGENT_URL || 
                          'http://localhost:8085';

  return (
    <ProjectContext.Provider value={{ 
      projectId, 
      projectSettings, 
      loadProjectSettings,
      paymentAgentUrl 
    }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const context = useContext(ProjectContext);
  if (context === undefined) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
}
