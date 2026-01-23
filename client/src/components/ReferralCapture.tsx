import { useEffect } from "react";
import { useLocation } from "wouter";

export function ReferralCapture() {
  const [location] = useLocation();
  
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const refCode = params.get('ref');
    
    if (refCode) {
      fetch('/api/referral/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refCode })
      }).then(() => {
        localStorage.setItem('referralCode', refCode);
        const url = new URL(window.location.href);
        url.searchParams.delete('ref');
        window.history.replaceState({}, '', url.toString());
      }).catch(console.error);
    }
  }, [location]);

  return null;
}
