import type { ReactNode } from 'react';

interface CheckboxProps {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}

/**
 * Styled checkbox that matches the Stack design system.
 * Uses a hidden native <input> for accessibility and a custom visual layer.
 */
export function Checkbox({
  checked,
  indeterminate = false,
  onChange,
  label,
  disabled = false,
  className = '',
  'aria-label': ariaLabel,
}: CheckboxProps) {
  return (
    <label
      className={`group/cb flex cursor-pointer select-none items-center gap-2 ${
        disabled ? 'cursor-not-allowed opacity-40' : ''
      } ${className}`}
    >
      <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
        {/* Hidden native input — drives accessibility */}
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          aria-label={ariaLabel}
          onChange={(e) => onChange(e.target.checked)}
          className="peer absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
          // Indeterminate state must be set via ref-like effect; we handle it
          // visually below and let the parent manage the logical state.
          ref={(el) => {
            if (el) el.indeterminate = indeterminate && !checked;
          }}
        />

        {/* Visual box */}
        <span
          className={`flex h-4 w-4 items-center justify-center rounded border transition-colors
            ${
              checked
                ? 'border-stack-fire bg-stack-fire'
                : indeterminate
                  ? 'border-stack-fire bg-stack-fire/30'
                  : 'border-gray-600 bg-transparent peer-hover:border-gray-400'
            }
          `}
        >
          {checked && (
            // Checkmark SVG — crisp at 12×12
            <svg
              width="10"
              height="8"
              viewBox="0 0 10 8"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M1 3.5L3.8 6.5L9 1"
                stroke="#0a0a0a"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
          {!checked && indeterminate && (
            // Dash for indeterminate
            <svg
              width="8"
              height="2"
              viewBox="0 0 8 2"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M1 1H7"
                stroke="var(--color-stack-fire)"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          )}
        </span>
      </span>

      {label && (
        <span className="text-xs text-gray-400 group-hover/cb:text-gray-200">
          {label}
        </span>
      )}
    </label>
  );
}
