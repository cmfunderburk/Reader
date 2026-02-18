import { useEffect } from 'react';
import { useLatestRef } from './useLatestRef';

interface KeyboardHandlers {
  onSpace?: () => void;
  onLeft?: () => void;
  onRight?: () => void;
  onBracketLeft?: () => void;
  onBracketRight?: () => void;
  onEscape?: () => void;
}

export function useKeyboard(handlers: KeyboardHandlers): void {
  const handlersRef = useLatestRef(handlers);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore if user is typing in an input
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      const currentHandlers = handlersRef.current;
      switch (event.code) {
        case 'Space':
          event.preventDefault();
          currentHandlers.onSpace?.();
          break;
        case 'ArrowLeft':
          event.preventDefault();
          currentHandlers.onLeft?.();
          break;
        case 'ArrowRight':
          event.preventDefault();
          currentHandlers.onRight?.();
          break;
        case 'BracketLeft':
          event.preventDefault();
          currentHandlers.onBracketLeft?.();
          break;
        case 'BracketRight':
          event.preventDefault();
          currentHandlers.onBracketRight?.();
          break;
        case 'Escape':
          event.preventDefault();
          currentHandlers.onEscape?.();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlersRef]);
}
