"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { pb } from "@/lib/pocketbase";
import { ClientResponseError } from "pocketbase";
import { canAccess } from "@/lib/rbac";
import {
  OFFICE_HOLIDAYS_COLLECTION,
  WORK_CALENDAR_DAY_ROWS,
  WORK_CALENDAR_SETTINGS_COLLECTION,
  isWorkDayKeyEnabled,
  weekMaskFromRecord,
  workCalendarSummary,
  type WeekDayMask,
} from "@/lib/work-calendar";
import { ArrowLeft, CalendarRange, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { useLocale } from "@/components/LocaleProvider";

type HolidayRow = { id: string; date: string; name: string };

function maskToPayload(mask: WeekDayMask): Record<string, boolean> {
  const keys = [
    "work_sunday",
    "work_monday",
    "work_tuesday",
    "work_wednesday",
    "work_thursday",
    "work_friday",
    "work_saturday",
  ] as const;
  const o: Record<string, boolean> = {};
  for (let i = 0; i < 7; i++) o[keys[i]] = mask[i];
  return o;
}

function initialMask(): WeekDayMask {
  return [true, true, true, true, true, true, true];
}

export default function HrWorkCalendarPage() {
  const router = useRouter();
  const { t } = useLocale();
  const current = pb.authStore.model;
  const hasAccess = !!current && canAccess(current, "/hr/work-calendar");

  const [loading, setLoading] = useState(true);
  const [savingCal, setSavingCal] = useState(false);
  const [calId, setCalId] = useState<string | null>(null);
  const [mask, setMask] = useState<WeekDayMask>(() => initialMask());
  const [holidays, setHolidays] = useState<HolidayRow[]>([]);
  const [newHolidayDate, setNewHolidayDate] = useState("");
  const [newHolidayName, setNewHolidayName] = useState("");
  const [adding, setAdding] = useState(false);
  const [officeHolidaysUnavailable, setOfficeHolidaysUnavailable] = useState(false);

  const load = useCallback(async () => {
    if (!hasAccess) return;
    setLoading(true);
    setOfficeHolidaysUnavailable(false);
    try {
      let calRows: unknown[] = [];
      try {
        calRows = await pb.collection(WORK_CALENDAR_SETTINGS_COLLECTION).getFullList({
          sort: "-updated",
          requestKey: null,
        });
      } catch (e) {
        if (e instanceof ClientResponseError && e.status === 404) {
          calRows = [];
        } else {
          throw e;
        }
      }
      const first = calRows[0] as unknown as Record<string, unknown> | undefined;
      if (first?.id) {
        setCalId(String(first.id));
        setMask(weekMaskFromRecord(first));
      } else {
        setCalId(null);
        setMask(initialMask());
      }

      let hRows: unknown[] = [];
      try {
        hRows = await pb.collection(OFFICE_HOLIDAYS_COLLECTION).getFullList({
          sort: "date",
          requestKey: null,
        });
      } catch (e) {
        if (e instanceof ClientResponseError && e.status === 404) {
          hRows = [];
          setOfficeHolidaysUnavailable(true);
        } else {
          throw e;
        }
      }
      setHolidays(
        hRows.map((r) => {
          const x = r as unknown as Record<string, unknown>;
          return {
            id: String(x.id ?? ""),
            date: String(x.date ?? "").slice(0, 10),
            name: String(x.name ?? "").trim(),
          };
        }),
      );
    } catch (e) {
      console.error(e);
      alert(t("hr.workCalendar.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [hasAccess, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleDay = (key: (typeof WORK_CALENDAR_DAY_ROWS)[number]["key"]) => {
    const idxMap: Record<string, number> = {
      work_sunday: 0,
      work_monday: 1,
      work_tuesday: 2,
      work_wednesday: 3,
      work_thursday: 4,
      work_friday: 5,
      work_saturday: 6,
    };
    const idx = idxMap[key];
    setMask((prev) => {
      const next = [...prev] as WeekDayMask;
      next[idx] = !next[idx];
      return next;
    });
  };

  const saveCalendar = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingCal(true);
    try {
      const payload = {
        name: "Default",
        is_active: true,
        ...maskToPayload(mask),
      };
      if (calId) {
        await pb.collection(WORK_CALENDAR_SETTINGS_COLLECTION).update(calId, payload);
      } else {
        const created = await pb.collection(WORK_CALENDAR_SETTINGS_COLLECTION).create(payload);
        setCalId(String((created as { id: string }).id));
      }
      alert(t("hr.workCalendar.saved"));
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : t("hr.workCalendar.saveFailed"));
    } finally {
      setSavingCal(false);
    }
  };

  const addHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    const d = newHolidayDate.trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      alert(t("hr.workCalendar.invalidDate"));
      return;
    }
    setAdding(true);
    try {
      await pb.collection(OFFICE_HOLIDAYS_COLLECTION).create({
        date: d,
        name: newHolidayName.trim() || t("hr.workCalendar.defaultHoliday"),
        is_active: true,
      });
      setNewHolidayDate("");
      setNewHolidayName("");
      await load();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : t("hr.workCalendar.addFailed"));
    } finally {
      setAdding(false);
    }
  };

  const deleteHoliday = async (id: string) => {
    if (!confirm(t("hr.workCalendar.deleteConfirm"))) return;
    try {
      await pb.collection(OFFICE_HOLIDAYS_COLLECTION).delete(id);
      await load();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : t("hr.workCalendar.deleteFailed"));
    }
  };

  if (!hasAccess) {
    return <div className="p-6 text-red-600">{t("hr.workCalendar.noAccess")}</div>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <button
        type="button"
        onClick={() => router.back()}
        className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("hr.workCalendar.back")}
      </button>

      <div>
        <h1 className="text-2xl font-bold text-slate-800">{t("hr.workCalendar.title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("hr.workCalendar.subtitle")}</p>
        <p className="mt-2 text-sm text-slate-600">
          {t("hr.workCalendar.employeesNote")}{" "}
          <Link href="/hr/employees" className="font-medium text-indigo-600 hover:underline">
            {t("hr.workCalendar.employeesLink")}
          </Link>
          .
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        </div>
      ) : (
        <>
          <form
            onSubmit={saveCalendar}
            className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <div className="flex items-start gap-3 rounded-xl border border-sky-100 bg-sky-50/80 p-4">
              <CalendarRange className="h-5 w-5 shrink-0 text-sky-700" />
              <div className="text-xs text-sky-900">
                <p className="font-medium">
                  {t("hr.workCalendar.summaryActive", { summary: workCalendarSummary(mask) })}
                </p>
                <p className="mt-1 text-sky-800">{t("hr.workCalendar.summaryHint")}</p>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {WORK_CALENDAR_DAY_ROWS.map(({ key }) => (
                <label
                  key={key}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                    checked={isWorkDayKeyEnabled(mask, key)}
                    onChange={() => toggleDay(key)}
                  />
                  <span className="font-medium text-slate-800">{t(`hr.workCalendar.days.${key}`)}</span>
                </label>
              ))}
            </div>

            <button
              type="submit"
              disabled={savingCal}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {savingCal ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {t("hr.workCalendar.saveSchedule")}
            </button>
          </form>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-800">{t("hr.workCalendar.holidaysTitle")}</h2>
            <p className="mt-1 text-xs text-slate-500">{t("hr.workCalendar.holidaysDesc")}</p>

            {officeHolidaysUnavailable ? (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                <p className="font-medium">{t("hr.workCalendar.pb404Title")}</p>
                <p className="mt-1 text-xs text-amber-900">{t("hr.workCalendar.pb404Desc")}</p>
              </div>
            ) : null}

            <form onSubmit={addHoliday} className="mt-4 flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600">{t("hr.workCalendar.dateLabel")}</label>
                <input
                  type="date"
                  value={newHolidayDate}
                  onChange={(e) => setNewHolidayDate(e.target.value)}
                  className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  required
                  disabled={officeHolidaysUnavailable}
                />
              </div>
              <div className="min-w-[180px] flex-1">
                <label className="block text-xs font-medium text-slate-600">{t("hr.workCalendar.noteLabel")}</label>
                <input
                  type="text"
                  value={newHolidayName}
                  onChange={(e) => setNewHolidayName(e.target.value)}
                  placeholder={t("hr.workCalendar.notePlaceholder")}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  disabled={officeHolidaysUnavailable}
                />
              </div>
              <button
                type="submit"
                disabled={adding || officeHolidaysUnavailable}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60"
              >
                {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {t("hr.workCalendar.add")}
              </button>
            </form>

            <ul className="mt-4 divide-y divide-slate-100">
              {holidays.length === 0 ? (
                <li className="py-3 text-sm text-slate-500">{t("hr.workCalendar.noHolidays")}</li>
              ) : (
                holidays.map((h) => (
                  <li key={h.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span>
                      <span className="font-mono tabular-nums text-slate-800">{h.date}</span>
                      {h.name ? <span className="ml-2 text-slate-600">{h.name}</span> : null}
                    </span>
                    <button
                      type="button"
                      onClick={() => void deleteHoliday(h.id)}
                      className="rounded p-1 text-red-600 hover:bg-red-50"
                      title={t("hr.workCalendar.delete")}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))
              )}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
