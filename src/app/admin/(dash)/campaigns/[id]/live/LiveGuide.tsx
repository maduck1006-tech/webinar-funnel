import Link from "next/link";
import { Card } from "@/components/admin-ui";

/**
 * 토스식 온보딩: 라이브 캠페인을 처음 켠 사람에게
 * "지금 뭘 해야 하는지"를 한 화면에서 순서대로 알려준다.
 */

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3.5">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black text-[13px] font-bold text-white">
        {n}
      </span>
      <div className="min-w-0 flex-1 pb-1">
        <p className="text-sm font-semibold text-zinc-900">{title}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-zinc-500">
          {children}
        </p>
      </div>
    </li>
  );
}

/** 회차가 아직 없을 때: 전체 준비 흐름을 3단계로 */
export function LiveEmptyGuide({
  campaignId,
  isLiveFunnel,
}: {
  campaignId: string;
  isLiveFunnel: boolean;
}) {
  return (
    <Card>
      <div className="mx-auto max-w-xl py-4">
        <p className="text-lg font-bold text-zinc-900">
          라이브 캠페인, 이렇게 시작해요
        </p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-500">
          방송은 유튜브 라이브·줌에서 하고, 신청·문자·참석 기록은 여기서
          관리해요. 딱 3단계면 됩니다.
        </p>

        {!isLiveFunnel && (
          <p className="mt-4 rounded-xl bg-amber-50 p-3 text-[12.5px] leading-relaxed text-amber-700">
            지금 이 캠페인의 <b>퍼널 종류</b>가 &lsquo;라이브 웨비나 신청&rsquo;이
            아니에요.{" "}
            <Link
              href={`/admin/campaigns/${campaignId}/settings`}
              className="font-semibold underline"
            >
              캠페인 설정
            </Link>
            에서 종류를 바꾸면 회차를 만들 수 있어요.
          </p>
        )}

        <ol className="mt-5 space-y-4">
          <Step n={1} title="캠페인 설정에서 회차를 추가해요">
            방송 날짜와 시간을 넣으면 회차가 생겨요. 유튜브·줌 링크는 방송 직전에
            넣어도 괜찮아요.
          </Step>
          <Step n={2} title="신청자가 자동으로 회차에 등록돼요">
            랜딩에서 신청한 사람은 가장 임박한 예정 회차에 알아서 들어가요. 여기서
            등록 인원이 실시간으로 쌓이는 걸 볼 수 있어요.
          </Step>
          <Step n={3} title="방송 2일 전부터 순서대로 문자를 보내요">
            자리 잡기 → 곧 시작 → 지금 LIVE → 놓친 분께. 한 번 알려서는 안
            와요. 이 4단계로 밀어야 참석률이 올라가요. 문구는 미리 다 채워져
            있어요.
          </Step>
        </ol>

        <Link
          href={`/admin/campaigns/${campaignId}/settings`}
          className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-black py-3 text-sm font-bold text-white sm:w-auto sm:px-8"
        >
          캠페인 설정에서 회차 만들기
        </Link>
      </div>
    </Card>
  );
}

/** 회차가 있을 때: 이 화면을 어떻게 쓰는지 요약 */
export function LiveRhythmGuide() {
  const rows = [
    ["D-2", "자리 잡기", "올 사람을 미리 손들게 만들어요. 참석률의 절반이 여기서 갈려요."],
    ["D-1~1시간 전", "곧 시작", "기대감을 올리고, 다시보기 마감으로 살짝 압박해요."],
    ["시작 직후", "지금 LIVE", "앞부분이 제일 중요하다고 알려서 바로 들어오게 해요."],
    ["시작 15분 후", "놓친 분께", "아직 안 들어온 사람만 콕 집어 다시 불러요."],
  ];
  return (
    <Card className="mb-5">
      <p className="text-sm font-bold text-zinc-900">이 화면 쓰는 법</p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-zinc-500">
        회차를 고르고, 아래 순서대로 문자를 보내면 돼요. 보내는 사람 화면은 항상
        오른쪽에서 미리 볼 수 있어요.
      </p>
      <ul className="mt-3 divide-y divide-zinc-100 text-[13px]">
        {rows.map(([when, label, gist], i) => (
          <li key={label} className="flex gap-3 py-2.5">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-zinc-100 text-[10px] font-bold text-zinc-500">
              {i + 1}
            </span>
            <span className="w-28 shrink-0 text-[11px] font-semibold text-zinc-400">
              {when}
            </span>
            <span className="w-20 shrink-0 font-semibold text-zinc-900">
              {label}
            </span>
            <span className="min-w-0 flex-1 text-zinc-500">{gist}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
