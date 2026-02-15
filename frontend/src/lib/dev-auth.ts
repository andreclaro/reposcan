// DEV_BYPASS_AUTH is false by default for security
// Only set to true in local development with .env.local
export const DEV_BYPASS_AUTH = process.env.DEV_BYPASS_AUTH === "true" && process.env.NODE_ENV !== "production";

export const DEV_USER = {
  id: "dev-user",
  name: "Dev User",
  email: "dev@local.test",
  image: null
};
