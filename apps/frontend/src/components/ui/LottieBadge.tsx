'use client';

import React from 'react';
import Lottie, { type LottieRefCurrentProps } from 'lottie-react';
import { cn } from '@/lib/utils';

type IconComponent = React.ComponentType<{ className?: string }>;

type LottieBadgeProps = {
  animationData: Record<string, unknown>;
  icon: IconComponent;
  size?: number;
  iconClassName?: string;
  className?: string;
  loop?: boolean;
  autoplay?: boolean;
  speed?: number;
  disableAnimationOnReducedMotion?: boolean;
  reducedMotionBgClassName?: string;
};

export default function LottieBadge({
  animationData,
  icon: Icon,
  size = 32,
  iconClassName,
  className,
  loop = true,
  autoplay = true,
  speed = 1,
  disableAnimationOnReducedMotion = true,
  reducedMotionBgClassName = 'bg-gray-100',
}: LottieBadgeProps) {
  const lottieRef = React.useRef<LottieRefCurrentProps | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setPrefersReducedMotion(media.matches);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);

  React.useEffect(() => {
    if (!lottieRef.current) return;
    lottieRef.current.setSpeed(speed);
  }, [speed]);

  const shouldAnimate = !(disableAnimationOnReducedMotion && prefersReducedMotion);

  return (
    <div
      aria-hidden="true"
      className={className}
      style={{ width: size, height: size, position: 'relative' }}
    >
      {shouldAnimate ? (
        <Lottie
          lottieRef={lottieRef}
          animationData={animationData}
          loop={loop}
          autoplay={autoplay}
          style={{ width: '100%', height: '100%' }}
        />
      ) : (
        <span
          className={cn(
            'absolute inset-0 rounded-full',
            reducedMotionBgClassName
          )}
        />
      )}
      <Icon
        className={iconClassName || 'absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 text-teal-700'}
      />
    </div>
  );
}
