import type { MessageTree } from "../types";

export const designEn: MessageTree = {
  design: {
    empty: {
      title: "No data yet",
      description: "Data will appear here when available.",
    },
    error: {
      title: "Something went wrong",
      retry: "Try again",
    },
    permission: {
      title: "Access denied",
      description: "Your account does not have permission to view this page.",
    },
    pagination: {
      showing: "Showing {from}–{to} of {total}",
      prev: "Previous page",
      next: "Next page",
    },
    filter: {
      search: "Search…",
      reset: "Reset",
    },
    form: {
      cancel: "Cancel",
      save: "Save",
    },
    table: {
      actions: "Actions",
      selectAll: "Select all",
    },
    loading: "Loading…",
  },
  profile: {
    tabs: {
      ringkasan: "Summary",
      pribadi: "Personal",
      dokumen: "Documents",
      keamanan: "Security",
    },
    saveChanges: "Save changes",
    saving: "Saving…",
    updatePassword: "Update password",
    changePhoto: "Change photo",
    removePhoto: "Remove photo",
    emailLogin: "Email / Login",
    saveSuccess: "Changes saved successfully",
    saveError: "Failed to save changes",
    sections: {
      personalData: "Personal data",
      contact: "Contact",
    },
    preferences: {
      title: "Account Preferences",
      language: "Language",
      languageDesc: "Your choice is saved to your account and applies across the app.",
    },
  },
  workspace: {
    desk: {
      title: "Workspace",
      subtitle:
        "Access work, attendance, payroll, company information, and modules relevant to you.",
    },
    hr: {
      dashboard: {
        title: "HR / People",
        subtitle: "HR Desktop operational workspace",
      },
      section: {
        workspace: "Workspace",
        sdm: "People",
        attendanceWork: "Attendance & Work",
        reports: "Reports",
      },
      shellLabel: "Desktop Workspace",
  mobileAccess: "Mobile Access",
  mobileAccessHint: "Operational companion — new tab; Desktop workspace stays here.",
      action: {
        dashboard: "Dashboard",
        employees: "Employees",
        org: "Organization",
        recruitment: "Recruitment",
        attendance: "Attendance",
        leave: "Leave",
        overtime: "Overtime",
        izinOff: "Off",
        field: "Field Activity",
        findings: "Findings",
        rating: "Rating",
        reports: "HR Reports",
        suspicious: "Suspicious Attendance",
        schedule: "Work Schedule",
        myAttendance: "My Attendance",
        myLeave: "My Leave",
        myOvertime: "My Overtime",
        myIzinOff: "My Off",
        mySubmissions: "My Submissions",
      },
    },
    staff: {
      title: "Workspace",
      subtitle:
        "Access work, attendance, payroll, company information, and modules relevant to you.",
      greeting: {
        morning: "Good morning, {name}.",
        afternoon: "Good afternoon, {name}.",
        evening: "Good evening, {name}.",
      },
      rail: {
        today: "Today",
        status: "Attendance status",
        schedule: "Work schedule",
        workingDay: "Day status",
        checkIn: "Check-in",
        checkOut: "Check-out",
        notCheckedIn: "Not checked in",
        working: "Working",
        done: "Done",
        dayOff: "Day off",
        workingDayYes: "Working day",
        noSchedule: "Not assigned",
        agenda: "Agenda",
        agendaEmpty: "No upcoming items",
        agendaEmptyDesc: "Approved leave or overtime will appear here.",
        leavePending: "Leave — pending HR",
        leaveApproved: "Leave approved",
        kindLeave: "Leave",
        kindOvertime: "Overtime",
        quickActions: "Quick actions",
      },
      noAccess: {
        title: "Limited access",
        desc: "Use Profile from your name menu in the top right.",
      },
      sidebar: {
        dashboard: "Dashboard",
      },
      dashboard: {
        title: "Dashboard",
        subtitle: "Here is a summary of activity and important information for you.",
        kpi: {
          attendance: "Attendance Status",
          activeRequests: "Active Requests",
          activeRequestsSub: "Leave & overtime pending",
          overtimeMonth: "Overtime This Month",
          overtimeMonthSub: "Approved hours",
          hours: "hrs",
          payslip: "Payslip",
          payslipUnavailable: "Not available",
          payslipAvailable: "Latest slip available",
          dayOff: "Day off",
        },
        summary: {
          attendance: "Attendance Summary",
          period: "Period",
          present: "Present",
          leave: "Leave",
          sick: "Sick",
          pending: "Not checked in",
          alpha: "Absent",
          required: "Required work days",
          totalDays: "Total days",
          dataAsOf: "Data as of {date}",
          emptyTitle: "No summary yet",
          emptyDesc: "This month's attendance summary will appear when available.",
        },
        trend: {
          title: "Attendance Trend",
          present: "Present",
          leave: "Leave",
          sick: "Sick",
          alpha: "Absent",
          late: "Late",
          unknown: "—",
          emptyTitle: "No trend yet",
          emptyDesc: "Attendance history will be shown here.",
        },
        activity: {
          title: "Recent Activity",
          checkIn: "Today's check-in",
          leave: "Leave request",
          payslip: "Payslip available",
          emptyTitle: "No activity yet",
          emptyDesc: "Leave, overtime, and notifications will appear here.",
        },
        shortcuts: {
          title: "Quick Shortcuts",
          leave: "Request Leave",
          overtime: "Request Overtime",
          attendance: "Check-in / Attendance",
          payroll: "View Payslip",
          reports: "Reports & Findings",
          emptyTitle: "No shortcuts",
          emptyDesc: "Shortcuts appear based on modules you can access.",
        },
      },
      desk: {
        empty: "No additional modules for your role. Modules appear based on your permissions.",
        section: {
          priority: "Priority / Needs Action",
          fullModule: "Module Access",
          noTasks: "No tasks need action right now.",
        },
        module: {
          hr: "HR",
          finance: "Finance",
          warehouse: "Warehouse",
        },
        open: {
          hr: "Open Full HR",
          finance: "Open Finance",
          warehouse: "Open Warehouse",
        },
        hr: {
          recruitmentApprove: {
            title: "New Recruitment",
            desc: "Organization appointments awaiting your approval",
          },
          leaveReview: {
            title: "Review Leave",
            desc: "Leave requests pending approval",
          },
          overtimeReview: {
            title: "Overtime Approval",
            desc: "Overtime requests pending approval",
          },
          attendanceReview: {
            title: "Review Attendance",
            desc: "Attendance anomalies to review",
          },
          findings: {
            title: "HR Findings",
            desc: "Latest reports and findings",
          },
          employees: {
            title: "Manage Employees",
            desc: "Employee administration access",
          },
        },
        finance: {
          invoice: {
            title: "Invoice",
            desc: "Receivables and documents to process",
          },
          payment: {
            title: "Payments",
            desc: "Cash & bank — pending transactions",
          },
          reconciliation: {
            title: "Reconciliation",
            desc: "Reconciliation items to review",
          },
        },
        warehouse: {
          opname: {
            title: "Stock Opname",
            desc: "Warehouse stock count sessions",
          },
          transfer: {
            title: "Warehouse Transfer",
            desc: "Inter-location stock moves",
          },
          receiving: {
            title: "Goods Receipt",
            desc: "Inbound warehouse receiving",
          },
          picking: {
            title: "Picking",
            desc: "Order picking preparation",
          },
        },
      },
      section: {
        personal: "Personal",
        attendance: "Attendance & Work",
        payroll: "Payroll",
        company: "Company Information",
        desk: "Workspace",
      },
      action: {
        profile: {
          title: "Profile",
          desc: "Personal data, employment, and documents",
        },
        reports: {
          title: "Reports & Findings",
          desc: "Submit and track reports to HR",
        },
        mySubmissions: {
          title: "My Submissions",
          desc: "Status of leave, overtime, off, and field activity",
        },
        attendance: {
          title: "Attendance",
          desc: "Web check-in/out, schedule & today's status",
        },
        leave: {
          title: "Leave",
          desc: "Requests and leave history",
        },
        overtime: {
          title: "Overtime",
          desc: "Assignments & overtime requests",
        },
        izinOff: {
          title: "Off",
          desc: "Day-off / absence request (not annual leave)",
        },
        field: {
          title: "Field activity",
          desc: "Meetings, visits, business trips",
        },
        payroll: {
          title: "Payslips",
          desc: "Approved period slips — confidential",
        },
        policies: {
          title: "HR Policies & Info",
          desc: "Late policy, leave, payroll deductions",
        },
        holidays: {
          title: "Calendar & Holidays",
          desc: "National and company holidays",
        },
      },
    },
  },
};
