import { useEffect, useState, type ReactNode } from "react";

/** Short fade when transitioning from bootstrap loader to pricing / app. */
export function ShopifyBootstrapFade({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div
      className={`min-h-[100dvh] transition-opacity duration-300 ease-out ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      {children}
    </div>
  );
}
