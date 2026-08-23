'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number | null;
  max?: number;
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value, max = 100, ...props }, ref) => {
    const v = Math.min(max, Math.max(0, value ?? 0));
    const pct = max > 0 ? (v / max) * 100 : 0;
    return (
      <div
        ref={ref}
        role="progressbar"
        aria-valuenow={v}
        aria-valuemax={max}
        aria-valuemin={0}
        className={cn(
          'relative h-4 w-full overflow-hidden rounded-full bg-secondary',
          className
        )}
        {...props}
      >
        <div
          className="h-full flex-1 bg-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    );
  }
);
Progress.displayName = 'Progress';

export { Progress };
