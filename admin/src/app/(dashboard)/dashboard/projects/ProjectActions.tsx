'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface SimpleProject {
  id: string;
  name: string;
  is_active: boolean;
}

interface ProjectActionsProps {
  project: SimpleProject;
}

export default function ProjectActions({ project }: ProjectActionsProps) {
  const router = useRouter();

  const handleToggleActive = async () => {
    try {
      const response = await fetch('/api/projects/update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: project.id,
          isActive: !project.is_active,
        }),
      });

      if (response.ok) {
        router.refresh();
      }
    } catch (error) {
      console.error('Error updating project:', error);
    }
  };

  const handleDelete = async () => {
    if (!confirm('정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return;

    try {
      const response = await fetch('/api/projects/update', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: project.id }),
      });

      if (response.ok) {
        router.refresh();
      }
    } catch (error) {
      console.error('Error deleting project:', error);
    }
  };

  return (
    <div className="flex items-center justify-end gap-2">
      <Link
        href={`/dashboard/projects/${project.id}`}
        className="text-blue-600 hover:text-blue-800"
      >
        편집
      </Link>
      <button
        onClick={handleToggleActive}
        className="text-yellow-600 hover:text-yellow-800"
      >
        {project.is_active ? '비활성화' : '활성화'}
      </button>
      <button onClick={handleDelete} className="text-red-600 hover:text-red-800">
        삭제
      </button>
    </div>
  );
}
