"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Package, X, ZoomIn } from "lucide-react";
import type { InvProduct } from "@/lib/inventory/types";
import { getProductImageUrl, PRODUCT_IMAGE_FIELDS } from "@/lib/catalog/product-images";

const BOX_SIZE = 220;

type Props = {
  product: InvProduct;
  className?: string;
};

export function ProductImageGallery({ product, className = "" }: Props) {
  const urls = PRODUCT_IMAGE_FIELDS.map((field) => ({
    field,
    thumb: getProductImageUrl(product, field, `${BOX_SIZE}x${BOX_SIZE}`),
    full: getProductImageUrl(product, field),
  })).filter((item): item is { field: typeof item.field; thumb: string; full: string } => !!item.thumb);

  const [activeIndex, setActiveIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [mounted, setMounted] = useState(false);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setActiveIndex(0);
    setLightboxOpen(false);
  }, [product.id]);

  useEffect(() => {
    if (!lightboxOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxOpen(false);
      if (urls.length <= 1) return;
      if (e.key === "ArrowLeft") {
        setLightboxIndex((i) => (i - 1 + urls.length) % urls.length);
      }
      if (e.key === "ArrowRight") {
        setLightboxIndex((i) => (i + 1) % urls.length);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [lightboxOpen, urls.length]);

  const goPrev = useCallback(() => {
    if (urls.length <= 1) return;
    setLightboxIndex((i) => (i - 1 + urls.length) % urls.length);
  }, [urls.length]);

  const goNext = useCallback(() => {
    if (urls.length <= 1) return;
    setLightboxIndex((i) => (i + 1) % urls.length);
  }, [urls.length]);

  const openLightbox = (index: number) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0]?.clientX ?? null;
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || urls.length <= 1) return;
    const endX = e.changedTouches[0]?.clientX ?? touchStartX.current;
    const delta = endX - touchStartX.current;
    if (Math.abs(delta) >= 48) {
      if (delta < 0) goNext();
      else goPrev();
    }
    touchStartX.current = null;
  };

  const active = urls[activeIndex];
  const lightbox = urls[lightboxIndex];

  const lightboxNode =
    lightboxOpen && lightbox && mounted ? (
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/92"
        onClick={() => setLightboxOpen(false)}
        role="dialog"
        aria-modal="true"
        aria-label="Preview gambar produk"
      >
        <button
          type="button"
          onClick={() => setLightboxOpen(false)}
          className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm transition hover:bg-white/30"
          aria-label="Tutup"
        >
          <X className="h-5 w-5" />
        </button>

        {urls.length > 1 ? (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                goPrev();
              }}
              className="absolute left-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm transition hover:bg-white/30 sm:left-8"
              aria-label="Gambar sebelumnya"
            >
              <ChevronLeft className="h-7 w-7" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                goNext();
              }}
              className="absolute right-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm transition hover:bg-white/30 sm:right-8"
              aria-label="Gambar berikutnya"
            >
              <ChevronRight className="h-7 w-7" />
            </button>
            <p className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/55 px-4 py-1.5 text-sm font-medium text-white backdrop-blur-sm">
              {lightboxIndex + 1} / {urls.length}
            </p>
          </>
        ) : null}

        <div
          className="flex h-full w-full items-center justify-center px-4 py-16 sm:px-16"
          onClick={(e) => e.stopPropagation()}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <img
            src={lightbox.full}
            alt=""
            className="max-h-full max-w-full select-none object-contain shadow-2xl"
            draggable={false}
          />
        </div>
      </div>
    ) : null;

  return (
    <>
      <div className={`flex flex-col items-center ${className}`}>
        {active ? (
          <button
            type="button"
            onClick={() => openLightbox(activeIndex)}
            className="group relative size-[220px] shrink-0 cursor-zoom-in overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm"
            aria-label="Perbesar gambar"
          >
            <img
              src={active.thumb}
              alt=""
              width={BOX_SIZE}
              height={BOX_SIZE}
              className="size-full object-cover"
              draggable={false}
            />
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/20">
              <ZoomIn className="h-7 w-7 text-white opacity-0 drop-shadow-md transition group-hover:opacity-100" />
            </span>
          </button>
        ) : (
          <div className="flex size-[220px] shrink-0 items-center justify-center rounded-2xl bg-slate-100">
            <Package className="h-12 w-12 text-slate-300" />
          </div>
        )}

        {urls.length > 1 ? (
          <div className="mt-3 flex justify-center gap-2">
            {urls.map((item, index) => (
              <button
                key={item.field}
                type="button"
                onClick={() => setActiveIndex(index)}
                onDoubleClick={() => openLightbox(index)}
                className={
                  "size-14 shrink-0 overflow-hidden rounded-xl border-2 bg-slate-100 transition " +
                  (index === activeIndex
                    ? "border-indigo-500 ring-2 ring-indigo-100"
                    : "border-slate-200 hover:border-slate-300")
                }
              >
                <img
                  src={item.thumb}
                  alt=""
                  className="size-full object-cover"
                  draggable={false}
                />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {mounted && lightboxNode ? createPortal(lightboxNode, document.body) : null}
    </>
  );
}
