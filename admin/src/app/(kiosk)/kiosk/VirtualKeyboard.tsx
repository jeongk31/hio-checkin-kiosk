'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Keyboard from 'react-simple-keyboard';
import 'react-simple-keyboard/build/css/index.css';

// Korean IME - Hangul composition
const CHOSUNG = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const JUNGSUNG = ['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅘ', 'ㅙ', 'ㅚ', 'ㅛ', 'ㅜ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅠ', 'ㅡ', 'ㅢ', 'ㅣ'];
const JONGSUNG = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

// Double consonant and vowel combinations
const JONGSUNG_COMBINATIONS: { [key: string]: string } = {
  'ㄱㅅ': 'ㄳ', 'ㄴㅈ': 'ㄵ', 'ㄴㅎ': 'ㄶ', 'ㄹㄱ': 'ㄺ', 'ㄹㅁ': 'ㄻ',
  'ㄹㅂ': 'ㄼ', 'ㄹㅅ': 'ㄽ', 'ㄹㅌ': 'ㄾ', 'ㄹㅍ': 'ㄿ', 'ㄹㅎ': 'ㅀ', 'ㅂㅅ': 'ㅄ',
};

const JUNGSUNG_COMBINATIONS: { [key: string]: string } = {
  'ㅗㅏ': 'ㅘ', 'ㅗㅐ': 'ㅙ', 'ㅗㅣ': 'ㅚ', 'ㅜㅓ': 'ㅝ', 'ㅜㅔ': 'ㅞ', 'ㅜㅣ': 'ㅟ', 'ㅡㅣ': 'ㅢ',
};

function isChosung(char: string): boolean {
  return CHOSUNG.includes(char);
}

function isJungsung(char: string): boolean {
  return JUNGSUNG.includes(char);
}

function isJongsung(char: string): boolean {
  return JONGSUNG.includes(char) && char !== '';
}

function isHangul(char: string): boolean {
  const code = char.charCodeAt(0);
  return code >= 0xAC00 && code <= 0xD7A3;
}

function composeHangul(cho: string, jung: string, jong: string = ''): string {
  const choIndex = CHOSUNG.indexOf(cho);
  const jungIndex = JUNGSUNG.indexOf(jung);
  const jongIndex = JONGSUNG.indexOf(jong);
  
  if (choIndex === -1 || jungIndex === -1 || jongIndex === -1) {
    return cho + jung + jong;
  }
  
  const code = 0xAC00 + (choIndex * 21 * 28) + (jungIndex * 28) + jongIndex;
  return String.fromCharCode(code);
}

function decomposeHangul(char: string): { cho: string; jung: string; jong: string } | null {
  if (!isHangul(char)) return null;
  
  const code = char.charCodeAt(0) - 0xAC00;
  const choIndex = Math.floor(code / (21 * 28));
  const jungIndex = Math.floor((code % (21 * 28)) / 28);
  const jongIndex = code % 28;
  
  return {
    cho: CHOSUNG[choIndex],
    jung: JUNGSUNG[jungIndex],
    jong: JONGSUNG[jongIndex],
  };
}

function composeKorean(currentText: string, newChar: string): string {
  if (!currentText) {
    return newChar;
  }

  const lastChar = currentText[currentText.length - 1];
  const prefix = currentText.slice(0, -1);

  // If last character is a complete Hangul syllable
  if (isHangul(lastChar)) {
    const decomposed = decomposeHangul(lastChar);
    if (!decomposed) return currentText + newChar;

    // Try to add Jongsung
    if (isChosung(newChar) || isJongsung(newChar)) {
      if (decomposed.jong === '') {
        // Add as Jongsung
        const newSyllable = composeHangul(decomposed.cho, decomposed.jung, newChar);
        return prefix + newSyllable;
      } else {
        // Check if we can combine with existing Jongsung
        const combined = JONGSUNG_COMBINATIONS[decomposed.jong + newChar];
        if (combined && JONGSUNG.includes(combined)) {
          const newSyllable = composeHangul(decomposed.cho, decomposed.jung, combined);
          return prefix + newSyllable;
        }
        // Start new syllable
        return currentText + newChar;
      }
    }
    
    // Try to add Jungsung (if no Jongsung exists)
    if (isJungsung(newChar)) {
      if (decomposed.jong === '') {
        // Try to combine with existing Jungsung
        const combined = JUNGSUNG_COMBINATIONS[decomposed.jung + newChar];
        if (combined && JUNGSUNG.includes(combined)) {
          const newSyllable = composeHangul(decomposed.cho, combined, '');
          return prefix + newSyllable;
        }
      } else {
        // Jongsung becomes Chosung of new syllable
        const prevSyllable = composeHangul(decomposed.cho, decomposed.jung, '');
        const newSyllable = composeHangul(decomposed.jong, newChar, '');
        return prefix + prevSyllable + newSyllable;
      }
    }
  }
  
  // If last character is Jamo
  if (isChosung(lastChar) && isJungsung(newChar)) {
    // Combine Chosung + Jungsung
    return prefix + composeHangul(lastChar, newChar, '');
  }
  
  if (isJungsung(lastChar)) {
    if (isChosung(newChar) || isJongsung(newChar)) {
      // Try to form a syllable if there's a Chosung before
      if (currentText.length >= 2) {
        const secondLastChar = currentText[currentText.length - 2];
        if (isChosung(secondLastChar)) {
          const beforePrefix = currentText.slice(0, -2);
          const newSyllable = composeHangul(secondLastChar, lastChar, newChar);
          return beforePrefix + newSyllable;
        }
      }
      return currentText + newChar;
    }
    
    if (isJungsung(newChar)) {
      // Try to combine Jungsung
      const combined = JUNGSUNG_COMBINATIONS[lastChar + newChar];
      if (combined) {
        // Check if there's a Chosung before
        if (currentText.length >= 2) {
          const secondLastChar = currentText[currentText.length - 2];
          if (isChosung(secondLastChar)) {
            const beforePrefix = currentText.slice(0, -2);
            const newSyllable = composeHangul(secondLastChar, combined, '');
            return beforePrefix + newSyllable;
          }
        }
        return prefix + combined;
      }
    }
  }

  // Default: append the character
  return currentText + newChar;
}

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
      // Handle backspace with Korean decomposition
      if (inputValue.length === 0) return;
      
      const lastChar = inputValue[inputValue.length - 1];
      
      if (isKorean && isHangul(lastChar)) {
        const decomposed = decomposeHangul(lastChar);
        if (!decomposed) {
          const newValue = inputValue.slice(0, -1);
          setInputValue(newValue);
          onChange(newValue);
          return;
        }

        // If has Jongsung, remove it
        if (decomposed.jong) {
          const newSyllable = composeHangul(decomposed.cho, decomposed.jung, '');
          const newValue = inputValue.slice(0, -1) + newSyllable;
          setInputValue(newValue);
          onChange(newValue);
          return;
        }

        // If only has Chosung + Jungsung, decompose to just Chosung
        if (decomposed.jung) {
          const newValue = inputValue.slice(0, -1) + decomposed.cho;
          setInputValue(newValue);
          onChange(newValue);
          return;
        }
      }

      // Default backspace
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
      
      // Use Korean composition if in Korean mode
      let newValue;
      if (isKorean && (isChosung(button) || isJungsung(button) || isJongsung(button))) {
        newValue = composeKorean(inputValue, button);
      } else {
        newValue = inputValue + button;
      }
      
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
