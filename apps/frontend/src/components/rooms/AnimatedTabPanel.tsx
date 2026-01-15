// apps/frontend/src/components/rooms/AnimatedTabPanel.tsx
'use client';

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';

type Props = {
  tabKey: string;
  children: React.ReactNode;
};

export default function AnimatedTabPanel({ tabKey, children }: Props) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={tabKey}
        initial={{ opacity: 0, y: 6, filter: 'blur(2px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        exit={{ opacity: 0, y: -6, filter: 'blur(2px)' }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
