// Which login layout the user prefers — persisted so it sticks until they change it.
export type LoginLayout = 'card' | 'split';
const KEY = 'attendify_login_layout';

export function getLoginLayout(): LoginLayout {
  return localStorage.getItem(KEY) === 'split' ? 'split' : 'card';
}

export function setLoginLayout(layout: LoginLayout) {
  localStorage.setItem(KEY, layout);
}
