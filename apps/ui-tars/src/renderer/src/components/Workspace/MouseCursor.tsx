import React from 'react';

interface MouseCursorProps {
  position: { x: number; y: number };
  previousPosition?: { x: number; y: number } | null;
  action?: string;
  /** Use smooth transition for agent actions, instant for user mouse tracking */
  smooth?: boolean;
  /** Counter-scale factor to maintain cursor size inside a scaled container */
  cursorScale?: number;
}

export const MouseCursor: React.FC<MouseCursorProps> = ({
  position,
  action,
  smooth = true,
  cursorScale = 1,
}) => {
  const isClickAction =
    action &&
    (action.includes('click') ||
      action === 'left_double' ||
      action === 'right_single');

  const isDragAction = action === 'drag';
  const isTypeAction = action === 'type';
  const isScrollAction = action === 'scroll';

  return (
    <div
      className="absolute pointer-events-none heyworkly-cursor"
      style={{
        left: `${position.x}%`,
        top: `${position.y}%`,
        zIndex: 50,
        transition: smooth
          ? 'left 0.5s cubic-bezier(0.22, 1, 0.36, 1), top 0.5s cubic-bezier(0.22, 1, 0.36, 1)'
          : 'none',
      }}
    >
      <div
        className="relative"
        style={{
          transform: `translate(-2px, -2px) scale(${cursorScale})`,
          transformOrigin: 'top left',
        }}
      >
        {/* Outer glow — ambient energy field */}
        <div
          className="absolute heyworkly-ambient"
          style={{
            top: '-16px',
            left: '-16px',
            width: '72px',
            height: '72px',
            borderRadius: '50%',
            background:
              'radial-gradient(circle, rgba(99,102,241,0.15) 0%, rgba(139,92,246,0.08) 40%, transparent 70%)',
            filter: 'blur(4px)',
          }}
        />

        {/* Cursor SVG — sleek futuristic pointer */}
        <svg
          width="42"
          height="42"
          viewBox="0 0 28 28"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="heyworkly-pointer relative"
          style={{
            filter:
              'drop-shadow(0 0 6px rgba(99,102,241,0.5)) drop-shadow(0 2px 4px rgba(0,0,0,0.3))',
          }}
        >
          <defs>
            <linearGradient
              id="hw-cursor-fill"
              x1="4"
              y1="2"
              x2="18"
              y2="22"
            >
              <stop offset="0%" stopColor="#818cf8" />
              <stop offset="50%" stopColor="#6366f1" />
              <stop offset="100%" stopColor="#4f46e5" />
            </linearGradient>
            <linearGradient
              id="hw-cursor-stroke"
              x1="4"
              y1="2"
              x2="18"
              y2="22"
            >
              <stop offset="0%" stopColor="#a5b4fc" />
              <stop offset="100%" stopColor="#6366f1" />
            </linearGradient>
          </defs>
          {/* Main arrow — sharp geometric */}
          <path
            d="M5 2L22 13L14 14.5L10 22L5 2Z"
            fill="url(#hw-cursor-fill)"
            stroke="url(#hw-cursor-stroke)"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          {/* Inner highlight — glass reflection */}
          <path
            d="M7 5L18 12.5L13 13.5L10.5 18L7 5Z"
            fill="rgba(255,255,255,0.2)"
            strokeLinejoin="round"
          />
          {/* Tip accent dot */}
          <circle cx="5.5" cy="3.5" r="1" fill="rgba(255,255,255,0.6)" />
        </svg>

        {/* Brand label — "heyworkly" */}
        <div
          className="absolute heyworkly-label"
          style={{
            left: '36px',
            top: '24px',
            whiteSpace: 'nowrap',
          }}
        >
          <div
            style={{
              background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
              padding: '3px 10px',
              borderRadius: '4px',
              fontSize: '10px',
              fontWeight: 700,
              fontFamily:
                "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
              letterSpacing: '0.05em',
              color: 'rgba(255,255,255,0.95)',
              boxShadow:
                '0 0 12px rgba(99,102,241,0.4), 0 2px 6px rgba(0,0,0,0.3)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(165,180,252,0.3)',
            }}
          >
            heyworkly
          </div>
        </div>

        {/* ── Click effect: triple ripple burst ── */}
        {isClickAction && (
          <>
            <div
              className="absolute rounded-full heyworkly-ripple-1"
              style={{
                top: '-18px',
                left: '-18px',
                width: '48px',
                height: '48px',
                border: '2px solid rgba(99,102,241,0.6)',
                background:
                  'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)',
              }}
            />
            <div
              className="absolute rounded-full heyworkly-ripple-2"
              style={{
                top: '-14px',
                left: '-14px',
                width: '40px',
                height: '40px',
                border: '1.5px solid rgba(139,92,246,0.5)',
                background:
                  'radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)',
              }}
            />
            <div
              className="absolute rounded-full heyworkly-ripple-3"
              style={{
                top: '-8px',
                left: '-8px',
                width: '28px',
                height: '28px',
                border: '1px solid rgba(167,139,250,0.6)',
                background:
                  'radial-gradient(circle, rgba(167,139,250,0.2) 0%, transparent 60%)',
              }}
            />
          </>
        )}

        {/* ── Drag effect: trailing particles ── */}
        {isDragAction && (
          <div
            className="absolute heyworkly-drag-trail"
            style={{
              top: '6px',
              left: '6px',
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: 'rgba(99,102,241,0.6)',
              boxShadow:
                '-8px 0 10px rgba(99,102,241,0.3), -18px 0 10px rgba(139,92,246,0.2), -28px 0 10px rgba(167,139,250,0.1)',
            }}
          />
        )}

        {/* ── Type effect: pulsing beam ── */}
        {isTypeAction && (
          <div
            className="absolute heyworkly-type-beam"
            style={{
              top: '2px',
              left: '30px',
              width: '2.5px',
              height: '22px',
              borderRadius: '1px',
              background: 'linear-gradient(to bottom, #818cf8, #6366f1)',
              boxShadow: '0 0 6px rgba(99,102,241,0.6)',
            }}
          />
        )}

        {/* ── Scroll effect: directional arrows ── */}
        {isScrollAction && (
          <div
            className="absolute heyworkly-scroll-indicator"
            style={{
              top: '-22px',
              left: '4px',
            }}
          >
            <svg
              width="14"
              height="48"
              viewBox="0 0 12 40"
              fill="none"
              style={{ opacity: 0.7 }}
            >
              <path
                d="M6 2L2 8H10L6 2Z"
                fill="rgba(99,102,241,0.6)"
                className="heyworkly-scroll-up"
              />
              <path
                d="M6 38L2 32H10L6 38Z"
                fill="rgba(99,102,241,0.6)"
                className="heyworkly-scroll-down"
              />
            </svg>
          </div>
        )}
      </div>
    </div>
  );
};
