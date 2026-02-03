import { redirect } from "next/navigation";
import { getServerAuth } from "@/lib/server-auth";
import { isAdmin } from "@/lib/admin-auth";

export default async function AdminLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const session = await getServerAuth();
  
  // Check if user is admin
  if (!session?.user?.email || !isAdmin(session.user.email)) {
    redirect("/app");
  }
  
  return <>{children}</>;
}
