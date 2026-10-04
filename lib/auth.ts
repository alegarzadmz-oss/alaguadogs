import { auth, currentUser } from "@clerk/nextjs/server";

export type PortalUser = {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
};
export async function getPortalUser(): Promise<PortalUser | null> {
  const session = await auth();
  if (!session.userId) return null;
  const user = await currentUser();
  const email = user?.emailAddresses.find(
    (e) =>
      e.id === user.primaryEmailAddressId &&
      e.verification?.status === "verified",
  )?.emailAddress;
  if (!user || !email) return null;
  return {
    userId: `clerk:${user.id}`,
    email: email.toLowerCase(),
    fullName: user.fullName,
    displayName: user.fullName || email,
  };
}
