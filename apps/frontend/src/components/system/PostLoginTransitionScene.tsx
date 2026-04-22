'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';
import transitionImg from '../../../public/images/ctc-transition.png';

type Props = {
  reducedMotion: boolean;
};

export function PostLoginTransitionScene({ reducedMotion }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
      className="w-full"
    >
      {/* Subtle breathing wrapper */}
      <motion.div
        animate={reducedMotion ? undefined : { scale: [1, 1.007, 1] }}
        transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut' }}
        className="relative mx-auto w-full max-w-[560px] md:max-w-[680px]"
      >
        <Image
          src={transitionImg}
          alt="ContractToCozy — home intelligence dashboard"
          priority
          className="w-full h-auto
            rounded-2xl
            shadow-[0_6px_32px_-6px_rgba(13,148,136,0.18),0_2px_8px_-2px_rgba(0,0,0,0.05)]
            dark:shadow-[0_6px_40px_-8px_rgba(0,0,0,0.55)]"
        />
      </motion.div>
    </motion.div>
  );
}
