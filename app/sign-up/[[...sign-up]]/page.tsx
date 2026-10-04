import { SignUp } from "@clerk/nextjs";
import { returnPath } from "@/lib/return-path";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const path = returnPath((await searchParams).redirect_url);
  return (
    <main className="auth-page">
      <img
        src="/brand/alagua-dogs-logo.jpg"
        alt="AL’AGUA DOGS Pets Spa"
        width="180"
        height="180"
      />
      <SignUp
        forceRedirectUrl={path}
        signInForceRedirectUrl={path}
        signInUrl={`/sign-in?redirect_url=${encodeURIComponent(path)}`}
      />
    </main>
  );
}
