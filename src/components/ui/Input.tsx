import { forwardRef } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  leading?: ReactNode;
  trailing?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ leading, trailing, className = '', ...rest }, ref) => {
    return (
      <div
        className={`flex h-9 items-center gap-2 rounded-md border border-gray-600 bg-gray-700 px-3 text-sm text-stack-white focus-within:border-stack-fire ${className}`}
      >
        {leading}
        <input
          ref={ref}
          className="flex-1 bg-transparent outline-none placeholder:text-gray-400"
          {...rest}
        />
        {trailing}
      </div>
    );
  }
);
Input.displayName = 'Input';
