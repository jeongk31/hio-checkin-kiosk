'use client';

import { useState, useEffect, useRef } from 'react';
import ProjectSelector from '@/components/ProjectSelector';

interface Project {
  id: string;
  name: string;
  slug?: string;
  is_active?: boolean;
  settings?: Record<string, unknown> | null;
  created_at?: string;
}

interface RoomType {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  base_price: number;
  max_guests: number;
  is_active: boolean;
  image_url: string | null;
}

interface Room {
  id: string;
  project_id: string;
  room_type_id: string | null;
  room_number: string;
  access_type: 'password' | 'card';
  room_password: string | null;
  key_box_number: string | null;
  key_box_password: string | null;
  status: string;
  floor: number | null;
  notes: string | null;
  is_active: boolean;
  room_type?: RoomType;
}

interface VerifiedGuest {
  name: string;
  verified_at: string;
  verification_id: string;
}

interface Reservation {
  id: string;
  project_id: string;
  room_type_id: string | null;
  reservation_number: string;
  guest_name: string | null;
  guest_phone: string | null;
  guest_email: string | null;
  guest_count: number;
  check_in_date: string;
  check_out_date: string;
  room_number: string | null;
  status: string;
  source: string | null;
  notes: string | null;
  total_price: number | null;
  room_type?: RoomType;
  created_at?: string;
  verified_guests?: VerifiedGuest[];
}

interface RoomManagerProps {
  projects: Project[] | null;
  defaultProjectId: string | null;
  initialRoomTypes: RoomType[];
  initialReservations: Reservation[];
  initialRooms: Room[];
  isSuperAdmin: boolean;
  initialProject?: Project | null;
}

type Tab = 'today' | 'roomTypes' | 'history';

