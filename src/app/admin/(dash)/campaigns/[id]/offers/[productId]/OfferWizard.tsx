"use client";

import { useState } from "react";
import {
  Choice,
  SummaryRow,
  Wizard,
  type WizardStep,
} from "../../../../_wizard";
import { saveCampaignOffers } from "../../../actions";

export type Opt = { id: string; name: string; price: number };

const won = (n: number) => n.toLocaleString("ko-KR") + "원";

export function OfferWizard({
  campaignId,
  productId,
  productName,
  productPrice,
  options,
  initial,
}: {
  campaignId: string;
  productId: string;
  productName: string;
  productPrice: number;
  options: Opt[];
  initial: {
    bumpProductId: string | null;
    bumpDescription: string | null;
    upsellProductId: string | null;
    downsellProductId: string | null;
  };
}) {
  const [useBump, setUseBump] = useState(initial.bumpProductId ? "y" : "n");
  const [bumpId, setBumpId] = useState(initial.bumpProductId ?? "");
  const [bumpDesc, setBumpDesc] = useState(initial.bumpDescription ?? "");
  const [useUpsell, setUseUpsell] = useState(
    initial.upsellProductId ? "y" : "n",
  );
  const [upsellId, setUpsellId] = useState(initial.upsellProductId ?? "");
  const [useDown, setUseDown] = useState(initial.downsellProductId ? "y" : "n");
  const [downId, setDownId] = useState(initial.downsellProductId ?? "");

  // 같은 상품이 범프이면서 업셀이 되는 걸 막는다 (뒤로 가서 앞 답을 바꾼 경우)
  function pickBump(v: string) {
    setBumpId(v);
    if (upsellId === v) {
      setUpsellId("");
      setDownId("");
    } else if (downId === v) setDownId("");
  }
  function pickUpsell(v: string) {
    setUpsellId(v);
    if (downId === v) setDownId("");
  }

  const byId = (id: string) => options.find((o) => o.id === id);
  const toOpts = (list: Opt[]) =>
    list.map((o) => ({
      v: o.id,
      label: o.name,
      desc: won(o.price),
    }));

  const yesNo = (yes: string, no: string) => [
    { v: "y", label: yes },
    { v: "n", label: no },
  ];

  const steps: WizardStep[] = [
    {
      key: "bump",
      title: "결제창에 소액 상품을 하나 더 붙일까요?",
      sub: (
        <>
          <b>오더 범프</b>입니다. {productName} 결제창 안에 체크박스로 뜨고,
          체크하면 <b>같은 결제에 합산</b>됩니다. 손님이 화면을 옮기지 않아서
          가장 부담 없이 객단가가 올라가요.
        </>
      ),
      body: (
        <Choice
          value={useBump}
          onChange={setUseBump}
          options={yesNo("네, 붙일게요", "아니요, 넘어갈게요")}
        />
      ),
    },
  ];

  if (useBump === "y") {
    steps.push({
      key: "bumpPick",
      title: "어떤 상품을 붙일까요?",
      sub: `본상품(${won(productPrice)})보다 훨씬 싼 걸 고르는 게 좋아요.`,
      ok: !!bumpId,
      body: (
        <>
          <Choice value={bumpId} onChange={pickBump} options={toOpts(options)} />
          <label className="mt-4 block">
            <span className="text-[12px] font-medium text-zinc-500">
              체크박스 옆에 뜰 설득 문구 (비우면 상품 설명)
            </span>
            <input
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              placeholder="예: 실전 템플릿 30종도 함께 받기"
              value={bumpDesc}
              onChange={(e) => setBumpDesc(e.target.value)}
            />
          </label>
        </>
      ),
    });
  }

  steps.push({
    key: "upsell",
    title: "결제 직후에 다른 상품을 제안할까요?",
    sub: (
      <>
        <b>원클릭 업셀(OTO)</b>입니다. 결제가 끝난 바로 그 화면에서 딱 한 번
        제안합니다. 이미 지갑을 연 직후라 전환이 가장 높아요.
      </>
    ),
    body: (
      <Choice
        value={useUpsell}
        onChange={setUseUpsell}
        options={yesNo("네, 제안할게요", "아니요, 바로 시청 화면으로")}
      />
    ),
  });

  if (useUpsell === "y") {
    steps.push({
      key: "upsellPick",
      title: "무엇을 제안할까요?",
      sub: "보통 본상품보다 한 단계 비싼(또는 깊은) 상품을 씁니다.",
      ok: !!upsellId,
      body: (
        <Choice
          value={upsellId}
          onChange={pickUpsell}
          options={toOpts(options.filter((o) => o.id !== bumpId))}
        />
      ),
    });

    steps.push({
      key: "down",
      title: "업셀을 거절하면 더 싼 대안을 보여줄까요?",
      sub: (
        <>
          <b>다운셀</b>입니다. &quot;안 살게요&quot;를 누른 사람에게 값이 더 낮은
          버전을 한 번 더 제안합니다. 그냥 보내는 것보다 낫습니다.
        </>
      ),
      body: (
        <Choice
          value={useDown}
          onChange={setUseDown}
          options={yesNo("네, 보여줄게요", "아니요, 그냥 보낼게요")}
        />
      ),
    });

    if (useDown === "y") {
      steps.push({
        key: "downPick",
        title: "어떤 대안을 보여줄까요?",
        sub: "업셀보다 싼 상품이어야 의미가 있습니다.",
        ok: !!downId,
        body: (
          <Choice
            value={downId}
            onChange={setDownId}
            options={toOpts(
              options.filter((o) => o.id !== bumpId && o.id !== upsellId),
            )}
          />
        ),
      });
    }
  }

  const finalBump = useBump === "y" ? bumpId : "";
  const finalUpsell = useUpsell === "y" ? upsellId : "";
  const finalDown = useUpsell === "y" && useDown === "y" ? downId : "";

  steps.push({
    key: "review",
    title: "이대로 저장할까요?",
    body: (
      <>
        <div className="space-y-2 rounded-xl bg-zinc-50 p-3 text-[13px] leading-relaxed text-zinc-700">
          <p>
            손님이 <b>{productName}</b> 결제창을 엽니다.
          </p>
          {/* 조사는 괄호 안 '…원'에 붙는다 → 받침 있음 → 이/을 고정 */}
          {finalBump ? (
            <p>
              → 체크박스로 <b>{byId(finalBump)?.name}</b>(
              {won(byId(finalBump)?.price ?? 0)})이 함께 뜨고, 체크하면 합산
              결제됩니다.
            </p>
          ) : (
            <p className="text-zinc-400">→ 추가 체크박스 없음</p>
          )}
          {finalUpsell ? (
            <p>
              → 결제가 끝나면 <b>{byId(finalUpsell)?.name}</b>(
              {won(byId(finalUpsell)?.price ?? 0)}) 제안 화면이 한 번 뜹니다.
            </p>
          ) : (
            <p className="text-zinc-400">→ 결제 후 바로 시청 화면으로</p>
          )}
          {finalDown ? (
            <p>
              → 거절하면 <b>{byId(finalDown)?.name}</b>(
              {won(byId(finalDown)?.price ?? 0)})을 한 번 더 보여줍니다.
            </p>
          ) : finalUpsell ? (
            <p className="text-zinc-400">→ 거절하면 그대로 시청 화면으로</p>
          ) : null}
        </div>
        <dl className="mt-3 divide-y rounded-xl border text-sm">
          <SummaryRow k="오더 범프" val={byId(finalBump)?.name ?? "없음"} />
          <SummaryRow k="업셀" val={byId(finalUpsell)?.name ?? "없음"} />
          <SummaryRow k="다운셀" val={byId(finalDown)?.name ?? "없음"} />
        </dl>
        <p className="mt-3 text-[12px] leading-relaxed text-zinc-400">
          이 설정은 <b>이 캠페인에서만</b> 적용됩니다. 같은 상품을 다른
          캠페인에서 다르게 쓸 수 있어요.
        </p>
      </>
    ),
  });

  return (
    <Wizard
      steps={steps}
      action={saveCampaignOffers}
      submitLabel="저장하기"
      pendingLabel="저장 중…"
      hidden={{
        campaignId,
        productId,
        bumpProductId: finalBump,
        bumpDescription: finalBump ? bumpDesc : "",
        upsellProductId: finalUpsell,
        downsellProductId: finalDown,
      }}
    />
  );
}
