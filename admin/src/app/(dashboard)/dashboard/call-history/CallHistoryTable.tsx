'use client';

import { useState } from 'react';

interface CallHistoryRecord {
  id: string;
  project_id: string;
  kiosk_id: string;
  staff_user_id: string | null;
  room_name: string;
  caller_type: 'kiosk' | 'manager';
  status: string;
  started_at: string;
  ended_at: string | null;
  notes: string | null;
  duration_seconds: number | null;
  kiosk: {
    id: string;
    name: string;
    location: string | null;
  } | null;
  project: {
    id: string;
    name: string;
  } | null;
  answered_by: {
    id: string;
    full_name: string | null;
    email: string;
  } | null;
}

interface CallHistoryTableProps {
  history: CallHistoryRecord[];
  isSuperAdmin: boolean;
}

const ITEMS_PER_PAGE = 20;

export default function CallHistoryTable({ history, isSuperAdmin }: CallHistoryTableProps) {
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.ceil(history.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const currentRecords = history.slice(startIndex, endIndex);

  const formatDuration = (seconds: number | null) => {
    if (!seconds || seconds < 0) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs}초`;
    return `${mins}분 ${secs}초`;
  };

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const getStatusBadge = (status: string, durationSeconds: number | null, staffUserId: string | null) => {
    // If staff answered (staffUserId exists) and call ended, it's completed
    const wasAnswered = staffUserId !== null && status === 'ended';
    const wasMissed = status === 'cancelled' || status === 'missed' || (status === 'ended' && staffUserId === null);
    const isWaiting = status === 'waiting';
    const isConnected = status === 'connected';

    if (isWaiting) {
      return <span className="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-800">대기중</span>;
    }
    if (isConnected) {
      return <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">통화중</span>;
    }
    if (wasAnswered) {
      return <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">완료</span>;
    }
    if (wasMissed) {
      return <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-800">부재중</span>;
    }
    return <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-800">{status}</span>;
  };

  const getCallerTypeBadge = (callerType: string) => {
    if (callerType === 'kiosk') {
      return <span className="px-2 py-1 text-xs rounded-full bg-purple-100 text-purple-800">키오스크</span>;
    }
    return <span className="px-2 py-1 text-xs rounded-full bg-indigo-100 text-indigo-800">관리자</span>;
  };

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">통화 내역</h2>
        <p className="text-sm text-gray-500">
          전체 {history.length}건 중 {startIndex + 1}-{Math.min(endIndex, history.length)}건 표시
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                시간
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                키오스크
              </th>
              {isSuperAdmin && (
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  프로젝트
                </th>
              )}
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                발신자
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                상태
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                통화시간
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                응답자
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {currentRecords.length > 0 ? (
              currentRecords.map((record) => (
                <tr key={record.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatDateTime(record.started_at)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {record.kiosk?.name || '-'}
                    </div>
                    {record.kiosk?.location && (
                      <div className="text-xs text-gray-500">{record.kiosk.location}</div>
                    )}
                  </td>
                  {isSuperAdmin && (
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {record.project?.name || '-'}
                    </td>
                  )}
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getCallerTypeBadge(record.caller_type)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatusBadge(record.status, record.duration_seconds, record.staff_user_id)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatDuration(record.duration_seconds)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {record.answered_by ? (
                      <div>
                        <div className="text-sm text-gray-900">
                          {record.answered_by.full_name || record.answered_by.email}
                        </div>
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">-</span>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={isSuperAdmin ? 7 : 6} className="px-6 py-12 text-center text-gray-500">
                  통화 기록이 없습니다
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
          <div className="text-sm text-gray-700">
            페이지 {currentPage} / {totalPages}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              이전
            </button>
            
            {/* Page numbers */}
            <div className="flex gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => {
                // Show first page, last page, current page, and pages around current
                const showPage =
                  pageNum === 1 ||
                  pageNum === totalPages ||
                  (pageNum >= currentPage - 2 && pageNum <= currentPage + 2);

                const showEllipsis =
                  (pageNum === 2 && currentPage > 4) ||
                  (pageNum === totalPages - 1 && currentPage < totalPages - 3);

                if (showEllipsis) {
                  return (
                    <span key={pageNum} className="px-2 py-1 text-sm text-gray-400">
                      ...
                    </span>
                  );
                }

                if (!showPage) return null;

                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`px-3 py-1 text-sm border rounded ${
                      currentPage === pageNum
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              다음
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
