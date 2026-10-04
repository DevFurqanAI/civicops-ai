// Auth requests never contain a role or signup authorization metadata.
export interface AccountDriver {
  signUp(input: {email: string; password: string; options: {emailRedirectTo: string}}): Promise<{error: unknown}>;
  resetPasswordForEmail(email: string, options: {redirectTo: string}): Promise<{error: unknown}>;
  updateUser(input: {password: string}): Promise<{error: unknown}>;
}
export function createAccountActions(driver: AccountDriver, origin: string) {
  const site = new URL(origin).origin;
  const validatePassword = (password: string) => {
    if (password.length < 12) throw new Error('Use a password with at least 12 characters.');
  };
  return {
    async signup(email: string, password: string) {
      validatePassword(password);
      const {error} = await driver.signUp({email: email.trim(), password, options: {emailRedirectTo: `${site}/auth/callback`}});
      if (error) throw new Error('Account creation could not be completed. Please retry.');
      return 'Check your email to confirm your account, then sign in. If you already have an account, sign in instead.';
    },
    async requestReset(email: string) {
      const {error} = await driver.resetPasswordForEmail(email.trim(), {redirectTo: `${site}/auth/reset`});
      if (error) throw new Error('Password reset is unavailable. Please retry later.');
      return 'If this address has an account, a password-reset link will arrive by email.';
    },
    async updatePassword(password: string) {
      validatePassword(password);
      const {error} = await driver.updateUser({password});
      if (error) throw new Error('Password could not be updated. Request a new reset link and retry.');
    },
  };
}
