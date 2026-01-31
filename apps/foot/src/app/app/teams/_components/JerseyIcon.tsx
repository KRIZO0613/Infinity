type JerseyIconProps = {
  number?: number | string;
  size?: number;
};

export default function JerseyIcon({ number, size = 80 }: JerseyIconProps) {
  const showNumber = number || number === 0;

  return (
    <div
      style={{ width: size, height: size }}
      className="relative flex items-center justify-center"
    >
      <svg
        viewBox="0 0 120 140"
        xmlns="http://www.w3.org/2000/svg"
        className="h-full w-full"
      >
        <defs>
          <linearGradient id="jerseyStroke" x1="0" y1="0" x2="120" y2="140">
            <stop offset="0%" stopColor="#a855f7" />
            <stop offset="50%" stopColor="#c4b5fd" />
            <stop offset="100%" stopColor="#22d3ee" />
          </linearGradient>
          <filter id="jerseyGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow
              dx="0"
              dy="6"
              stdDeviation="6"
              floodColor="#0f172a"
              floodOpacity="0.55"
            />
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
            <feColorMatrix
              in="blur"
              type="matrix"
              values="
                0 0 0 0 0.58
                0 0 0 0 0.44
                0 0 0 0 0.99
                0 0 0 0.6 0
              "
              result="glow"
            />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="jerseyFill" x1="0" y1="0" x2="120" y2="140">
            <stop offset="0%" stopColor="rgba(15,23,42,0.7)" />
            <stop offset="100%" stopColor="rgba(15,23,42,0.3)" />
          </linearGradient>
        </defs>
        <g filter="url(#jerseyGlow)" transform="translate(6 0) skewX(-8)">
          <path
            d="
              M 28 32
              L 46 14
              L 70 10
              L 94 20
              L 105 40
              L 98 120
              L 30 130
              L 18 50
              Z
            "
            fill="url(#jerseyFill)"
            stroke="url(#jerseyStroke)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="
              M 28 32
              L 46 14
              L 70 10
              L 94 20
              L 105 40
              L 98 120
              L 30 130
              L 18 50
              Z
            "
            fill="none"
            stroke="rgba(15,23,42,0.45)"
            strokeWidth="3"
            transform="translate(3 4)"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="
              M 32 38
              L 48 22
              L 68 18
              L 89 27
              L 97 44
              L 91 114
              L 34 122
              L 25 54
              Z
            "
            fill="none"
            stroke="#1f2937"
            strokeOpacity="0.8"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="
              M 32 38
              L 48 22
              L 68 18
              L 89 27
              L 97 44
              L 91 114
              L 34 122
              L 25 54
              Z
            "
            fill="none"
            stroke="rgba(255,255,255,0.15)"
            strokeWidth="1.2"
            transform="translate(-1 -1)"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
        {showNumber ? (
          <text
            x="60"
            y="88"
            textAnchor="middle"
            fontSize="40"
            fontFamily="system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
            fontWeight="700"
            fill="#e9d5ff"
            stroke="#0f172a"
            strokeWidth="1.5"
            paintOrder="stroke"
          >
            {number}
          </text>
        ) : null}
      </svg>
    </div>
  );
}
