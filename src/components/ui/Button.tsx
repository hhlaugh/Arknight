import React from 'react';
import { CORNER_CUTS } from './tokens';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly cornerCut?: boolean;
  readonly icon?: React.ReactNode;
  readonly loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'secondary',
      size = 'md',
      cornerCut = false,
      icon,
      loading = false,
      disabled,
      children,
      className = '',
      style,
      ...props
    },
    ref,
  ) => {
    const baseClasses =
      'holo-btn inline-flex items-center justify-center font-medium tracking-wide select-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f1318] disabled:cursor-not-allowed disabled:opacity-40';

    const sizeClasses: Record<ButtonSize, string> = {
      sm: 'text-xs px-2.5 py-1 gap-1.5 min-h-[28px]',
      md: 'text-xs px-3.5 py-1.5 gap-2 min-h-[34px]',
      lg: 'text-sm px-5 py-2.5 gap-2.5 min-h-[42px] font-semibold',
    };

    const variantClasses: Record<ButtonVariant, string> = {
      primary: 'holo-btn-primary font-bold',
      secondary: 'holo-btn-secondary',
      danger: 'holo-btn-danger',
      ghost: 'holo-btn-ghost',
      outline: 'holo-btn-outline',
    };

    const tickColor =
      variant === 'primary'
        ? 'border-slate-950/55'
        : variant === 'danger'
          ? 'border-rose-300/80'
          : variant === 'outline'
            ? 'border-amber-300/85'
            : 'border-cyan-300/75';

    const combinedStyle = cornerCut
      ? {
          clipPath: CORNER_CUTS.sm,
          ...style,
        }
      : style;

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
        style={combinedStyle}
        {...props}
      >
        {/* 立体全息边角投射框标（pointer-events-none 绝不阻挡点击） */}
        {variant !== 'ghost' && (
          <>
            <span
              aria-hidden="true"
              className={`pointer-events-none absolute top-[2px] left-[2px] w-1.5 h-1.5 border-t border-l ${tickColor} z-[2]`}
            />
            <span
              aria-hidden="true"
              className={`pointer-events-none absolute bottom-[2px] right-[2px] w-1.5 h-1.5 border-b border-r ${tickColor} z-[2]`}
            />
          </>
        )}

        {loading && (
          <svg className="relative z-[3] animate-spin -ml-0.5 h-3.5 w-3.5 text-current" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {!loading && icon && <span className="relative z-[3] shrink-0">{icon}</span>}
        <span className="relative z-[3] inline-flex items-center justify-center gap-1.5">{children}</span>
      </button>
    );
  },
);

Button.displayName = 'Button';
