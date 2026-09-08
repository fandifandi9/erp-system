"use client";

import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

const WEEK_LABELS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

export type LeaveBookingCalendarProps = {
  year: number;
  /** 0–11 */
  monthIndex: number;
  /** Kuota harian divisi penuh (hanya hitung cuti dengan division sama di PB — divisi lain tidak dihitung) */
  divisionFullDates: ReadonlySet<string>;
  /** Ada cuti divisi ini di tanggal itu tapi slot masih ada (belum penuh) */
  divisionPartialDates: ReadonlySet<string>;
  /** Cuti Anda sudah disetujui */
  myBookedDates: ReadonlySet<string>;
  /** Pengajuan menunggu HR */
  myPendingDates: ReadonlySet<string>;
  /** Pratinjau rentang (tanggal mulai + durasi di form), inklusif */
  previewDates: ReadonlySet<string>;
  todayYmd: string;
  /** Memuat data bulan */
  loading?: boolean;
  /** Sedang proses booking setelah klik */
  submitting?: boolean;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  /** Klik = langsung booking (parent handle) untuk tanggal yang masih bisa */
  onPickDay: (ymd: string) => void | Promise<void>;
};

function monthTitle(year: number, monthIndex: number): string {
  try {
    return new Intl.DateTimeFormat("id-ID", {
      month: "long",
      year: "numeric",
    }).format(new Date(year, monthIndex, 1));
  } catch {
    return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
  }
}

function mondayBasedWeekday(d: Date): number {
  return (d.getDay() + 6) % 7;
}

