'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Profile } from '@/types/database';

interface SidebarProps {
  profile: Profile;
}

export default function Sidebar({ profile }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  const isSuperAdmin = profile.role === 'super_admin';
  const isProjectAdmin = profile.role === 'project_admin';
  const isCallOnly = profile.role === 'call_only';

  const getRoleDisplayName = () => {
    if (isSuperAdmin) return 'Super Admin';
    if (isProjectAdmin) return 'Project Admin';
    if (isCallOnly) return 'Call Only';
    return 'Kiosk';
  };

  const superAdminLinks = [
    { href: '/dashboard', label: '대시보드', icon: '📊' },
    { href: '/dashboard/kiosks', label: '전체 키오스크', icon: '🖥️' },
    { href: '/dashboard/rooms', label: '당일 객실', icon: '🛏️' },
    { href: '/dashboard/call-history', label: '통화 기록', icon: '📞' },
    { href: '/dashboard/content', label: '문구 편집', icon: '✏️' },
  ];

  // Project admins only see: dashboard, rooms, content
  const projectAdminLinks = [
    { href: '/dashboard', label: '대시보드', icon: '📊' },
    { href: '/dashboard/rooms', label: '당일 객실', icon: '🛏️' },
    { href: '/dashboard/content', label: '문구 편집', icon: '✏️' },
  ];

  const links = isSuperAdmin ? superAdminLinks : projectAdminLinks;

  return (
    <div className="w-64 bg-gray-900 text-white min-h-screen flex flex-col">
      <div className="p-4 border-b border-gray-800">
        <h1 className="text-xl font-bold">키오스크 관리</h1>
        <p className="text-sm text-gray-400 mt-1">
          {getRoleDisplayName()}
        </p>
      </div>

      {profile.project && (
        <div className="px-4 py-3 bg-gray-800">
          <p className="text-xs text-gray-400">프로젝트</p>
          <p className="text-sm font-medium">{profile.project.name}</p>
          
          {/* Show additional projects for team leaders */}
          {profile.projects && profile.projects.length > 1 && (
            <details className="mt-2">
              <summary className="text-xs text-blue-400 cursor-pointer hover:text-blue-300">
                +{profile.projects.length - 1}개 더 보기
              </summary>
              <ul className="mt-2 space-y-1 text-xs text-gray-300">
                {profile.projects.slice(1).map((proj) => (
                  <li key={proj.id} className="pl-2 py-1">
                    • {proj.name}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {links.map((link) => {
            const isActive = pathname === link.href;
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-300 hover:bg-gray-800'
                  }`}
                >
                  <span>{link.icon}</span>
                  <span>{link.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="p-4 border-t border-gray-800">
        <div className="mb-3">
          <p className="text-sm text-gray-400">{profile.email}</p>
          <p className="text-xs text-gray-500">{profile.full_name || '이름 없음'}</p>
        </div>
        <button
          onClick={handleLogout}
          className="w-full px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 rounded-lg transition-colors"
        >
          로그아웃
        </button>
      </div>
    </div>
  );
}
