import { AuthForm } from "@/components/auth-form";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; email?: string }>;
}) {
  const params = await searchParams;
  return <AuthForm mode="sign-in" returnTo={params.next} initialEmail={params.email ?? ""} />;
}
