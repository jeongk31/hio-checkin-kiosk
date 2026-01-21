'use client';

import { useState, useCallback, useRef } from 'react';

interface UploadState {
  isUploading: boolean;
  progress: number; // 0-100
  error: string | null;
  url: string | null;
}

interface UploadProgressHook extends UploadState {
  upload: (file: File, folder?: string) => Promise<string | null>;
  cancel: () => void;
  reset: () => void;
}

export function useUploadProgress(): UploadProgressHook {
  const [state, setState] = useState<UploadState>({
    isUploading: false,
    progress: 0,
    error: null,
    url: null,
  });

  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const upload = useCallback(async (file: File, folder: string = 'general'): Promise<string | null> => {
    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setState(prev => ({ ...prev, error: 'JPG, PNG, WEBP 이미지만 업로드 가능합니다.' }));
      return null;
    }

    setState({
      isUploading: true,
      progress: 0,
      error: null,
      url: null,
    });

    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhrRef.current = xhr;

      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', folder);

      // Progress event
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const percentComplete = Math.round((event.loaded / event.total) * 100);
          setState(prev => ({ ...prev, progress: percentComplete }));
        }
      });

      // Load complete
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            setState({
              isUploading: false,
              progress: 100,
              error: null,
              url: response.url,
            });
            resolve(response.url);
          } catch {
            setState({
              isUploading: false,
              progress: 0,
              error: '응답 파싱 오류',
              url: null,
            });
            resolve(null);
          }
        } else {
          let errorMessage = '업로드 실패';
          try {
            const response = JSON.parse(xhr.responseText);
            errorMessage = response.error || errorMessage;
          } catch {
            // Use default error message
          }
          setState({
            isUploading: false,
            progress: 0,
            error: errorMessage,
            url: null,
          });
          resolve(null);
        }
        xhrRef.current = null;
      });

      // Error event
      xhr.addEventListener('error', () => {
        setState({
          isUploading: false,
          progress: 0,
          error: '네트워크 오류',
          url: null,
        });
        xhrRef.current = null;
        resolve(null);
      });

      // Abort event
      xhr.addEventListener('abort', () => {
        setState({
          isUploading: false,
          progress: 0,
          error: null,
          url: null,
        });
        xhrRef.current = null;
        resolve(null);
      });

      xhr.open('POST', '/api/upload');
      xhr.send(formData);
    });
  }, []);

  const cancel = useCallback(() => {
    if (xhrRef.current) {
      xhrRef.current.abort();
      xhrRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    cancel();
    setState({
      isUploading: false,
      progress: 0,
      error: null,
      url: null,
    });
  }, [cancel]);

  return {
    ...state,
    upload,
    cancel,
    reset,
  };
}
