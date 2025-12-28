import { useEffect } from "react";
import { useLocation } from "wouter";

export function Connect() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation('/app/integration');
  }, [setLocation]);

  return null;
}
