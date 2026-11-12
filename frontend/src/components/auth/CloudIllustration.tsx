import React from 'react';
import { useState } from 'react';
import { motion } from 'framer-motion';

// A compact animated cloud deployment illustration using SVG + Framer Motion
const CloudIllustration: React.FC<{ className?: string }> = ({ className = '' }) => {
  const [hidden, setHidden] = useState(false);

  const float = {
    animate: { y: [0, -12, 0], rotate: [0, 1, 0] },
    transition: { duration: 6, ease: 'easeInOut', repeat: Infinity },
  };

  return (
    <div
      className={`w-full h-full flex items-center justify-center transition-opacity duration-200 ${hidden ? 'opacity-0 pointer-events-none' : 'opacity-100'} ${className}`}
      onMouseEnter={() => setHidden(true)}
      onMouseLeave={() => setHidden(false)}
    >
      <motion.svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 800 600"
        preserveAspectRatio="xMidYMid meet"
        className="max-w-full max-h-[520px]"
        {...float}
      >
        <defs>
          <linearGradient id="g1" x1="0" x2="1">
            <stop offset="0%" stopColor="#2458D3" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#218B60" stopOpacity="0.9" />
          </linearGradient>
          <filter id="blur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="8" />
          </filter>
        </defs>

        {/* Background cloud blobs */}
        <g opacity="0.12">
          <motion.ellipse
            cx="200"
            cy="180"
            rx="180"
            ry="100"
            fill="#FFFFFF"
            filter="url(#blur)"
            animate={{ x: [0, 16, 0] }}
            transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.ellipse
            cx="520"
            cy="260"
            rx="200"
            ry="120"
            fill="#FFFFFF"
            filter="url(#blur)"
            animate={{ x: [0, -12, 0] }}
            transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
          />
        </g>

        {/* Stylized pipeline: repo -> build -> deploy -> live */}
        <g transform="translate(60,120)">
          {/* Repo */}
          <motion.g whileHover={{ scale: 1.03 }} transition={{ type: 'spring', stiffness: 250 }}>
            <rect x="0" y="40" width="120" height="70" fill="#101010" stroke="#2458D3" strokeWidth="2" />
            <text x="60" y="85" textAnchor="middle" fontSize="12" fill="#F0F0F0">GitHub</text>
          </motion.g>

          {/* Arrow */}
          <motion.path d="M130 75 L220 75" stroke="#9AA8B8" strokeWidth="2" />

          {/* Build */}
          <motion.g transform="translate(220,0)" whileHover={{ scale: 1.03 }} transition={{ type: 'spring', stiffness: 250 }}>
            <rect x="0" y="40" width="120" height="70" fill="#101010" stroke="#218B60" strokeWidth="2" />
            <text x="60" y="85" textAnchor="middle" fontSize="12" fill="#F0F0F0">Docker Build</text>
          </motion.g>

          <motion.path d="M360 75 L450 75" stroke="#9AA8B8" strokeWidth="2" />

          {/* Deploy */}
          <motion.g transform="translate(440,0)" whileHover={{ scale: 1.03 }} transition={{ type: 'spring', stiffness: 250 }}>
            <rect x="0" y="40" width="120" height="70" fill="#101010" stroke="#B97812" strokeWidth="2" />
            <text x="60" y="85" textAnchor="middle" fontSize="12" fill="#F0F0F0">Deploy to AWS</text>
          </motion.g>

          <motion.path d="M580 75 L670 75" stroke="#9AA8B8" strokeWidth="2" />

          {/* Live */}
          <motion.g
            transform="translate(660,0)"
            whileHover={{ scale: 1.03, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 250 }}
          >
            <rect x="0" y="40" width="120" height="70" fill="#101010" stroke="#218B60" strokeWidth="2" />
            <text x="60" y="85" textAnchor="middle" fontSize="12" fill="#F0F0F0">Live Site</text>
          </motion.g>
        </g>

        {/* Floating DevOps elements */}
        <motion.circle cx="720" cy="80" r="6" fill="#2458D3" animate={{ y: [0, -8, 0] }} transition={{ duration: 4, repeat: Infinity }} />
        <motion.circle cx="60" cy="420" r="5" fill="#218B60" animate={{ y: [0, -6, 0] }} transition={{ duration: 5, repeat: Infinity }} />
      </motion.svg>
    </div>
  );
};

export default CloudIllustration;
