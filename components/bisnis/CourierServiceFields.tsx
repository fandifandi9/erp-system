"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  fetchCouriersCatalogCached,
  peekCouriersCatalogCache,
} from "@/lib/bisnis/couriers";
import type { Courier, CourierService } from "@/lib/bisnis/types";
import { onEnterFocusNext } from "@/lib/bisnis/form-nav";
import { CourierAvatar } from "@/components/bisnis/CourierAvatar";

type Props = {
  courierName: string;
  serviceName: string;
  onCourierChange: (name: string) => void;
  onServiceChange: (name: string) => void;
  /**
   * Set kurir & layanan sekaligus (hindari race: dua onChange berurutan yang
   * saling menimpa karena memakai state lama). Dipakai bila tersedia.
   */
  onCourierServiceChange?: (courier: string, service: string) => void;
  courierLabel?: string;
  serviceLabel?: string;
  className?: string;
  inputClassName?: string;
  labelClassName?: string;
  dataNav?: boolean;
};

const defaultInput =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100";
const defaultLabel = "mb-1 block text-sm font-medium text-slate-700";

function matchCourier(couriers: Courier[], name: string): Courier | undefined {
  const q = name.trim().toLowerCase();
  if (!q) return undefined;
  return couriers.find(
    (c) =>
      c.name.trim().toLowerCase() === q ||
      (c.code?.trim().toLowerCase() ?? "") === q,
  );
}

