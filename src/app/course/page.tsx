import { notFound } from "next/navigation";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "강의실", robots: { index: false, follow: false } };
import { getDefaultCampaign } from "@/lib/campaign";
import { CourseView } from "@/components/funnel-views";

export const dynamic = "force-dynamic";

export default async function CoursePage({
  searchParams,
}: {
  searchParams: Promise<{ l?: string; lesson?: string }>;
}) {
  const campaign = await getDefaultCampaign();
  if (!campaign) notFound();
  const { l, lesson } = await searchParams;
  return <CourseView campaign={campaign} l={l} lesson={lesson} />;
}
