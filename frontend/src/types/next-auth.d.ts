import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      isEnabled?: boolean;
    };
  }

  interface User {
    isEnabled?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    isEnabled?: boolean;
  }
}
