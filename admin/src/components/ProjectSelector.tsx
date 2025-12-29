'use client';

import { useState, useMemo } from 'react';

const PROJECT_TYPES = ['호텔', '펜션', '캠핑', 'F&B', '기타'] as const;

interface ProjectSettings {
  type?: string;
  province?: string;
  location?: string;
}

interface SimpleProject {
  id: string;
  name: string;
  settings?: Record<string, unknown> | null;
}

interface ProjectSelectorProps {
  projects: SimpleProject[];
  selectedProjectId: string;
  onProjectChange: (projectId: string) => void;
  showAllOption?: boolean;
}

export default function ProjectSelector({
  projects,
  selectedProjectId,
  onProjectChange,
  showAllOption = false,
}: ProjectSelectorProps) {
  const [typeFilter, setTypeFilter] = useState('');
  const [provinceFilter, setProvinceFilter] = useState('');
  const [searchText, setSearchText] = useState('');

  // Get unique provinces from projects for the filter dropdown
  const availableProvinces = useMemo(() => {
    const provinces = new Set<string>();
    projects.forEach((p) => {
      const settings = p.settings as ProjectSettings | null;
      if (settings?.province) {
        provinces.add(settings.province);
      }
    });
    return Array.from(provinces).sort();
  }, [projects]);

  // Filter projects based on selections
  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      const settings = project.settings as ProjectSettings | null;

      // Type filter
      if (typeFilter && settings?.type !== typeFilter) {
        return false;
      }

      // Province filter
      if (provinceFilter && settings?.province !== provinceFilter) {
        return false;
      }

      // Search text
      if (searchText) {
        const searchLower = searchText.toLowerCase();
        const nameMatch = project.name.toLowerCase().includes(searchLower);
        const locationMatch = settings?.location?.toLowerCase().includes(searchLower);
        if (!nameMatch && !locationMatch) {
          return false;
        }
      }

      return true;
    });
  }, [projects, typeFilter, provinceFilter, searchText]);

  const selectedProject = projects.find((p) => p.id === selectedProjectId);
  const selectedSettings = selectedProject?.settings as ProjectSettings | null;

  return (
    <div className="bg-white rounded-lg shadow-sm border">
      {/* Filter Bar */}
      <div className="p-4 border-b space-y-3">
        {/* Filters Row */}
        <div className="flex items-center gap-3">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
          >
            <option value="">전체</option>
            {PROJECT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>

          <select
            value={provinceFilter}
            onChange={(e) => setProvinceFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
          >
            <option value="">시 선택</option>
            {availableProvinces.map((province) => (
              <option key={province} value={province}>
                {province}
              </option>
            ))}
          </select>

          <div className="flex-1 relative">
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="프로젝트명 검색"
              className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md text-sm"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
              🔍
            </span>
          </div>
        </div>

        {/* Project Dropdown Row */}
        <div className="flex items-center gap-3">
          <select
            value={selectedProjectId}
            onChange={(e) => onProjectChange(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
          >
            {showAllOption && <option value="all">전체</option>}
            <option value="">프로젝트 선택</option>
            {filteredProjects.map((project) => {
              const settings = project.settings as ProjectSettings | null;
              return (
                <option key={project.id} value={project.id}>
                  {project.name} · {settings?.location || '-'}
                </option>
              );
            })}
          </select>
          <div className="text-sm text-gray-500 whitespace-nowrap">
            {filteredProjects.length}개 프로젝트
          </div>
        </div>
      </div>

      {/* Selected Project Badge */}
      {selectedProjectId === 'all' ? (
        <div className="p-4 bg-gray-50">
          <div className="flex items-start gap-3 p-3 bg-white border-2 border-purple-500 rounded-lg">
            <span className="flex items-center justify-center w-8 h-8 bg-purple-100 text-purple-600 rounded-full font-bold">
              ★
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-gray-500 mb-0.5">선택된 프로젝트</div>
              <div className="font-semibold text-gray-900 truncate">
                전체 프로젝트
              </div>
              <div className="text-sm text-gray-600 mt-1">
                모든 프로젝트의 데이터를 표시합니다
              </div>
            </div>
          </div>
        </div>
      ) : selectedProject && (
        <div className="p-4 bg-gray-50">
          <div className="flex items-start gap-3 p-3 bg-white border-2 border-blue-500 rounded-lg">
            <span className="flex items-center justify-center w-8 h-8 bg-blue-100 text-blue-600 rounded-full font-bold">
              ✓
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-gray-500 mb-0.5">선택된 프로젝트</div>
              <div className="font-semibold text-gray-900 truncate">
                {selectedProject.name}
              </div>
              {selectedSettings?.location && (
                <div className="text-sm text-gray-600 flex items-center gap-1 mt-1">
                  <span>📍</span>
                  <span>{selectedSettings.location}</span>
                </div>
              )}
            </div>
            {selectedSettings?.type && (
              <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">
                {selectedSettings.type}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