export function LeaveBookingCalendar({
  year,
  monthIndex,
  divisionFullDates,
  divisionPartialDates,
  myBookedDates,
  myPendingDates,
  previewDates,
  todayYmd,
  loading,
  submitting,
  onPrevMonth,
  onNextMonth,
  onPickDay,
}: LeaveBookingCalendarProps) {
  const first = new Date(year, monthIndex, 1);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const padBefore = mondayBasedWeekday(first);
  const interactionLocked = loading || submitting;
  const divisionHeatmap =
    divisionFullDates.size > 0 || divisionPartialDates.size > 0;

  const cells: { key: string; day: number | null; ymd: string | null }[] = [];

  for (let i = 0; i < padBefore; i++) {
    cells.push({ key: `p-${i}`, day: null, ymd: null });
  }

  const padMonth = String(monthIndex + 1).padStart(2, "0");
  for (let d = 1; d <= daysInMonth; d++) {
    const dd = String(d).padStart(2, "0");
    cells.push({
      key: `${year}-${padMonth}-${dd}`,
      day: d,
      ymd: `${year}-${padMonth}-${dd}`,
    });
  }

  const headerBusy = loading || submitting;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3 mb-4">
        <button
          type="button"
          onClick={onPrevMonth}
          disabled={interactionLocked}
          className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 transition text-slate-700 disabled:opacity-40"
          aria-label="Bulan sebelumnya"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 min-h-[40px]">
          {headerBusy && <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />}
          <h2 className="text-lg font-bold text-slate-800 capitalize text-center">
            {monthTitle(year, monthIndex)}
          </h2>
        </div>
        <button
          type="button"
          onClick={onNextMonth}
          disabled={interactionLocked}
          className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 transition text-slate-700 disabled:opacity-40"
          aria-label="Bulan berikutnya"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1.5 sm:gap-2 mb-2">
        {WEEK_LABELS.map((w) => (
          <div
            key={w}
            className="text-center text-[11px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wide py-1"
          >
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {cells.map((c) => {
          if (c.day === null || !c.ymd) {
            return <div key={c.key} className="aspect-square min-h-[2.25rem] sm:min-h-[2.75rem]" />;
          }

          const ymd = c.ymd;
          const isPast = ymd < todayYmd;
          const divisionFull = divisionFullDates.has(ymd);
          const mineApproved = myBookedDates.has(ymd);
          const minePending = myPendingDates.has(ymd) && !mineApproved;
          const mine = mineApproved || minePending;
          const partialFree =
            divisionPartialDates.has(ymd) && !divisionFull && !mine;
          const preview = previewDates.has(ymd);
          const isToday = ymd === todayYmd;

          const baseSeat =
            "relative aspect-square min-h-[2.25rem] sm:min-h-[2.75rem] rounded-lg text-sm font-medium transition flex flex-col items-center justify-center border-2 select-none ";

          let seatStyle = "";

          const disabledSeat =
            isPast || interactionLocked || divisionFull || mine;

          if (mineApproved) {
            seatStyle =
              "bg-teal-700 border-teal-800 text-white shadow-inner cursor-not-allowed";
          } else if (minePending) {
            seatStyle =
              "bg-sky-600 border-sky-800 text-white shadow-inner cursor-not-allowed";
          } else if (divisionFull) {
            seatStyle =
              "bg-indigo-600 border-indigo-700 text-white shadow-inner cursor-not-allowed";
          } else if (partialFree) {
            seatStyle =
              "bg-amber-50 border-amber-400 text-amber-950 hover:border-amber-600 hover:bg-amber-100 cursor-pointer active:scale-95 disabled:opacity-50";
          } else if (isPast) {
            seatStyle =
              "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed line-through decoration-slate-400";
          } else {
            seatStyle =
              "bg-emerald-50 border-emerald-200 text-emerald-900 hover:border-emerald-500 hover:bg-emerald-100 cursor-pointer active:scale-95 disabled:opacity-50";
          }

          if (preview && !disabledSeat && !isPast && !interactionLocked) {
            seatStyle +=
              " ring-2 ring-amber-400 ring-offset-1 ring-offset-white z-10";
          }

          if (isToday && !divisionFull && !mineApproved && !minePending && !isPast) {
            seatStyle +=
              !preview
                ? " outline outline-2 outline-blue-500 outline-offset-1"
                : "";
          }

          let label = "";
          if (mineApproved) label = "ok";
          else if (minePending) label = "HR";
          else if (divisionFull) label = "penuh";
          else if (partialFree) label = "isi";

          return (
            <button
              key={c.key}
              type="button"
              disabled={disabledSeat}
              onClick={() => void onPickDay(ymd)}
              title={
                divisionFull
                  ? `Kuota divisi penuh (rekan se-divisi) — ${ymd}`
                  : mineApproved
                    ? `Cuti disetujui — ${ymd}`
                    : minePending
                      ? `Menunggu HR — ${ymd}`
                    : partialFree
                      ? `Ada cuti rekan divisi, masih ada slot — tap untuk booking (${ymd})`
                      : isPast
                        ? "Sudah lewat"
                        : `Tap untuk booking langsung (${ymd})`
              }
              className={baseSeat + seatStyle}
            >
              <span>{c.day}</span>
              {label && (
                <span className="text-[9px] sm:text-[10px] font-normal opacity-90 leading-none mt-0.5">
                  {label}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col gap-2">
        {!divisionHeatmap && (
          <p className="text-[11px] text-slate-500">
            Warna rekan se-divisi disembunyikan agar ringan. Kuota per hari dicek oleh HR saat menyetujui pengajuan.
          </p>
        )}
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-600">
          <span className="inline-flex items-center gap-2">
            <span className="inline-block w-6 h-6 shrink-0 rounded-md bg-emerald-50 border-2 border-emerald-300" />{" "}
            Kosong — tap untuk booking
          </span>
          {divisionHeatmap && (
            <span className="inline-flex items-center gap-2">
              <span className="inline-block w-6 h-6 shrink-0 rounded-md bg-amber-50 border-2 border-amber-400" />{" "}
              Ada cuti rekan divisi (slot belum penuh)
            </span>
          )}
          <span className="inline-flex items-center gap-2">
            <span className="inline-block w-6 h-6 shrink-0 rounded-md bg-teal-700 border-2 border-teal-800" />{" "}
            Disetujui
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="inline-block w-6 h-6 shrink-0 rounded-md bg-sky-600 border-2 border-sky-800" />{" "}
            Menunggu HR
          </span>
          {divisionHeatmap && (
            <span className="inline-flex items-center gap-2">
              <span className="inline-block w-6 h-6 shrink-0 rounded-md bg-indigo-600 border-2 border-indigo-700" />{" "}
              Penuh — kuota divisi/hari terpakai rekan se-divisi (divisi lain tidak dihitung)
            </span>
          )}
          <span className="inline-flex items-center gap-2">
            <span className="inline-flex w-6 h-6 shrink-0 rounded-md bg-emerald-50 border-2 border-amber-400 ring-2 ring-amber-400 ring-offset-1" />{" "}
            Pratinjau durasi di form
          </span>
        </div>
      </div>
    </div>
  );
}
