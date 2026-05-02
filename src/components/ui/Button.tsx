import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-stack-fire text-stack-black hover:bg-[color:var(--color-accent-hover)]',
  secondary:
    'bg-gray-700 text-stack-white hover:bg-gray-600',
  ghost:
    'bg-transparent text-gray-300 hover:bg-gray-700 hover:text-stack-white',
  danger:
    'bg-stack-fire/70 text-stack-white hover:bg-stack-fire/90',
};

const SIZES: Record<Size, string> = {
  sm: 'h-7 px-3 text-xs',
  md: 'h-9 px-4 text-sm',
  lg: 'h-11 px-5 text-base',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'secondary', size = 'md', icon, className = '', children, ...rest }, ref) => {
    return (
      <button
        ref={ref}
        className={`inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
        {...rest}
      >
        {icon}
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';
