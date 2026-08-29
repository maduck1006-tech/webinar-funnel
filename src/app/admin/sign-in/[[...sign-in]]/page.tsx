import { SignIn } from "@clerk/nextjs";

export const metadata = { title: "관리자 로그인" };

export default function AdminSignInPage() {
  return (
    <div className="grid min-h-dvh place-items-center bg-zinc-950 px-4 py-10">
      <SignIn
        appearance={{ variables: { colorPrimary: "#ff3d2e" } }}
        fallbackRedirectUrl="/admin"
      />
    </div>
  );
}
