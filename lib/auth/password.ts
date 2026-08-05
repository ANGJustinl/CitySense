export const MIN_PASSWORD_LENGTH = 8;

export function validatePassword(password: string) {
  return password.length >= MIN_PASSWORD_LENGTH
    ? undefined
    : `密码至少需要 ${MIN_PASSWORD_LENGTH} 个字符`;
}

export function validatePasswordConfirmation(password: string, confirmation: string) {
  return password === confirmation ? undefined : "两次输入的密码不一致";
}
