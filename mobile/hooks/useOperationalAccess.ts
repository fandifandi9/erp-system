import { useCallback, useMemo, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { pb } from "@/lib/pocketbase";
import { useAuth } from "@/context/auth";
import {
  hasOperationalBypass,
  isOperationalModuleLocked,
  readOperationalAccess,
} from "@/lib/operational-access-gate";

export function useOperationalAccess() {
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    const uid = user?.id;
    if (!uid) return;
    const token = pb.authStore.token;
    if (!token) return;
    setRefreshing(true);
    try {
      const fresh = await pb.collection("users").getOne(uid, { requestKey: null });
      pb.authStore.save(token, fresh as never);
    } catch {
      /* offline */
    } finally {
      setRefreshing(false);
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const locked = useMemo(() => isOperationalModuleLocked(user), [user]);
  const bypass = useMemo(() => hasOperationalBypass(user), [user]);
  const hasAccess = useMemo(() => readOperationalAccess(user), [user]);

  return {
    locked,
    bypass,
    hasAccess,
    refreshing,
    refresh,
  };
}
