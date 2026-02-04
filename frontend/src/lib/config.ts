/**
 * Feature flags and configuration for the application.
 * 
 * For client-side access, environment variables must be prefixed with NEXT_PUBLIC_
 * @see https://nextjs.org/docs/app/building-your-application/configuring/environment-variables
 */

/**
 * Whether to hide plans-related UI elements.
 * Set NEXT_PUBLIC_HIDE_PLANS=true to disable plans page and navigation links.
 */
export const HIDE_PLANS = process.env.NEXT_PUBLIC_HIDE_PLANS === "true";
