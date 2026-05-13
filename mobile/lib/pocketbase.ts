import PocketBase, { AsyncAuthStore } from "pocketbase";
import * as SecureStore from "expo-secure-store";
import { getPocketBaseUrl } from "./env";

const AUTH_KEY = "pb_auth";

const authStore = new AsyncAuthStore({
  save: async (serialized) => {
    await SecureStore.setItemAsync(AUTH_KEY, serialized);
  },
  clear: async () => {
    await SecureStore.deleteItemAsync(AUTH_KEY);
  },
  initial: SecureStore.getItemAsync(AUTH_KEY),
});

export const pb = new PocketBase(getPocketBaseUrl() || "http://127.0.0.1:8090", authStore);

pb.autoCancellation(false);
