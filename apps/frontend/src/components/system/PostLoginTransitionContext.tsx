'use client';

import React, { createContext, useCallback, useContext } from 'react';

type PostLoginTransitionContextValue = {
  active: boolean;
  markReady: () => void;
};

const PostLoginTransitionContext = createContext<PostLoginTransitionContextValue>({
  active: false,
  markReady: () => undefined,
});

export function PostLoginTransitionProvider({
  active,
  onReady,
  children,
}: {
  active: boolean;
  onReady: () => void;
  children: React.ReactNode;
}) {
  const markReady = useCallback(() => {
    if (active) onReady();
  }, [active, onReady]);

  return (
    <PostLoginTransitionContext.Provider value={{ active, markReady }}>
      {children}
    </PostLoginTransitionContext.Provider>
  );
}

export function usePostLoginTransitionReadiness() {
  return useContext(PostLoginTransitionContext);
}
