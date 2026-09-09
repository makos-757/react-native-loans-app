let _currentUser: { email: string; fullName: string } | null = null;
let _authReady = false;

export function setAuthState(user: { email: string; fullName: string } | null, ready: boolean) {
  _currentUser = user;
  _authReady = ready;
}

export function isAuthReady() {
  return _authReady;
}

export function hasActiveUser() {
  return _currentUser !== null;
}