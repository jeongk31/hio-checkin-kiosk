'use client';

import { useState, useMemo } from 'react';
import './ProjectSelector.css';

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
    <div className="project-search-wrapper">
      <div className="project-search-bar">
        {/* Filters Row */}
        <div className="project-filters-row">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="search-filter-select"
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
            className="search-filter-select"
          >
            <option value="">시 선택</option>
            {availableProvinces.map((province) => (
              <option key={province} value={province}>
                {province}
              </option>
            ))}
          </select>

          <div className="search-input-wrapper">
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="프로젝트명 검색"
              className="search-text-input"
            />
            <span className="search-icon">🔍</span>
          </div>
        </div>

        {/* Project Dropdown Row */}
        <div className="project-dropdown-row">
          <select
            value={selectedProjectId}
            onChange={(e) => onProjectChange(e.target.value)}
            className="project-select"
          >
            {showAllOption && <option value="all">전체</option>}
            <option value="">프로젝트 선택</option>
            {filteredProjects.map((project) => {
              const settings = project.settings as ProjectSettings | null;
              return (
                <option key={project.id} value={project.id}>
                  {project.name}{settings?.location ? ` · ${settings.location}` : ''}
                </option>
              );
            })}
          </select>
          <div className="project-count">
            {filteredProjects.length}개 프로젝트
          </div>
        </div>
      </div>

      {/* Selected Project Badge */}
      <div className="project-selection-header">
        {selectedProjectId === 'all' ? (
          <div className="project-badge selected all">
            <span className="project-icon">★</span>
            <div className="project-badge-content">
              <span className="project-badge-label">선택된 프로젝트</span>
              <span className="project-badge-name">전체 프로젝트</span>
              <span className="project-badge-location">모든 프로젝트의 데이터를 표시합니다</span>
            </div>
          </div>
        ) : selectedProject ? (
          <div className="project-badge selected">
            <span className="project-icon">✓</span>
            <div className="project-badge-content">
              <span className="project-badge-label">선택된 프로젝트</span>
              <span className="project-badge-name">{selectedProject.name}</span>
              {selectedSettings?.location && (
                <span className="project-badge-location">📍 {selectedSettings.location}</span>
              )}
            </div>
            {selectedSettings?.type && (
              <span className="project-type-tag">{selectedSettings.type}</span>
            )}
          </div>
        ) : (
          <div className="project-badge warning">
            <span className="project-icon">⚠️</span>
            <div className="project-badge-content">
              <span className="project-badge-label">프로젝트 미선택</span>
              <span className="project-badge-name">프로젝트를 선택해주세요</span>
              <span className="project-badge-location">위 검색 바를 사용해 프로젝트를 선택하세요</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
