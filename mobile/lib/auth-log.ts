const TAG = "[auth]";

export const SESSION_EXPIRED_MESSAGE =
  "Sesi Anda telah berakhir. Silakan login kembali.";

export const authLog = {
  secureStoreLoadStart() {
    console.log(`${TAG} SecureStore load start`);
  },
  secureStoreLoadSuccess(hasValue: boolean) {
    console.log(`${TAG} SecureStore load success`, { hasValue });
  },
  secureStoreLoadFail(err: unknown) {
    console.warn(`${TAG} SecureStore load fail`, err);
  },
  secureStoreSaveFail(err: unknown) {
    console.warn(`${TAG} SecureStore save fail`, err);
  },
  secureStoreClearFail(err: unknown) {
    console.warn(`${TAG} SecureStore clear fail`, err);
  },
  authRestoreSuccess(userId?: string) {
    console.log(`${TAG} Auth restore success`, { userId });
  },
  authRestoreEmpty() {
    console.log(`${TAG} Auth restore empty (no stored session)`);
  },
  authRestoreInvalid() {
    console.log(`${TAG} Auth restore invalid (stored token expired)`);
  },
  authRefreshSuccess(userId?: string) {
    console.log(`${TAG} Auth refresh success`, { userId });
  },
  authRefreshFail(err: unknown, reason: string) {
    console.warn(`${TAG} Auth refresh fail`, { reason, err });
  },
  authRefreshSkip(reason: string) {
    console.log(`${TAG} Auth refresh skip`, { reason });
  },
  autoLogout(reason: string) {
    console.log(`${TAG} Auto logout`, { reason });
  },
};
