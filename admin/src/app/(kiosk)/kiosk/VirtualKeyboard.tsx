'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Keyboard from 'react-simple-keyboard';
import 'react-simple-keyboard/build/css/index.css';

interface VirtualKeyboardProps {
  value: string;
  onChange: (value: string) => void;
  onClose?: () => void;
  layout?: 'default' | 'numeric' | 'korean';
  placeholder?: string;
  label?: string;
  maxLength?: number;
  numericOnly?: boolean;
}

export default function VirtualKeyboard({
  value,
  onChange,
  onClose,
  layout = 'default',
  placeholder = '',
  label = '',
  maxLength,
  numericOnly = false,
}: VirtualKeyboardProps) {
  const [inputValue, setInputValue] = useState(value);
  const [currentLayout, setCurrentLayout] = useState<'default' | 'shift' | 'korean' | 'koreanShift'>('default');
  const [isKorean, setIsKorean] = useState(layout === 'korean');
  const keyboardRef = useRef<typeof Keyboard | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync with external value
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  // Korean keyboard layouts
  const koreanLayout = {
    default: [
      '1 2 3 4 5 6 7 8 9 0 {bksp}',
      'ㅂ ㅈ ㄷ ㄱ ㅅ ㅛ ㅕ ㅑ ㅐ ㅔ',
      'ㅁ ㄴ ㅇ ㄹ ㅎ ㅗ ㅓ ㅏ ㅣ',
      '{shift} ㅋ ㅌ ㅊ ㅍ ㅠ ㅜ ㅡ {shift}',
      '{lang} {space} {enter}',
    ],
    shift: [
      '! @ # $ % ^ & * ( ) {bksp}',
      'ㅃ ㅉ ㄸ ㄲ ㅆ ㅛ ㅕ ㅑ ㅒ ㅖ',
      'ㅁ ㄴ ㅇ ㄹ ㅎ ㅗ ㅓ ㅏ ㅣ',
      '{shift} ㅋ ㅌ ㅊ ㅍ ㅠ ㅜ ㅡ {shift}',
      '{lang} {space} {enter}',
    ],
  };

  const englishLayout = {
    default: [
      '1 2 3 4 5 6 7 8 9 0 {bksp}',
      'q w e r t y u i o p',
      'a s d f g h j k l',
      '{shift} z x c v b n m {shift}',
      '{lang} {space} {enter}',
    ],
    shift: [
      '! @ # $ % ^ & * ( ) {bksp}',
      'Q W E R T Y U I O P',
      'A S D F G H J K L',
      '{shift} Z X C V B N M {shift}',
      '{lang} {space} {enter}',
    ],
  };

  const numericLayout = {
    default: [
      '1 2 3',
      '4 5 6',
      '7 8 9',
      '{bksp} 0 {enter}',
    ],
  };

  const getLayoutObject = () => {
    if (numericOnly) {
      return numericLayout;
    }
    if (isKorean) {
      return koreanLayout;
    }
    return englishLayout;
  };

  const getDisplayLabels = () => ({
    '{bksp}': '⌫',
    '{enter}': '완료',
    '{shift}': '⇧',
    '{space}': ' ',
    '{lang}': isKorean ? 'ENG' : '한글',
  });

  const handleKeyPress = useCallback((button: string) => {
    if (button === '{enter}') {
      onChange(inputValue);
      onClose?.();
      return;
    }

    if (button === '{shift}') {
      if (isKorean) {
        setCurrentLayout(currentLayout === 'korean' ? 'koreanShift' : 'korean');
      } else {
        setCurrentLayout(currentLayout === 'shift' ? 'default' : 'shift');
      }
      return;
    }

    if (button === '{lang}') {
      setIsKorean(!isKorean);
      setCurrentLayout('default');
      return;
    }

    if (button === '{bksp}') {
      const newValue = inputValue.slice(0, -1);
      setInputValue(newValue);
      onChange(newValue);
      return;
    }

    if (button === '{space}') {
      if (!maxLength || inputValue.length < maxLength) {
        const newValue = inputValue + ' ';
        setInputValue(newValue);
        onChange(newValue);
      }
      return;
    }

    // Regular character
    if (!maxLength || inputValue.length < maxLength) {
      // For numeric only, only allow digits
      if (numericOnly && !/^\d$/.test(button)) {
        return;
      }
      const newValue = inputValue + button;
      setInputValue(newValue);
      onChange(newValue);
    }
  }, [inputValue, onChange, onClose, currentLayout, isKorean, maxLength, numericOnly]);

  const handleInputChange = (input: string) => {
    if (maxLength && input.length > maxLength) {
      return;
    }
    if (numericOnly) {
      input = input.replace(/[^0-9]/g, '');
    }
    setInputValue(input);
    onChange(input);
  };

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      background: 'white',
      boxShadow: '0 -4px 20px rgba(0,0,0,0.15)',
      zIndex: 9999,
      padding: '16px',
      borderTopLeftRadius: '20px',
      borderTopRightRadius: '20px',
    }}>
      {/* Header with close button */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '12px',
        paddingBottom: '12px',
        borderBottom: '1px solid #e5e7eb',
      }}>
        {label && (
          <span style={{ fontSize: '14px', color: '#6b7280', fontWeight: 500 }}>
            {label}
          </span>
        )}
        {onClose && (
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              color: '#9ca3af',
              cursor: 'pointer',
              padding: '4px 8px',
              marginLeft: 'auto',
            }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Input preview */}
      <div style={{
        background: '#f3f4f6',
        borderRadius: '12px',
        padding: '12px 16px',
        marginBottom: '12px',
        minHeight: '48px',
        display: 'flex',
        alignItems: 'center',
      }}>
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => handleInputChange(e.target.value)}
          placeholder={placeholder}
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            fontSize: '20px',
            fontWeight: 500,
            outline: 'none',
            color: '#1f2937',
          }}
          autoFocus
        />
        {inputValue && (
          <button
            onClick={() => {
              setInputValue('');
              onChange('');
            }}
            style={{
              background: '#e5e7eb',
              border: 'none',
              borderRadius: '50%',
              width: '24px',
              height: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: '12px',
              color: '#6b7280',
              flexShrink: 0,
            }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Keyboard */}
      <style>{`
        .hg-theme-default {
          background: transparent !important;
          padding: 0 !important;
        }
        .hg-theme-default .hg-button {
          height: 50px !important;
          border-radius: 8px !important;
          font-size: 18px !important;
          background: #f3f4f6 !important;
          border: none !important;
          box-shadow: none !important;
          margin: 2px !important;
        }
        .hg-theme-default .hg-button:active {
          background: #e5e7eb !important;
        }
        .hg-theme-default .hg-button.hg-functionBtn {
          background: #e5e7eb !important;
        }
        .hg-theme-default .hg-button.hg-button-enter {
          background: #3b82f6 !important;
          color: white !important;
        }
        .hg-theme-default .hg-button.hg-button-bksp {
          background: #fecaca !important;
        }
        .hg-theme-default .hg-button.hg-button-space {
          min-width: 200px !important;
        }
        .hg-theme-default .hg-row {
          justify-content: center !important;
        }
      `}</style>
      <Keyboard
        keyboardRef={(r: typeof Keyboard | null) => (keyboardRef.current = r)}
        layout={getLayoutObject()}
        layoutName={currentLayout === 'shift' || currentLayout === 'koreanShift' ? 'shift' : 'default'}
        display={getDisplayLabels()}
        onKeyPress={handleKeyPress}
        theme="hg-theme-default hg-layout-default"
        physicalKeyboardHighlight={false}
        physicalKeyboardHighlightPress={false}
      />
    </div>
  );
}

