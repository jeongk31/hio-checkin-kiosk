'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import AccountActions from './AccountActions';
import { Profile, Project, UserRole } from '@/types/database';

interface AccountListProps {
  accounts: Profile[];
  projects: Pick<Project, 'id' | 'name'>[];
  isSuperAdmin: boolean;
  currentUserRole: UserRole;
}

const roleLabels: Record<string, string> = {
  super_admin: 'Super Admin',
  project_admin: 'Project Admin',
  kiosk: 'Kiosk',
};

export default function AccountList({
  accounts,
  projects,
  isSuperAdmin,
  currentUserRole,
}: AccountListProps) {
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');

  const filteredAccounts = useMemo(() => {
    if (!isSuperAdmin || selectedProjectId === 'all') {
      return accounts;
    }
    return accounts.filter((account) => account.project_id === selectedProjectId);
  }, [accounts, selectedProjectId, isSuperAdmin]);

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">계정 관리</h1>
        <Link
          href="/dashboard/accounts/new"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          + 새 계정
        </Link>
      </div>

      {/* Project Filter for Super Admin */}
      {isSuperAdmin && (
        <div className="mb-6 flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700">프로젝트:</label>
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">전체</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <span className="text-sm text-gray-500">
            {filteredAccounts.length}개 계정
          </span>
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                이메일
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                이름
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                역할
              </th>
              {isSuperAdmin && (
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  프로젝트
                </th>
              )}
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                상태
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                작업
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredAccounts.map((account) => (
              <tr key={account.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">{account.email}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900">
                    {account.full_name || '-'}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`px-2 py-1 text-xs rounded-full ${
                      account.role === 'super_admin'
                        ? 'bg-purple-100 text-purple-800'
                        : account.role === 'project_admin'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {roleLabels[account.role]}
                  </span>
                </td>
                {isSuperAdmin && (
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {account.project?.name || '-'}
                  </td>
                )}
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`px-2 py-1 text-xs rounded-full ${
                      account.is_active
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {account.is_active ? '활성' : '비활성'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <AccountActions
                    account={account}
                    currentUserRole={currentUserRole}
                  />
                </td>
              </tr>
            ))}
            {filteredAccounts.length === 0 && (
              <tr>
                <td
                  colSpan={isSuperAdmin ? 6 : 5}
                  className="px-6 py-12 text-center text-gray-500"
                >
                  등록된 계정이 없습니다
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
