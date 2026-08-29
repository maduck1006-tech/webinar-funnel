import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { campaignPages, type PageType } from "@/db/schema";
import { getCampaignPageData, type Variant } from "@/lib/campaign";
import { FUNNEL_PAGE_TYPES, PAGE_META } from "@/lib/flow-types";

// TODO(P2): Clerk 관리자 인증 (지금은 middleware Basic Auth)

async function nextVersion(
  campaignId: string,
  pageType: PageType,
  variant: Variant,
) {
  const [latest] = await db
    .select({ version: campaignPages.version })
    .from(campaignPages)
    .where(
      and(
        eq(campaignPages.campaignId, campaignId),
        eq(campaignPages.pageType, pageType),
        eq(campaignPages.variant, variant),
      ),
    )
    .orderBy(desc(campaignPages.version))
    .limit(1);
  return (latest?.version ?? 0) + 1;
}

async function unpublishCurrent(
  campaignId: string,
  pageType: PageType,
  variant: Variant,
) {
  await db
    .update(campaignPages)
    .set({ published: false })
    .where(
      and(
        eq(campaignPages.campaignId, campaignId),
        eq(campaignPages.pageType, pageType),
        eq(campaignPages.variant, variant),
        eq(campaignPages.published, true),
      ),
    );
}

function assertType(t: string): t is PageType {
  return (FUNNEL_PAGE_TYPES as readonly string[]).includes(t);
}
function variantOf(req: Request): Variant {
  return new URL(req.url).searchParams.get("variant") === "b" ? "b" : "a";
}

/** 빌더 저장/발행 */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string; type: string }> },
) {
  const { id, type } = await params;
  if (!assertType(type))
    return NextResponse.json({ error: "unknown page type" }, { status: 404 });
  const variant = variantOf(req);

  const body = await req.json().catch(() => null);
  if (!body?.data)
    return NextResponse.json({ error: "data required" }, { status: 400 });
  const publish = Boolean(body.publish);

  const version = await nextVersion(id, type, variant);
  if (publish) await unpublishCurrent(id, type, variant);
  await db.insert(campaignPages).values({
    campaignId: id,
    pageType: type,
    variant,
    version,
    published: publish,
    data: body.data,
  });

  return NextResponse.json({ ok: true, version });
}

/** 흐름도에서 블록 링크(이동 대상) 수정 + 발행 (variant a 만) */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; type: string }> },
) {
  const { id, type } = await params;
  if (!assertType(type))
    return NextResponse.json({ error: "unknown page type" }, { status: 404 });
  const variant = variantOf(req);

  const body = await req.json().catch(() => null);
  const blockId: string | undefined = body?.blockId;
  if (!blockId)
    return NextResponse.json({ error: "blockId required" }, { status: 400 });

  const targetType: string = body?.targetType ?? "";
  const targetPath =
    targetType && assertType(targetType)
      ? PAGE_META[targetType].path
      : (body?.rawTarget ?? "#");

  const data = structuredClone(
    await getCampaignPageData(id, type, variant),
  ) as {
    content?: { type: string; props: Record<string, unknown> & { id: string } }[];
  };
  const block = (data.content ?? []).find((b) => b.props.id === blockId);
  if (!block)
    return NextResponse.json({ error: "block not found" }, { status: 404 });
  if (block.type === "LeadForm") block.props.nextPath = targetPath;
  else block.props.href = targetPath;

  const version = await nextVersion(id, type, variant);
  await unpublishCurrent(id, type, variant);
  await db.insert(campaignPages).values({
    campaignId: id,
    pageType: type,
    variant,
    version,
    published: true,
    data,
  });

  return NextResponse.json({ ok: true, targetPath });
}