export default function RoomManager({
  projects,
  defaultProjectId,
  initialRoomTypes,
  initialReservations,
  initialRooms,
  isSuperAdmin,
  initialProject,
}: RoomManagerProps) {
  const [activeTab, setActiveTab] = useState<Tab>('today');
  // For super admin, start with the first project selected (not 'all') to match initial data
  const [selectedProjectId, setSelectedProjectId] = useState(defaultProjectId || '');
  const [roomTypes, setRoomTypes] = useState<RoomType[]>(initialRoomTypes);
  const [reservations, setReservations] = useState<Reservation[]>(initialReservations);
  const [rooms, setRooms] = useState<Room[]>(initialRooms);
  const [historyReservations, setHistoryReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(false);
  const [resetTime, setResetTime] = useState(
    (initialProject?.settings?.daily_reset_time as string) || '11:00'
  );
  const [savingResetTime, setSavingResetTime] = useState(false);

  // Room form state
  const [showRoomForm, setShowRoomForm] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [editingReservation, setEditingReservation] = useState<Reservation | null>(null);
  const [roomForm, setRoomForm] = useState({
    roomNumber: '',
    roomTypeId: '',
    accessType: 'card' as 'password' | 'card',
    roomPassword: '',
    keyBoxNumber: '',
    keyBoxPassword: '',
    floor: '',
    notes: '',
    // Reservation fields for pre-booked rooms
    hasReservation: false,
    reservationNumber: '',
    guestName: '',
    guestCount: '1',
  });

  // Room type form state
  const [showRoomTypeForm, setShowRoomTypeForm] = useState(false);
  const [editingRoomType, setEditingRoomType] = useState<RoomType | null>(null);
  const [roomTypeForm, setRoomTypeForm] = useState({
    name: '',
    maxGuests: '2',
    basePrice: '',
    description: '',
    imageUrl: '',
  });
  const [uploadingImage, setUploadingImage] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  // Helper to format number with commas
  const formatNumberWithCommas = (value: string): string => {
    const numericValue = value.replace(/[^\d]/g, '');
    if (!numericValue) return '';
    return Number(numericValue).toLocaleString('ko-KR');
  };

  // Helper to parse formatted number back to numeric string
  const parseFormattedNumber = (value: string): number => {
    return parseFloat(value.replace(/,/g, '')) || 0;
  };

  // Get today's reservations mapped by room number
  const todayReservations = reservations.filter(
    (r) => r.check_in_date === today && r.status !== 'cancelled'
  );
  const reservationsByRoom: Record<string, Reservation> = {};
  todayReservations.forEach((r) => {
    if (r.room_number) {
      reservationsByRoom[r.room_number] = r;
    }
  });

  // Fetch history when tab changes
  useEffect(() => {
    if (activeTab === 'history' && historyReservations.length === 0) {
      fetchHistory();
    }
  }, [activeTab]);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/reservations?projectId=${selectedProjectId}&beforeDate=${today}&limit=200`
      );
      const data = await res.json();
      setHistoryReservations(data.reservations || []);
    } catch (error) {
      console.error('Error fetching history:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleProjectChange = async (projectId: string) => {
    setSelectedProjectId(projectId);
    setHistoryReservations([]);

    // When "all" is selected, restore initial data (all projects)
    if (projectId === 'all') {
      setRoomTypes(initialRoomTypes);
      setReservations(initialReservations);
      setRooms(initialRooms);
      setResetTime((initialProject?.settings?.daily_reset_time as string) || '11:00');
      return;
    }

    setLoading(true);

    try {
      const [roomTypesRes, reservationsRes, roomsRes, projectRes] = await Promise.all([
        fetch(`/api/room-types?projectId=${projectId}`),
        fetch(`/api/reservations?projectId=${projectId}&checkInDate=${today}`),
        fetch(`/api/rooms?projectId=${projectId}`),
        fetch(`/api/projects/${projectId}`),
      ]);

      const roomTypesData = await roomTypesRes.json();
      const reservationsData = await reservationsRes.json();
      const roomsData = await roomsRes.json();
      const projectData = await projectRes.json();

      setRoomTypes(roomTypesData.roomTypes || []);
      setReservations(reservationsData.reservations || []);
      setRooms(roomsData.rooms || []);
      setResetTime(projectData.project?.settings?.daily_reset_time || '11:00');
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveResetTime = async () => {
    if (selectedProjectId === 'all') {
      alert('특정 프로젝트를 선택해주세요.');
      return;
    }
    setSavingResetTime(true);
    try {
      const res = await fetch('/api/projects/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProjectId,
          settings: { daily_reset_time: resetTime },
        }),
      });
      if (res.ok) {
        alert('리셋 시간이 저장되었습니다.');
      }
    } catch (error) {
      console.error('Error saving reset time:', error);
    } finally {
      setSavingResetTime(false);
    }
  };

  // Manual reset function
  const handleManualReset = async () => {
    if (!confirm('⚠️ 모든 객실이 삭제되고, 체크인된 예약이 체크아웃 처리됩니다. 계속하시겠습니까?')) return;

    setLoading(true);
    try {
      const res = await fetch('/api/rooms/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: selectedProjectId }),
      });

      if (res.ok) {
        const data = await res.json();
        alert(data.message);

        // Refresh the rooms and reservations data
        const [roomsRes, reservationsRes] = await Promise.all([
          fetch(`/api/rooms?projectId=${selectedProjectId}`),
          fetch(`/api/reservations?projectId=${selectedProjectId}&checkInDate=${today}`),
        ]);

        const roomsData = await roomsRes.json();
        const reservationsData = await reservationsRes.json();

        setRooms(roomsData.rooms || []);
        setReservations(reservationsData.reservations || []);
      } else {
        const data = await res.json();
        alert(data.error || '리셋 실패');
      }
    } catch (error) {
      console.error('Error resetting rooms:', error);
      alert('리셋 중 오류가 발생했습니다');
    } finally {
      setLoading(false);
    }
  };

  // Room CRUD
  const handleSaveRoom = async () => {
    setLoading(true);
    try {
      const method = editingRoom ? 'PUT' : 'POST';

      // Determine room status based on reservation
      let roomStatus = editingRoom?.status || 'available';
      if (roomForm.hasReservation && roomForm.reservationNumber) {
        roomStatus = 'reserved';
      }

      const body = editingRoom
        ? {
            id: editingRoom.id,
            projectId: selectedProjectId,
            roomNumber: roomForm.roomNumber,
            roomTypeId: roomForm.roomTypeId,
            accessType: roomForm.accessType,
            roomPassword: roomForm.roomPassword,
            keyBoxNumber: roomForm.keyBoxNumber,
            keyBoxPassword: roomForm.keyBoxPassword,
            floor: roomForm.floor ? parseInt(roomForm.floor) : null,
            notes: roomForm.notes,
            status: roomStatus,
          }
        : {
            projectId: selectedProjectId,
            roomNumber: roomForm.roomNumber,
            roomTypeId: roomForm.roomTypeId,
            accessType: roomForm.accessType,
            roomPassword: roomForm.roomPassword,
            keyBoxNumber: roomForm.keyBoxNumber,
            keyBoxPassword: roomForm.keyBoxPassword,
            floor: roomForm.floor ? parseInt(roomForm.floor) : null,
            notes: roomForm.notes,
            status: roomStatus,
          };

      if (!body.projectId || body.projectId === 'all') {
        alert('특정 프로젝트를 선택해주세요.');
        return;
      }

      const res = await fetch('/api/rooms', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = await res.json();
        if (editingRoom) {
          setRooms(rooms.map((r) => (r.id === data.room.id ? data.room : r)));
        } else {
          setRooms([...rooms, data.room]);
        }

        // Create or update reservation if hasReservation is checked
        if (roomForm.hasReservation && roomForm.reservationNumber) {
          // Use editingReservation if available, otherwise search for existing pending reservation
          const existingReservation = editingReservation || reservations.find(
            (r) => r.room_number === roomForm.roomNumber &&
              (r.status === 'pending' || r.status === 'checked_in')
          );

          const reservationBody = {
            projectId: selectedProjectId,
            reservationNumber: roomForm.reservationNumber,
            guestName: roomForm.guestName,
            guestCount: parseInt(roomForm.guestCount) || 1,
            checkInDate: today,
            checkOutDate: today,
            roomNumber: roomForm.roomNumber,
            roomTypeId: roomForm.roomTypeId || null,
            // Keep existing status if updating, otherwise set to pending
            status: existingReservation?.status || 'pending',
            source: existingReservation?.source || 'admin_manual',
            ...(existingReservation ? { id: existingReservation.id } : {}),
          };

          const reservationRes = await fetch('/api/reservations', {
            method: existingReservation ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(reservationBody),
          });

          if (reservationRes.ok) {
            const reservationData = await reservationRes.json();
            if (existingReservation) {
              setReservations(reservations.map((r) =>
                r.id === reservationData.reservation.id ? reservationData.reservation : r
              ));
            } else {
              setReservations([...reservations, reservationData.reservation]);
            }
          }
        }

        setShowRoomForm(false);
        setEditingRoom(null);
        resetRoomForm();
      } else {
        const data = await res.json();
        alert(data.error || '오류가 발생했습니다');
      }
    } catch (error) {
      console.error('Error saving room:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRoom = async (id: string) => {
    if (!confirm('이 객실을 삭제하시겠습니까?')) return;

    setLoading(true);
    try {
      const res = await fetch('/api/rooms', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, projectId: selectedProjectId }),
      });

      if (res.ok) {
        setRooms(rooms.filter((r) => r.id !== id));
      }
    } catch (error) {
      console.error('Error deleting room:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEditRoom = (room: Room) => {
    setEditingRoom(room);
    // Find if there's an existing reservation for this room (pending, confirmed, reserved, or checked_in)
    const existingReservation = reservations.find(
      (r) => r.room_number === room.room_number &&
        (r.status === 'pending' || r.status === 'confirmed' || r.status === 'reserved' || r.status === 'checked_in')
    );
    setEditingReservation(existingReservation || null);

    // Show reservation info if room is reserved or occupied with a reservation
    const hasExistingReservation = (room.status === 'reserved' || room.status === 'occupied') && !!existingReservation;

    setRoomForm({
      roomNumber: room.room_number,
      roomTypeId: room.room_type_id || '',
      accessType: room.access_type,
      roomPassword: room.room_password || '',
      keyBoxNumber: room.key_box_number || '',
      keyBoxPassword: room.key_box_password || '',
      floor: room.floor?.toString() || '',
      notes: room.notes || '',
      hasReservation: hasExistingReservation,
      reservationNumber: existingReservation?.reservation_number || '',
      guestName: existingReservation?.guest_name || '',
      guestCount: existingReservation?.guest_count?.toString() || '1',
    });
    setShowRoomForm(true);
  };

  const resetRoomForm = () => {
    setRoomForm({
      roomNumber: '',
      roomTypeId: '',
      accessType: 'card',
      roomPassword: '',
      keyBoxNumber: '',
      keyBoxPassword: '',
      floor: '',
      notes: '',
      hasReservation: false,
      reservationNumber: '',
      guestName: '',
      guestCount: '1',
    });
    setEditingReservation(null);
  };

  // Room Type CRUD
  const handleSaveRoomType = async () => {
    setLoading(true);
    try {
      const method = editingRoomType ? 'PUT' : 'POST';
      const body = editingRoomType
        ? {
            id: editingRoomType.id,
            projectId: selectedProjectId,
            name: roomTypeForm.name,
            maxGuests: parseInt(roomTypeForm.maxGuests) || 2,
            basePrice: parseFormattedNumber(roomTypeForm.basePrice),
            description: roomTypeForm.description || null,
            imageUrl: roomTypeForm.imageUrl || null,
          }
        : {
            projectId: selectedProjectId,
            name: roomTypeForm.name,
            maxGuests: parseInt(roomTypeForm.maxGuests) || 2,
            basePrice: parseFormattedNumber(roomTypeForm.basePrice),
            description: roomTypeForm.description || null,
            imageUrl: roomTypeForm.imageUrl || null,
          };

      const res = await fetch('/api/room-types', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = await res.json();
        if (editingRoomType) {
          setRoomTypes(roomTypes.map((rt) => (rt.id === data.roomType.id ? data.roomType : rt)));
        } else {
          setRoomTypes([...roomTypes, data.roomType]);
        }
        setShowRoomTypeForm(false);
        setEditingRoomType(null);
        resetRoomTypeForm();
      } else {
        const data = await res.json();
        alert(data.error || '오류가 발생했습니다');
      }
    } catch (error) {
      console.error('Error saving room type:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRoomType = async (id: string) => {
    if (!confirm('이 객실 타입을 삭제하시겠습니까? 해당 타입을 사용하는 객실이 있으면 삭제할 수 없습니다.')) return;

    setLoading(true);
    try {
      const res = await fetch('/api/room-types', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, projectId: selectedProjectId }),
      });

      if (res.ok) {
        setRoomTypes(roomTypes.filter((rt) => rt.id !== id));
      } else {
        const data = await res.json();
        alert(data.error || '삭제할 수 없습니다');
      }
    } catch (error) {
      console.error('Error deleting room type:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEditRoomType = (roomType: RoomType) => {
    setEditingRoomType(roomType);
    setRoomTypeForm({
      name: roomType.name,
      maxGuests: roomType.max_guests.toString(),
      basePrice: roomType.base_price ? roomType.base_price.toLocaleString('ko-KR') : '',
      description: roomType.description || '',
      imageUrl: roomType.image_url || '',
    });
    setShowRoomTypeForm(true);
  };

  const resetRoomTypeForm = () => {
    setRoomTypeForm({
      name: '',
      maxGuests: '2',
      basePrice: '',
      description: '',
      imageUrl: '',
    });
  };

  const imageInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      alert('JPG, PNG, WEBP 이미지만 업로드 가능합니다.');
      return;
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('이미지 크기는 5MB 이하여야 합니다.');
      return;
    }

    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', `room-images/${selectedProjectId}`);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }

      const { url: publicUrl } = await response.json();

      setRoomTypeForm({ ...roomTypeForm, imageUrl: publicUrl });
    } catch (error) {
      console.error('Error uploading image:', error);
      alert('이미지 업로드에 실패했습니다.');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleRemoveImage = () => {
    setRoomTypeForm({ ...roomTypeForm, imageUrl: '' });
    if (imageInputRef.current) {
      imageInputRef.current.value = '';
    }
  };

  const roomStatusLabels: Record<string, { label: string; class: string }> = {
    available: { label: '사용가능', class: 'bg-green-100 text-green-800' },
    reserved: { label: '예약됨', class: 'bg-purple-100 text-purple-800' },
    occupied: { label: '사용중', class: 'bg-red-100 text-red-800' },
    maintenance: { label: '정비중', class: 'bg-yellow-100 text-yellow-800' },
    cleaning: { label: '청소중', class: 'bg-blue-100 text-blue-800' },
  };

  const reservationStatusLabels: Record<string, { label: string; class: string }> = {
    pending: { label: '대기', class: 'bg-yellow-100 text-yellow-800' },
    checked_in: { label: '체크인', class: 'bg-green-100 text-green-800' },
    checked_out: { label: '체크아웃', class: 'bg-gray-100 text-gray-800' },
    cancelled: { label: '취소', class: 'bg-red-100 text-red-800' },
    no_show: { label: '노쇼', class: 'bg-purple-100 text-purple-800' },
  };

  return (
    <div className="space-y-6">
      {/* Reset Time Setting */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4 flex-wrap">
            <label className="text-sm font-medium text-gray-700">
              일일 리셋 시간
            </label>
            <input
              type="time"
              value={resetTime}
              onChange={(e) => setResetTime(e.target.value)}
              className="px-3 py-2 border rounded-lg text-gray-900"
            />
            <button
              onClick={handleSaveResetTime}
              disabled={savingResetTime}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
            >
              {savingResetTime ? '저장 중...' : '저장'}
            </button>
            <span className="text-sm text-gray-500">
              매일 이 시간에 모든 객실이 삭제됩니다
            </span>
          </div>
          <button
            onClick={handleManualReset}
            disabled={loading}
            className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:bg-gray-400"
          >
            지금 리셋
          </button>
        </div>
      </div>

      {/* Project Selector for super admin */}
      {isSuperAdmin && projects && (
        <ProjectSelector
          projects={projects}
          selectedProjectId={selectedProjectId}
          onProjectChange={handleProjectChange}
          showAllOption={true}
        />
      )}

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px">
            <button
              onClick={() => setActiveTab('today')}
              className={`px-6 py-3 border-b-2 font-medium text-sm ${
                activeTab === 'today'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              당일 객실
            </button>
            <button
              onClick={() => setActiveTab('roomTypes')}
              className={`px-6 py-3 border-b-2 font-medium text-sm ${
                activeTab === 'roomTypes'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              객실 타입
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-6 py-3 border-b-2 font-medium text-sm ${
                activeTab === 'history'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              히스토리
            </button>
          </nav>
        </div>

        <div className="p-6 relative">
          {loading && (
            <div className="absolute inset-0 bg-white bg-opacity-50 flex items-center justify-center z-10">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          )}

          {/* Today's Rooms Tab */}
          {activeTab === 'today' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-semibold text-gray-900">
                  오늘의 객실 현황 ({today})
                </h2>
                <button
                  onClick={() => {
                    setEditingRoom(null);
                    resetRoomForm();
                    setShowRoomForm(true);
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  + 객실 추가
                </button>
              </div>

              {/* Rooms List with Reservations */}
              <div className="space-y-3">
                {rooms.map((room) => {
                  const reservation = reservationsByRoom[room.room_number];
                  const status = roomStatusLabels[room.status] || roomStatusLabels.available;

                  return (
                    <div
                      key={room.id}
                      className="bg-white border rounded-lg p-4 flex items-start justify-between"
                    >
                      {/* Room Info */}
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <span className="text-lg font-bold text-gray-900">
                            {room.room_number}호
                          </span>
                          {room.room_type && (
                            <span className="text-sm text-gray-500">{room.room_type.name}</span>
                          )}
                          {room.floor && (
                            <span className="text-xs text-gray-400">{room.floor}층</span>
                          )}
                          <span className={`px-2 py-1 text-xs rounded-full ${status.class}`}>
                            {status.label}
                          </span>
                        </div>
                        <div className="text-sm text-gray-500 mt-1">
                          {room.access_type === 'password' ? (
                            <span>비밀번호: {room.room_password}</span>
                          ) : (
                            <span>
                              키박스 {room.key_box_number}번 / {room.key_box_password}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Reservation Info */}
                      <div className="flex-1 border-l pl-4 ml-4">
                        {reservation ? (
                          <div>
                            <div className="flex items-center gap-2">
                              <span
                                className={`px-2 py-1 text-xs rounded-full ${
                                  reservationStatusLabels[reservation.status]?.class ||
                                  'bg-gray-100 text-gray-800'
                                }`}
                              >
                                {reservationStatusLabels[reservation.status]?.label || reservation.status}
                              </span>
                              <span className="font-medium text-gray-900">
                                {reservation.guest_name || '(이름 없음)'}
                              </span>
                            </div>
                            <div className="text-sm text-gray-500 mt-1">
                              {reservation.guest_phone && <span>{reservation.guest_phone}</span>}
                              {reservation.guest_count > 1 && (
                                <span className="ml-2">{reservation.guest_count}명</span>
                              )}
                              {reservation.source && (
                                <span className="ml-2 text-gray-400">({reservation.source})</span>
                              )}
                            </div>
                            <div className="text-xs text-gray-400 mt-1">
                              예약번호: {reservation.reservation_number}
                            </div>
                            {/* Verified guests from OCR */}
                            {reservation.verified_guests && reservation.verified_guests.length > 0 && (
                              <div className="mt-2 p-2 bg-green-50 rounded text-sm">
                                <div className="flex items-center gap-1 text-green-700 font-medium">
                                  <span>✓ 본인인증 완료</span>
                                  <span className="text-green-600">({reservation.verified_guests.length}명)</span>
                                </div>
                                <div className="text-green-600 text-xs mt-1">
                                  {reservation.verified_guests.map((g, i) => (
                                    <span key={g.verification_id || i}>
                                      {g.name}
                                      {i < reservation.verified_guests!.length - 1 && ', '}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">예약 없음</span>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 ml-4">
                        <button
                          onClick={() => handleEditRoom(room)}
                          className="text-blue-600 hover:text-blue-900 text-sm"
                        >
                          수정
                        </button>
                        <button
                          onClick={() => handleDeleteRoom(room.id)}
                          className="text-red-600 hover:text-red-900 text-sm"
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  );
                })}

                {rooms.length === 0 && (
                  <div className="text-center py-12 text-gray-500">
                    등록된 객실이 없습니다. 객실을 추가해주세요.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Room Types Tab */}
          {activeTab === 'roomTypes' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-semibold text-gray-900">객실 타입 관리</h2>
                <button
                  onClick={() => {
                    setEditingRoomType(null);
                    resetRoomTypeForm();
                    setShowRoomTypeForm(true);
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  + 객실 타입 추가
                </button>
              </div>

              {/* Room Types List */}
              <div className="space-y-3">
                {roomTypes.map((roomType) => {
                  const roomCount = rooms.filter((r) => r.room_type_id === roomType.id).length;
                  return (
                    <div
                      key={roomType.id}
                      className="bg-white border rounded-lg p-4 flex items-center justify-between"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <span className="text-lg font-bold text-gray-900">{roomType.name}</span>
                          <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">
                            최대 {roomType.max_guests}명
                          </span>
                          {roomType.base_price > 0 && (
                            <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">
                              {Math.round(roomType.base_price).toLocaleString('ko-KR')}원
                            </span>
                          )}
                          <span className="text-sm text-gray-500">
                            {roomCount}개 객실
                          </span>
                        </div>
                        {roomType.description && (
                          <div className="text-sm text-gray-500 mt-1">{roomType.description}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleEditRoomType(roomType)}
                          className="text-blue-600 hover:text-blue-900 text-sm"
                        >
                          수정
                        </button>
                        <button
                          onClick={() => handleDeleteRoomType(roomType.id)}
                          className="text-red-600 hover:text-red-900 text-sm"
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  );
                })}

                {roomTypes.length === 0 && (
                  <div className="text-center py-12 text-gray-500">
                    등록된 객실 타입이 없습니다. 객실 타입을 추가해주세요.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* History Tab */}
          {activeTab === 'history' && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-gray-900">예약 히스토리</h2>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        예약번호
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        투숙객
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        본인인증
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        객실
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        체크인
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        체크아웃
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        상태
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        출처
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {historyReservations.map((reservation) => {
                      const status =
                        reservationStatusLabels[reservation.status] || reservationStatusLabels.pending;
                      return (
                        <tr key={reservation.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">
                            {reservation.reservation_number}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-gray-900">{reservation.guest_name || '-'}</div>
                            {reservation.guest_phone && (
                              <div className="text-xs text-gray-500">{reservation.guest_phone}</div>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            {reservation.verified_guests && reservation.verified_guests.length > 0 ? (
                              <div>
                                <div className="text-green-700 font-medium text-sm">
                                  ✓ {reservation.verified_guests.length}명
                                </div>
                                <div className="text-xs text-green-600 max-w-[150px]">
                                  {reservation.verified_guests.map((g) => g.name).join(', ')}
                                </div>
                              </div>
                            ) : (
                              <span className="text-gray-400 text-sm">-</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-gray-900">{reservation.room_number || '-'}</div>
                            {reservation.room_type && (
                              <div className="text-xs text-gray-500">{reservation.room_type.name}</div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-gray-900">
                            {reservation.check_in_date}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-gray-500">
                            {reservation.check_out_date}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 py-1 text-xs rounded-full ${status.class}`}>
                              {status.label}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-gray-500">
                            {reservation.source || '-'}
                          </td>
                        </tr>
                      );
                    })}
                    {historyReservations.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                          이전 예약 기록이 없습니다
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Room Type Form Modal */}
      {showRoomTypeForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {editingRoomType ? '객실 타입 수정' : '새 객실 타입 추가'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  타입 이름 *
                </label>
                <input
                  type="text"
                  value={roomTypeForm.name}
                  onChange={(e) => setRoomTypeForm({ ...roomTypeForm, name: e.target.value })}
                  placeholder="예: 스탠다드, 디럭스, 스위트"
                  className="w-full px-3 py-2 border rounded-lg text-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  최대 인원 *
                </label>
                <input
                  type="number"
                  min="1"
                  value={roomTypeForm.maxGuests}
                  onChange={(e) => setRoomTypeForm({ ...roomTypeForm, maxGuests: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  기본 가격 (원)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={roomTypeForm.basePrice}
                  onChange={(e) => setRoomTypeForm({ ...roomTypeForm, basePrice: formatNumberWithCommas(e.target.value) })}
                  placeholder="예: 100,000"
                  className="w-full px-3 py-2 border rounded-lg text-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  설명
                </label>
                <input
                  type="text"
                  value={roomTypeForm.description}
                  onChange={(e) => setRoomTypeForm({ ...roomTypeForm, description: e.target.value })}
                  placeholder="예: 퀸베드 1개, 도시 전망"
                  className="w-full px-3 py-2 border rounded-lg text-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  객실 이미지
                </label>
                {roomTypeForm.imageUrl ? (
                  <div className="relative">
                    <img
                      src={roomTypeForm.imageUrl}
                      alt="Room type"
                      className="w-full h-40 object-cover rounded-lg border"
                    />
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center hover:bg-red-600"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                    <input
                      ref={imageInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleImageUpload}
                      className="hidden"
                      id="room-type-image"
                    />
                    <label
                      htmlFor="room-type-image"
                      className="cursor-pointer text-blue-600 hover:text-blue-700"
                    >
                      {uploadingImage ? (
                        <span className="text-gray-500">업로드 중...</span>
                      ) : (
                        <>
                          <span className="block text-2xl mb-1">📷</span>
                          <span>클릭하여 이미지 업로드</span>
                          <span className="block text-xs text-gray-500 mt-1">
                            JPG, PNG, WEBP (최대 5MB)
                          </span>
                        </>
                      )}
                    </label>
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowRoomTypeForm(false);
                  setEditingRoomType(null);
                  resetRoomTypeForm();
                }}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                취소
              </button>
              <button
                onClick={handleSaveRoomType}
                disabled={!roomTypeForm.name || !roomTypeForm.maxGuests}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Room Form Modal */}
      {showRoomForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {editingRoom ? '객실 수정' : '새 객실 추가'}
            </h3>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    호수 (객실 번호) *
                  </label>
                  <input
                    type="text"
                    value={roomForm.roomNumber}
                    onChange={(e) => setRoomForm({ ...roomForm, roomNumber: e.target.value })}
                    placeholder="예: 301"
                    className="w-full px-3 py-2 border rounded-lg text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    객실 유형
                  </label>
                  <select
                    value={roomForm.roomTypeId}
                    onChange={(e) => setRoomForm({ ...roomForm, roomTypeId: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-gray-900"
                  >
                    <option value="">선택</option>
                    {roomTypes.map((rt) => (
                      <option key={rt.id} value={rt.id}>
                        {rt.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    층
                  </label>
                  <input
                    type="number"
                    value={roomForm.floor}
                    onChange={(e) => setRoomForm({ ...roomForm, floor: e.target.value })}
                    placeholder="예: 3"
                    className="w-full px-3 py-2 border rounded-lg text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    출입 방식 *
                  </label>
                  <select
                    value={roomForm.accessType}
                    onChange={(e) =>
                      setRoomForm({ ...roomForm, accessType: e.target.value as 'password' | 'card' })
                    }
                    className="w-full px-3 py-2 border rounded-lg text-gray-900"
                  >
                    <option value="card">카드 (키 박스)</option>
                    <option value="password">비밀번호</option>
                  </select>
                </div>
                {roomForm.accessType === 'password' ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      객실 비밀번호 *
                    </label>
                    <input
                      type="text"
                      value={roomForm.roomPassword}
                      onChange={(e) => setRoomForm({ ...roomForm, roomPassword: e.target.value })}
                      placeholder="예: 1234"
                      className="w-full px-3 py-2 border rounded-lg text-gray-900"
                    />
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        키 박스 번호 *
                      </label>
                      <input
                        type="text"
                        value={roomForm.keyBoxNumber}
                        onChange={(e) => setRoomForm({ ...roomForm, keyBoxNumber: e.target.value })}
                        placeholder="예: 123"
                        className="w-full px-3 py-2 border rounded-lg text-gray-900"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        키 박스 비밀번호 *
                      </label>
                      <input
                        type="text"
                        value={roomForm.keyBoxPassword}
                        onChange={(e) => setRoomForm({ ...roomForm, keyBoxPassword: e.target.value })}
                        placeholder="예: 5678"
                        className="w-full px-3 py-2 border rounded-lg text-gray-900"
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Reservation Section */}
              <div className="pt-4 border-t">
                {/* Show status badge if editing existing reservation */}
                {editingReservation && (
                  <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-700">현재 예약 상태:</span>
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          reservationStatusLabels[editingReservation.status]?.class || 'bg-gray-100 text-gray-800'
                        }`}>
                          {reservationStatusLabels[editingReservation.status]?.label || editingReservation.status}
                        </span>
                      </div>
                      {editingReservation.source && (
                        <span className="text-xs text-gray-500">출처: {editingReservation.source}</span>
                      )}
                    </div>
                    {/* Show verified guests */}
                    {editingReservation.verified_guests && editingReservation.verified_guests.length > 0 && (
                      <div className="mt-2 p-2 bg-green-50 rounded">
                        <div className="flex items-center gap-1 text-green-700 font-medium text-sm">
                          <span>✓ 본인인증 완료</span>
                          <span className="text-green-600">({editingReservation.verified_guests.length}명)</span>
                        </div>
                        <div className="text-green-600 text-xs mt-1">
                          {editingReservation.verified_guests.map((g, i) => (
                            <span key={g.verification_id || i}>
                              {g.name} ({new Date(g.verified_at).toLocaleString('ko-KR')})
                              {i < editingReservation.verified_guests!.length - 1 && ', '}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={roomForm.hasReservation}
                    onChange={(e) => setRoomForm({ ...roomForm, hasReservation: e.target.checked })}
                    className="w-4 h-4 text-blue-600 rounded"
                    disabled={editingReservation?.status === 'checked_in'}
                  />
                  <span className="text-sm font-medium text-gray-700">
                    {editingReservation
                      ? '예약 정보 수정'
                      : '예약 정보 추가 (객실 상태가 \'예약됨\'으로 변경됩니다)'}
                  </span>
                </label>

                {roomForm.hasReservation && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        예약번호 *
                      </label>
                      <input
                        type="text"
                        value={roomForm.reservationNumber}
                        onChange={(e) => setRoomForm({ ...roomForm, reservationNumber: e.target.value })}
                        placeholder="예: RES-12345"
                        className="w-full px-3 py-2 border rounded-lg text-gray-900"
                        readOnly={editingReservation?.status === 'checked_in'}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        투숙객 이름 *
                      </label>
                      <input
                        type="text"
                        value={roomForm.guestName}
                        onChange={(e) => setRoomForm({ ...roomForm, guestName: e.target.value })}
                        placeholder="홍길동"
                        className="w-full px-3 py-2 border rounded-lg text-gray-900"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        인원 수 *
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={roomForm.guestCount}
                        onChange={(e) => setRoomForm({ ...roomForm, guestCount: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg text-gray-900"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowRoomForm(false);
                  setEditingRoom(null);
                  resetRoomForm();
                }}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                취소
              </button>
              <button
                onClick={handleSaveRoom}
                disabled={
                  !roomForm.roomNumber ||
                  (roomForm.accessType === 'password' && !roomForm.roomPassword) ||
                  (roomForm.accessType === 'card' && (!roomForm.keyBoxNumber || !roomForm.keyBoxPassword)) ||
                  (roomForm.hasReservation && (!roomForm.reservationNumber || !roomForm.guestName || !roomForm.guestCount))
                }
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
