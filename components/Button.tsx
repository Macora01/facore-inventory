import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

const variants = {
  primary: 'bg-clay text-white hover:bg-clay-dark active:scale-[0.98]',
  secondary: 'bg-canvas text-text border border-border hover:bg-surface hover:border-clay-light active:scale-[0.98]',
  danger: 'bg-brick text-white hover:opacity-90 active:scale-[0.98]',
  ghost: 'text-text-secondary hover:text-text hover:bg-canvas active:scale-[0.98]',
};

const sizes = {
  sm: 'px-3 py-1.5 text-xs rounded-md',
  md: 'px-4 py-2 text-sm rounded-lg',
  lg: 'px-6 py-3 text-base rounded-lg',
};

const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  loading = false,
  children,
  className = '',
  disabled,
  ...props
}) => {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 font-medium
                  transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed
                  ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <span className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
      )}
      {children}
    </button>
  );
};

export default Button;
