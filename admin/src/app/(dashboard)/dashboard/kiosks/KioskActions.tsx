'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Kiosk } from '@/types/database';

interface KioskActionsProps {
  kiosk: Kiosk;
}

export default function KioskActions({ kiosk }: KioskActionsProps) {
  const router = useRouter();

  const handleDelete = async () => {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    
    try {
      const response = await fetch(`/api/kiosks/${kiosk.id}`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        router.refresh();
      } else {
        alert('삭제에 실패했습니다.');
      }
    } catch (error) {
      console.error('Error deleting kiosk:', error);
      alert('삭제 중 오류가 발생했습니다.');
    }
  };

  return (
    <div className="flex items-center gap-3">
      <Link
        href={`/dashboard/kiosks/${kiosk.id}`}
        className="text-blue-600 hover:text-blue-800 text-sm"
      >
        상세보기
      </Link>
      <button
        onClick={handleDelete}
        className="text-red-600 hover:text-red-800 text-sm"
      >
        삭제
      </button>
    </div>
  );
}
