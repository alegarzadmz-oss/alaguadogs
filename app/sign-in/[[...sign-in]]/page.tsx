import { SignIn } from "@clerk/nextjs";
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
      <p className="auth-help">
        Usa tu correo autorizado. Si es tu primera visita, podrás crear tu cuenta
        y verificar tu correo aquí mismo.
      </p>
      <SignIn
        withSignUp
        forceRedirectUrl={path}
        signUpForceRedirectUrl={path}
        signUpUrl={`/sign-up?redirect_url=${encodeURIComponent(path)}`}
      />
    </main>
  );
}
