import fs from "fs";

const p = "app/(dashboard)/pengaturan/organisasi/page.tsx";
let s = fs.readFileSync(p, "utf8");

// Fix tree load effect
s = s.replace(
  /useEffect\(\(\) => \{\r?\n\s*if \(!hasAccess \|\| modeLoading\) return;\r?\n\s*if \(!modeConfigured\) \{\r?\n\s*setLoading\(false\);\r?\n\s*setTree\(\[\]\);\r?\n\s*return;\r?\n\s*\}\r?\n\s*if \(orgMode === "GROUP"\) \{\r?\n\s*void loadTree\("", "GROUP"\);\r?\n\s*return;\r?\n\s*\}\r?\n\s*if \(companyId\) void loadTree\(companyId, "COMPANY"\);\r?\n\s*\}, \[companyId, hasAccess, loadTree, modeConfigured, modeLoading, orgMode\]\);/,
  `useEffect(() => {
    if (!hasAccess || modeLoading) return;
    void loadTree("", "ALL");
  }, [hasAccess, loadTree, modeLoading]);`,
);

// createPosition company
s = s.replace(
  /const targetCompanyId =\r?\n\s*orgMode === "GROUP"\r?\n\s*\? companyId \|\| companies\[0\]\?\.id \|\| ""\r?\n\s*: companyId;/,
  `const targetCompanyId = companyId || companies[0]?.id || "";`,
);

// Find reloadTree / switchEntity with orgMode
s = s.replace(/orgMode === "GROUP"/g, "true");
s = s.replace(/orgMode === "COMPANY"/g, "false");

// Replace mode banner block with Management context
s = s.replace(
  /\{!modeLoading \? \(\r?\n\s*<div className="space-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">[\s\S]*?\<\/div>\r?\n\s*\) : null\}\r?\n\r?\n\s*\{!modeLoading && !modeConfigured && !isOwner \? \([\s\S]*?\) : null\}\r?\n\r?\n\s*\{!modeLoading && !modeConfigured && isOwner \? \([\s\S]*?\) : null\}\r?\n/,
  `{!modeLoading ? (
        <div className="space-y-1 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">
            {t("pengaturan.flexOrg.orgStructure")}
          </h2>
          <p className="text-xs text-slate-500">
            {t("pengaturan.flexOrg.orgPageContextHint")}
          </p>
          <p className="text-sm text-slate-700">
            {t("pengaturan.flexOrg.entityCount", { count: companies.length })}
          </p>
          {isOwner ? (
            <Link
              href="/pengaturan/manajemen"
              className="inline-flex text-sm font-medium text-sky-700 hover:underline"
            >
              {t("pengaturan.flexOrg.managementTitle")} →
            </Link>
          ) : null}
        </div>
      ) : null}

`,
);

// Entity filter bar — always show optional filter + combined context
s = s.replace(
  /\{orgMode === "COMPANY" \? \(\r?\n\s*<label className="text-sm text-slate-600">[\s\S]*?Konteks: Gabung Multi-Company \(GROUP\)\r?\n\s*<\/span>\r?\n\s*\)\}/,
  `<span className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">
            {t("pengaturan.flexOrg.orgPageHierarchyContext")}
          </span>
        <label className="text-sm text-slate-600">
          Filter entitas{" "}
          <select
            value={companyId}
            onChange={(e) => {
              const v = e.target.value;
              setCompanyId(v);
              void loadTree(v || "", "ALL");
            }}
            className="ml-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="">Semua entitas</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.company_name}
              </option>
            ))}
          </select>
        </label>`,
);

// After true/false replacements, fix broken conditionals from orgMode === "GROUP" -> true
// Scope display: was {true ? ( ... ) : null} which is fine
// COMPANY filter became {false ? ... which we tried to replace

// Reset messages
s = s.replace(
  /Anda dapat mengubah mode Gabung \/ Pisah di panel Mode di halaman ini\./g,
  "Hierarki dapat disusun ulang sesuai kebutuhan.",
);
s = s.replace(
  /Setelah itu Anda bisa mengubah mode \(Gabung ↔ Pisah Per Company\)\./g,
  "",
);

// Remove leftover orgMode identifier if any
if (s.includes("orgMode")) {
  console.log("WARNING still has orgMode");
}

fs.writeFileSync(p, s);
console.log("done");
console.log("orgMode count", (s.match(/\borgMode\b/g) || []).length);
console.log("Gabung", s.includes("Gabung"));
console.log("orgPageContextHint", s.includes("orgPageContextHint"));
