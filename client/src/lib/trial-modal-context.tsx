import { createContext, useContext, type ReactNode } from "react";

const OpenTrialModalContext = createContext<(() => void) | null>(null);

export function TrialModalOpenProvider({
  openTrialModal,
  children,
}: {
  openTrialModal: () => void;
  children: ReactNode;
}) {
  return (
    <OpenTrialModalContext.Provider value={openTrialModal}>{children}</OpenTrialModalContext.Provider>
  );
}

export function useOpenTrialModal(): () => void {
  const fn = useContext(OpenTrialModalContext);
  return fn ?? (() => {});
}
