'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { Profile } from '@/types/database';
import { useState } from 'react';
import { useSyncContext } from './SyncWrapper';

interface TopBarProps {
  profile: Profile;
}

export default function TopBar({ profile }: TopBarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const syncContext = useSyncContext();

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  };

  const isSuperAdmin = profile.role === 'super_admin';

  const superAdminLinks = [
    { href: '/dashboard', label: '대시보드' },
    // { href: '/dashboard/projects', label: '프로젝트' },
    // { href: '/dashboard/accounts', label: '계정' },
    { href: '/dashboard/kiosks', label: '키오스크' },
    { href: '/dashboard/rooms', label: '당일 객실' },
    { href: '/dashboard/call-history', label: '통화 기록' },
    { href: '/dashboard/content', label: '문구' },
  ];

  const projectAdminLinks = [
    { href: '/dashboard', label: '대시보드' },
    { href: '/dashboard/kiosks', label: '키오스크' },
    { href: '/dashboard/rooms', label: '당일 객실' },
    { href: '/dashboard/content', label: '문구' },
    
    { href: '/dashboard/accounts', label: '계정' },
  ];

  const links = isSuperAdmin ? superAdminLinks : projectAdminLinks;

  return (
    <header className="bg-white text-gray-900 border-b border-gray-200">
      <div className="flex items-center justify-between px-6 h-16">
        {/* Logo */}
        <div className="flex items-center gap-8">
          <Link href="/dashboard" className="flex items-center">
            <Image
              src="/logo.png"
              alt="HiO Admin"
              width={200}
              height={60}
              className="h-[60px] w-auto"
              priority
            />
          </Link>

          {/* Navigation */}
          <nav className="flex items-center gap-1">
            {links.map((link) => {
              const isActive = pathname === link.href ||
                (link.href !== '/dashboard' && pathname.startsWith(link.href));
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-gray-900 text-white'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Sync Button and User Menu */}
        <div className="flex items-center gap-4">
          {/* Sync Button */}
          {syncContext && (
            <button
              onClick={syncContext.syncNow}
              disabled={syncContext.isSyncing}
              className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                syncContext.isSyncing
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : syncContext.error
                    ? 'bg-red-50 text-red-600 hover:bg-red-100'
                    : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
              }`}
              title={
                syncContext.error
                  ? syncContext.error
                  : syncContext.lastSync
                    ? `마지막 동기화: ${syncContext.lastSync.toLocaleTimeString('ko-KR')}`
                    : '동기화'
              }
            >
              <svg
                className={`w-4 h-4 ${syncContext.isSyncing ? 'animate-spin' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              <span className="hidden sm:inline">
                {syncContext.isSyncing ? '동기화 중...' : 'PMS 동기화'}
              </span>
            </button>
          )}

          {/* User Menu */}
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-gray-100 transition-colors"
            >
              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-sm font-medium text-white">
                {(profile.full_name || profile.email)[0].toUpperCase()}
              </div>
              <div className="text-left hidden sm:block">
                <p className="text-sm font-medium">{profile.full_name || profile.email}</p>
                <p className="text-xs text-gray-500">
                  {isSuperAdmin ? 'Super Admin' : profile.role === 'call_test' ? 'Call Test' : 'Project Admin'}
                  {profile.project && ` - ${profile.project.name}`}
                </p>
              </div>
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showUserMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowUserMenu(false)}
                />
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg py-1 z-20">
                  <div className="px-4 py-2 border-b">
                    <p className="text-sm text-gray-900 font-medium">{profile.email}</p>
                    <p className="text-xs text-gray-500">{profile.full_name || '이름 없음'}</p>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
                  >
                    로그아웃
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
