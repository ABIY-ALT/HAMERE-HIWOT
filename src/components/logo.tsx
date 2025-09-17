import type { SVGProps } from 'react';

export function Logo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      width="100"
      height="100"
      {...props}
    >
      <style>
        {`
          .logo-text {
            font-family: 'Noto Serif', serif;
            font-size: 6px;
            fill: #FFFFFF;
            font-weight: 500;
          }
          .logo-text-bottom {
            font-family: 'Noto Serif', serif;
            font-size: 7px;
            fill: #fcd34d;
            font-weight: bold;
          }
        `}
      </style>
      <defs>
        <path
          id="text-circle-top"
          d="M 10,50 A 40,40 0 1 1 90,50"
          fill="none"
        />
      </defs>

      {/* Outer Circle */}
      <circle cx="50" cy="50" r="49" fill="#1e3a8a" />
      {/* Inner White Ring */}
      <circle cx="50" cy="50" r="45" fill="none" stroke="#FFFFFF" strokeWidth="1" />
      {/* Central Blue Circle */}
      <circle cx="50" cy="50" r="44" fill="#1e3a8a" />

      {/* Top text */}
      <text className="logo-text" dy="-2">
        <textPath href="#text-circle-top" startOffset="50%" textAnchor="middle">
          Sallo Debre Tsehay Saint George Church Hamere Hiwot Sabbath School
        </textPath>
      </text>
      
      {/* Central Elements */}
      <g transform="translate(0, 5)">
          {/* Boat */}
          <path d="M 25 60 C 35 50, 65 50, 75 60 L 70 70 L 30 70 Z" fill="#fcd34d" />
          
          {/* Waves */}
          <path d="M 20 68 C 35 62, 45 72, 50 68 C 55 64, 65 72, 80 68" fill="none" stroke="#3b82f6" strokeWidth="4" strokeLinecap="round" />
           <path d="M 20 75 C 35 69, 45 79, 50 75 C 55 71, 65 79, 80 75" fill="none" stroke="#3b82f6" strokeWidth="4" strokeLinecap="round" />
          
          {/* Amharic Text representation */}
          <text x="50" y="50" fontSize="18" fill="#fcd34d" textAnchor="middle" fontWeight="bold">ሐ</text>
           <text x="42" y="55" fontSize="14" fill="#fcd34d" textAnchor="middle" fontWeight="bold">መ</text>
           <text x="58" y="55" fontSize="14" fill="#fcd34d" textAnchor="middle" fontWeight="bold">ረ</text>

          {/* Cross */}
          <path d="M 48 30 V 25 H 52 V 30 H 55 V 34 H 52 V 39 H 48 V 34 H 45 V 30 H 48 Z" fill="#fcd34d" />
          
          {/* Book */}
          <g transform="translate(0, 50)">
              <path d="M 45 30 L 55 30 L 55 32 L 50 35 L 45 32 Z" fill="#fcd34d" />
              <text x="47.5" y="32" fontSize="2" fill="#1e3a8a" textAnchor="middle">ነሀ</text>
              <text x="52.5" y="32" fontSize="2" fill="#1e3a8a" textAnchor="middle">2:20</text>
          </g>
      </g>
      
       {/* Bottom Text */}
       <text x="50" y="93" className="logo-text-bottom" textAnchor="middle">
            ፲፱፻፺፱ ዓ.ም ተመሠረተ
       </text>

    </svg>
  );
}
