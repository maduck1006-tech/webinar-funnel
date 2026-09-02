import { CourseView } from "@/components/funnel-views";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "강의실", robots: { index: false, follow: false } };
import { resolveOr404 } from "../_resolve";

export const dynamic = "force-dynamic";

export default async function CampaignCourse({
  params,
  searchParams,
}: {
  params: Promise<{ campaign: string }>;
  searchParams: Promise<{ l?: string; lesson?: string }>;
}) {
  const { campaign: slug } = await params;
  const campaign = await resolveOr404(slug, "/course");
  const { l, lesson } = await searchParams;
  return <CourseView campaign={campaign} l={l} lesson={lesson} />;
}
