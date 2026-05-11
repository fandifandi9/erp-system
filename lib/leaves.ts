import { pb } from "@/lib/pocketbase";

/** Escape double quotes in PocketBase filter string values */
function escFilter(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/* ========================
   SETTINGS
======================== */
export async function getSettings() {
  const list = await pb.collection("settings_hr").getFullList({
    requestKey: null,
  });

  if (!list.length) {
    return {
      max_leave_per_month: 3,
      max_people_per_day: 2,
    };
  }

  return list[0];
}

/* ========================
   PROFILE (AUTO CREATE)
======================== */
export async function getProfile(userId: string) {
  try {
    return await pb.collection("profiles")
      .getFirstListItem(`user="${userId}"`);
  } catch {
    try {
      return await pb.collection("profiles").create({
        user: userId,
        salary: 0,
        department: "-",
        position: "-",
      });
    } catch {
      return await pb.collection("profiles")
        .getFirstListItem(`user="${userId}"`);
    }
  }
}

/* ========================
   COUNT USER LEAVE / MONTH
======================== */
export async function countUserLeaveInMonth(userId: string, month: string) {
  const start = `${month}-01`;

  const endDate = new Date(`${month}-01`);
  endDate.setMonth(endDate.getMonth() + 1);
  endDate.setDate(0);

  const end = endDate.toISOString().split("T")[0];

  const uid = escFilter(userId);
  const st = escFilter(start);
  const en = escFilter(end);

  const hybridFilter = `user="${uid}" && (status="pending" || status="approved") && (
    (start_date<="${en}" && end_date>="${st}") ||
    (date>="${st}" && date<="${en}")
  )`;
  const legacyFilter = `user="${uid}" && (status="pending" || status="approved") && (date>="${st}" && date<="${en}")`;

  try {
    const list = await pb.collection("leave_requests").getFullList({
      filter: hybridFilter,
      requestKey: null,
    });
    return list.length;
  } catch {
    const list = await pb.collection("leave_requests").getFullList({
      filter: legacyFilter,
      requestKey: null,
    });
    return list.length;
  }
}

/* ========================
   COUNT DIVISION / DATE
======================== */
export async function countDivisionLeaveOnDate(division: string, date: string) {
  if (!division) return 0;

  const d = escFilter(date);
  const div = escFilter(division);

  const hybridFilter = `(division="${div}" || devision="${div}") && (status="pending" || status="approved") && (
    (start_date<="${d}" && end_date>="${d}") ||
    (date>="${d} 00:00:00" && date<="${d} 23:59:59")
  )`;
  const legacyFilter = `(division="${div}" || devision="${div}") && (status="pending" || status="approved") && (date>="${d} 00:00:00" && date<="${d} 23:59:59")`;

  try {
    const list = await pb.collection("leave_requests").getFullList({
      filter: hybridFilter,
      requestKey: null,
    });
    return list.length;
  } catch {
    const list = await pb.collection("leave_requests").getFullList({
      filter: legacyFilter,
      requestKey: null,
    });
    return list.length;
  }
}

/* ========================
   CHECK DUPLICATE BOOKING
======================== */
export async function isUserAlreadyBooked(userId: string, date: string) {
  const uid = escFilter(userId);
  const d = escFilter(date);
  const hybrid = `user="${uid}" && status!="rejected" && (
    (start_date<="${d}" && end_date>="${d}") ||
    (date>="${d} 00:00:00" && date<="${d} 23:59:59")
  )`;
  const legacy = `user="${uid}" && status!="rejected" && (date>="${d} 00:00:00" && date<="${d} 23:59:59")`;

  try {
    await pb.collection("leave_requests").getFirstListItem(hybrid, {
      requestKey: null,
    });
    return true;
  } catch {
    try {
      await pb.collection("leave_requests").getFirstListItem(legacy, {
        requestKey: null,
      });
      return true;
    } catch {
      return false;
    }
  }
}