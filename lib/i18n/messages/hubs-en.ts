import type { MessageTree } from "../types";

export const hubsEn: MessageTree = {
  pembelian: {
    subtitle: "Suppliers, purchase orders, bills, and goods receiving",
  },
  sdm: {
    subtitle: "Employees, attendance, schedules, leave, and payroll",
  },
  keuangan: {
    subtitle: "Receivables, payables, and cash flow overview",
    totalReceivables: "Total receivables",
    totalPayables: "Total payables",
    cashInMonth: "Cash in (this month)",
    expenseMonth: "Expenses (this month)",
    unpaidInvoices: "{count} unpaid invoices",
    unpaidBills: "{count} unpaid bills",
    paymentAlert: "Payment attention",
    alertInvoices: "{count} unpaid invoices ({amount}).",
    alertBills: "{count} unpaid purchase bills ({amount}).",
    viewReceivables: "View receivables",
    viewPayables: "View payables",
  },
  laporan: {
    subtitle: "Quick access to operational and financial reports",
    subtitleHr: "HR reports: attendance, leave, payroll, and staffing summaries",
    importMp: "MP sales import",
    importMpDesc: "Upload marketplace sales Excel",
  },
  pengaturan: {
    subtitle: "SERBA system master data and configuration",
    subtitleHr: "HR settings: roles, permissions, and notifications",
  },
};
