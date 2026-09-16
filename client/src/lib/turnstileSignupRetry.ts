/**
 * Signup Turnstile tokens are single-use. After any attempt that sends or
 * tries to verify a token, the stored token must be cleared and the widget
 * remounted so the next submit uses a newly issued token.
 */

export type SignupTurnstileClientState = {
  token: string | null;
  resetKey: number;
};

export function beginSignupTurnstileAttempt(state: SignupTurnstileClientState): {
  tokenToSend: string | null;
  next: SignupTurnstileClientState;
} {
  return {
    tokenToSend: state.token,
    next: {
      token: null,
      resetKey: state.resetKey + 1,
    },
  };
}

export function finishFailedSignupTurnstile(state: SignupTurnstileClientState): SignupTurnstileClientState {
  return {
    token: null,
    resetKey: state.resetKey + 1,
  };
}

export function signupResultRequiresTurnstileReset(result: { success: boolean }): boolean {
  return result.success !== true;
}
