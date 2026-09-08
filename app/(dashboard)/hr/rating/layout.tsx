import { RatingModuleNav } from "@/components/hr/RatingModuleNav";

export default function HrRatingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <RatingModuleNav />
      {children}
    </div>
  );
}
