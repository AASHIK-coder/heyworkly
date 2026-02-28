import React, { useRef, useEffect, useState, useCallback } from 'react';
import { MouseCursor } from './MouseCursor';

// Must match the values in webviewOperator.ts
const VIEWPORT_WIDTH = 1280;
const VIEWPORT_HEIGHT = 720;

const HIDE_CURSOR_CSS = '*, *::before, *::after { cursor: none !important; }';

interface EmbeddedBrowserProps {
  startUrl?: string;
  mousePosition?: { x: number; y: number } | null;
  previousMousePosition?: { x: number; y: number } | null;
  actionType?: string;
  isRunning?: boolean;
  sessionId?: string;
}

export const EmbeddedBrowser: React.FC<EmbeddedBrowserProps> = ({
  startUrl = 'https://www.google.com',
  mousePosition,
  previousMousePosition,
  actionType,
  isRunning = false,
  sessionId,
}) => {
  const webviewRef = useRef<HTMLElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [scale, setScale] = useState(1);
  const [userCursorPos, setUserCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [isHovering, setIsHovering] = useState(false);

  const updateScale = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const scaleX = rect.width / VIEWPORT_WIDTH;
    const scaleY = rect.height / VIEWPORT_HEIGHT;
    setScale(Math.min(scaleX, scaleY));
  }, []);

  useEffect(() => {
    updateScale();
    const observer = new ResizeObserver(updateScale);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    return () => observer.disconnect();
  }, [updateScale]);

  // Navigate webview back to start URL on session change (e.g. New Chat)
  const initialSessionRef = useRef(sessionId);
  useEffect(() => {
    // Skip the initial mount — only navigate on actual session switches
    if (sessionId === initialSessionRef.current) {
      initialSessionRef.current = sessionId;
      return;
    }
    initialSessionRef.current = sessionId;

    const webview = webviewRef.current as any;
    if (webview && typeof webview.loadURL === 'function') {
      webview.loadURL(startUrl);
    } else if (webview && typeof webview.src !== 'undefined') {
      webview.src = startUrl;
    }
  }, [sessionId, startUrl]);

  // Inject cursor:none CSS into the webview and handle loading states
  useEffect(() => {
    const webview = webviewRef.current as any;
    if (!webview) return;

    const hideCursor = () => {
      webview.insertCSS(HIDE_CURSOR_CSS).catch(() => {});
    };

    const handleDomReady = () => {
      setIsLoading(false);
      hideCursor();
    };
    const handleDidStartLoading = () => setIsLoading(true);
    const handleDidStopLoading = () => {
      setIsLoading(false);
      hideCursor();
    };

    webview.addEventListener('dom-ready', handleDomReady);
    webview.addEventListener('did-start-loading', handleDidStartLoading);
    webview.addEventListener('did-stop-loading', handleDidStopLoading);

    return () => {
      webview.removeEventListener('dom-ready', handleDomReady);
      webview.removeEventListener('did-start-loading', handleDidStartLoading);
      webview.removeEventListener('did-stop-loading', handleDidStopLoading);
    };
  }, []);

  // Convert screen coordinates to webview content coordinates
  const toWebviewCoords = useCallback(
    (clientX: number, clientY: number) => {
      const viewport = viewportRef.current;
      if (!viewport) return null;
      const rect = viewport.getBoundingClientRect();
      const x = Math.round((clientX - rect.left) * (VIEWPORT_WIDTH / rect.width));
      const y = Math.round((clientY - rect.top) * (VIEWPORT_HEIGHT / rect.height));
      return { x, y };
    },
    [],
  );

  // Forward mouse events from overlay to webview via sendInputEvent
  const forwardMouseEvent = useCallback(
    (e: React.MouseEvent, type: 'mouseDown' | 'mouseUp' | 'mouseMove') => {
      const webview = webviewRef.current as any;
      if (!webview?.sendInputEvent) return;
      const coords = toWebviewCoords(e.clientX, e.clientY);
      if (!coords) return;
      const buttonMap: Record<number, string> = { 0: 'left', 1: 'middle', 2: 'right' };
      webview.sendInputEvent({
        type,
        x: coords.x,
        y: coords.y,
        button: buttonMap[e.button] || 'left',
        clickCount: type === 'mouseDown' ? (e.detail || 1) : 0,
      });
    },
    [toWebviewCoords],
  );

  const forwardWheelEvent = useCallback(
    (e: React.WheelEvent) => {
      const webview = webviewRef.current as any;
      if (!webview?.sendInputEvent) return;
      const coords = toWebviewCoords(e.clientX, e.clientY);
      if (!coords) return;
      webview.sendInputEvent({
        type: 'mouseWheel',
        x: coords.x,
        y: coords.y,
        deltaX: Math.round(e.deltaX),
        deltaY: Math.round(-e.deltaY),
      });
    },
    [toWebviewCoords],
  );

  // Track user mouse position over the overlay (percentage for heyworkly cursor)
  const handleOverlayMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const rect = viewport.getBoundingClientRect();
      const pctX = ((e.clientX - rect.left) / rect.width) * 100;
      const pctY = ((e.clientY - rect.top) / rect.height) * 100;
      setUserCursorPos({
        x: Math.max(0, Math.min(100, pctX)),
        y: Math.max(0, Math.min(100, pctY)),
      });
      // Also forward mousemove to webview for hover effects
      forwardMouseEvent(e, 'mouseMove');
    },
    [forwardMouseEvent],
  );

  return (
    <div ref={containerRef} className="absolute inset-0 flex items-center justify-center overflow-hidden bg-gray-100 dark:bg-gray-900">
      {/* Fixed-size viewport container, scaled to fit */}
      <div
        ref={viewportRef}
        style={{
          width: VIEWPORT_WIDTH,
          height: VIEWPORT_HEIGHT,
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
          position: 'relative',
          flexShrink: 0,
        }}
      >
        {/* The Electron webview — fixed viewport size, cursor hidden via injected CSS */}
        <webview
          ref={webviewRef as any}
          src={startUrl}
          partition="persist:embedded-browser"
          style={{
            width: VIEWPORT_WIDTH,
            height: VIEWPORT_HEIGHT,
            border: 'none',
          }}
        />

        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70 dark:bg-gray-900/70 backdrop-blur-sm z-10">
            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 border-2 border-blue-500/30 rounded-full" />
                <div className="absolute inset-0 w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
              <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">Loading...</span>
            </div>
          </div>
        )}

        {/* Interaction overlay — captures mouse to track heyworkly cursor and forwards events to webview */}
        {!isRunning && (
          <div
            className="absolute inset-0 z-20"
            style={{ cursor: 'none' }}
            onMouseMove={handleOverlayMouseMove}
            onMouseDown={(e) => forwardMouseEvent(e, 'mouseDown')}
            onMouseUp={(e) => forwardMouseEvent(e, 'mouseUp')}
            onWheel={forwardWheelEvent}
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => {
              setIsHovering(false);
              setUserCursorPos(null);
            }}
            onContextMenu={(e) => e.preventDefault()}
          />
        )}

        {/* Animated cursor overlay — agent cursor when running, user hover cursor when idle */}
        {(isRunning || (isHovering && userCursorPos)) && (
          <div className="absolute inset-0 pointer-events-none z-30">
            <MouseCursor
              position={isRunning ? (mousePosition ?? { x: 50, y: 50 }) : userCursorPos!}
              previousPosition={isRunning ? previousMousePosition : null}
              action={isRunning ? actionType : undefined}
              smooth={isRunning}
              cursorScale={scale > 0 ? 1 / scale : 1}
            />
          </div>
        )}

        {/* Live indicator badge */}
        {isRunning && (
          <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-black/60 backdrop-blur-md rounded-full px-3 py-1.5 z-20 shadow-lg">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
            </span>
            <span className="text-[10px] font-semibold text-white/90 tracking-wide">LIVE</span>
          </div>
        )}
      </div>
    </div>
  );
};