function sortServices(list: CourierService[]): CourierService[] {
  return [...list].sort(
    (a, b) =>
      (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
      a.name.localeCompare(b.name, "id"),
  );
}

export function CourierServiceFields({
  courierName,
  serviceName,
  onCourierChange,
  onServiceChange,
  onCourierServiceChange,
  courierLabel = "Ekspedisi",
  serviceLabel = "Layanan pengiriman",
  className = "",
  inputClassName = defaultInput,
  labelClassName = defaultLabel,
  dataNav = false,
}: Props) {
  const initialCatalog = peekCouriersCatalogCache(true);
  const [couriers, setCouriers] = useState<Courier[]>(initialCatalog?.couriers ?? []);
  const [servicesByCourier, setServicesByCourier] = useState<Record<string, CourierService[]>>(
    initialCatalog?.servicesByCourier ?? {},
  );
  const [loading, setLoading] = useState(!initialCatalog);
  const [loadError, setLoadError] = useState("");
  const [courierId, setCourierId] = useState("");
  const [serviceId, setServiceId] = useState("");

  useEffect(() => {
    let cancelled = false;
    const cached = peekCouriersCatalogCache(true);
    if (cached) {
      setCouriers(cached.couriers);
      setServicesByCourier(cached.servicesByCourier);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setLoadError("");
    void fetchCouriersCatalogCached(true)
      .then((catalog) => {
        if (cancelled) return;
        setCouriers(catalog.couriers);
        setServicesByCourier(catalog.servicesByCourier);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        if (!peekCouriersCatalogCache(true)) {
          setCouriers([]);
          setServicesByCourier({});
        }
        setLoadError(e instanceof Error ? e.message : "Gagal memuat ekspedisi");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!couriers.length) return;
    const matched = matchCourier(couriers, courierName);
    setCourierId(matched?.id ?? "");
  }, [couriers, courierName]);

  const selectedCourier = useMemo(
    () => couriers.find((c) => c.id === courierId) ?? matchCourier(couriers, courierName),
    [couriers, courierId, courierName],
  );

  const serviceOptions = useMemo(() => {
    if (!selectedCourier?.id) return [];
    return sortServices(servicesByCourier[selectedCourier.id] ?? []);
  }, [selectedCourier?.id, servicesByCourier]);

  useEffect(() => {
    if (!selectedCourier?.id) {
      setServiceId("");
      return;
    }
    const matched = serviceOptions.find((s) => s.name === serviceName);
    setServiceId(matched?.id ?? "");
  }, [selectedCourier?.id, serviceName, serviceOptions]);

  const textNavProps = dataNav ? { "data-nav": true, onKeyDown: onEnterFocusNext } : {};
  const showCourierNames = couriers.length > 0 || !loading;
  const knownServicePending =
    !!serviceName.trim() &&
    !serviceId &&
    !!selectedCourier &&
    (loading ||
      serviceOptions.length === 0 ||
      !serviceOptions.some((s) => s.name === serviceName.trim()));

  /** Set kurir+layanan sekali jalan bila callback gabungan tersedia (hindari saling menimpa). */
  const emitChange = (courier: string, service: string) => {
    if (onCourierServiceChange) {
      onCourierServiceChange(courier, service);
    } else {
      onServiceChange(service);
      onCourierChange(courier);
    }
  };

  const handleCourierSelect = (id: string) => {
    const prevId = courierId;
    setCourierId(id);
    const c = couriers.find((x) => x.id === id);
    const nextCourier = c?.name ?? "";
    // Kosongkan layanan hanya saat ganti ekspedisi — jangan hapus layanan existing saat pertama pilih kurir.
    if (prevId && id !== prevId) {
      setServiceId("");
      emitChange(nextCourier, "");
    } else {
      emitChange(nextCourier, serviceName);
    }
  };

  const handleServiceSelect = (id: string) => {
    setServiceId(id);
    const s = serviceOptions.find((x) => x.id === id);
    emitChange(selectedCourier?.name ?? courierName, s?.name ?? "");
  };

  const handleServiceTextChange = (value: string) => {
    emitChange(selectedCourier?.name ?? courierName, value);
  };

  if (loadError && couriers.length === 0) {
    return (
      <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
        {loadError}
      </p>
    );
  }

  if (!loading && couriers.length === 0) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        Belum ada master ekspedisi. Tambahkan di menu{" "}
        <Link href="/bisnis/ekspedisi" className="font-semibold underline">
          Bisnis → Ekspedisi
        </Link>
        .
      </p>
    );
  }

  const displayCourierName = selectedCourier?.name ?? courierName.trim();
  const displayServiceName = serviceName.trim();

  return (
    <div className={className}>
      {displayCourierName ? (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          {selectedCourier ? <CourierAvatar courier={selectedCourier} size="sm" /> : null}
          <div className="min-w-0 text-sm">
            <p className="font-medium text-slate-800">{displayCourierName}</p>
            {displayServiceName ? (
              <p className="text-xs text-slate-500">{displayServiceName}</p>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClassName}>{courierLabel}</label>
          <select
            className={inputClassName}
            value={courierId}
            disabled={loading && couriers.length === 0}
            onChange={(e) => handleCourierSelect(e.target.value)}
          >
            <option value="">
              {loading && couriers.length === 0 ? "Memuat ekspedisi…" : "Pilih ekspedisi"}
            </option>
            {courierName.trim() && !courierId && showCourierNames ? (
              <option value="" disabled>
                {courierName.trim()} (memuat…)
              </option>
            ) : null}
            {couriers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClassName}>{serviceLabel}</label>
          {knownServicePending ? (
            <input
              type="text"
              readOnly
              className={`${inputClassName} bg-slate-50`}
              value={serviceName}
            />
          ) : selectedCourier && !loading && serviceOptions.length === 0 ? (
            <input
              type="text"
              {...textNavProps}
              className={inputClassName}
              value={serviceName}
              onChange={(e) => handleServiceTextChange(e.target.value)}
              placeholder="Ketik nama layanan"
            />
          ) : (
            <select
              className={inputClassName}
              value={serviceId}
              onChange={(e) => handleServiceSelect(e.target.value)}
              disabled={!selectedCourier && !courierName.trim()}
            >
              <option value="">
                {!selectedCourier && !courierName.trim()
                  ? "Pilih ekspedisi dulu"
                  : loading && serviceOptions.length === 0 && !displayServiceName
                    ? "Memuat layanan…"
                    : "Pilih layanan"}
              </option>
              {serviceName.trim() && !serviceId && serviceOptions.length === 0 ? (
                <option value="" disabled>
                  {serviceName.trim()}
                </option>
              ) : null}
              {serviceOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          {selectedCourier && !loading && serviceOptions.length === 0 ? (
            <p className="mt-1 text-[11px] text-amber-800">
              Belum ada layanan master — ketik manual atau tambahkan di{" "}
              <Link href="/bisnis/ekspedisi" className="font-semibold underline">
                Bisnis → Ekspedisi
              </Link>
              .
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
