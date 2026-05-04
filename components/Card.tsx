import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  action?: React.ReactNode;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const paddings = {
  none: '',
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-6',
};

const Card: React.FC<CardProps> = ({
  children,
  className = '',
  title,
  action,
  padding = 'md',
}) => {
  return (
    <div className={`bg-surface rounded-xl border border-border shadow-card ${className}`}>
      {title && (
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold text-text tracking-tight">{title}</h3>
          {action && <div>{action}</div>}
        </div>
      )}
      <div className={paddings[padding]}>{children}</div>
    </div>
  );
};

export default Card;