// Hook to manage keyboard visibility for a specific input
export function useVirtualKeyboard() {
  const [isVisible, setIsVisible] = useState(false);
  const [activeField, setActiveField] = useState<string | null>(null);

  const openKeyboard = useCallback((fieldId: string) => {
    setActiveField(fieldId);
    setIsVisible(true);
  }, []);

  const closeKeyboard = useCallback(() => {
    setIsVisible(false);
    setActiveField(null);
  }, []);

  return {
    isVisible,
    activeField,
    openKeyboard,
    closeKeyboard,
  };
}

// Wrapper component for inputs that shows virtual keyboard on focus
interface KeyboardInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  maxLength?: number;
  numericOnly?: boolean;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  error?: string;
}

export function KeyboardInput({
  value,
  onChange,
  placeholder = '',
  label = '',
  maxLength,
  numericOnly = false,
  disabled = false,
  className = '',
  style,
  error,
}: KeyboardInputProps) {
  const [showKeyboard, setShowKeyboard] = useState(false);

  const handleInputClick = () => {
    if (!disabled) {
      setShowKeyboard(true);
    }
  };

  return (
    <>
      <div 
        onClick={handleInputClick}
        style={{
          position: 'relative',
          cursor: disabled ? 'not-allowed' : 'pointer',
          ...style,
        }}
      >
        <input
          type="text"
          className={className || 'input-field'}
          placeholder={placeholder}
          value={value}
          readOnly
          disabled={disabled}
          style={{
            cursor: disabled ? 'not-allowed' : 'pointer',
            caretColor: 'transparent',
          }}
        />
        {error && (
          <p style={{ color: '#dc2626', marginTop: '8px', fontSize: '14px' }}>
            {error}
          </p>
        )}
      </div>
      
      {showKeyboard && (
        <VirtualKeyboard
          value={value}
          onChange={onChange}
          onClose={() => setShowKeyboard(false)}
          placeholder={placeholder}
          label={label}
          maxLength={maxLength}
          numericOnly={numericOnly}
          layout={numericOnly ? 'numeric' : 'korean'}
        />
      )}
    </>
  );
}
