import { redirect } from "next/navigation";

interface SignInPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  const callbackUrl = params.callbackUrl;
  const value = Array.isArray(callbackUrl) ? callbackUrl[0] : callbackUrl;

  redirect(value ? `/login?callbackUrl=${encodeURIComponent(value)}` : "/login");
}
