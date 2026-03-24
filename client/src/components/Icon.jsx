import React from 'react';

export default function Icon({ name, size = 20, className = '' }) {
  return (
    <span
      className={`material-icons-outlined ${className}`}
      style={{ fontSize: size, lineHeight: 1, verticalAlign: 'middle' }}
    >
      {name}
    </span>
  );
}
