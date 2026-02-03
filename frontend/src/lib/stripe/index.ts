import Stripe from "stripe";

const secret = process.env.STRIPE_SECRET_KEY;
if (!secret && process.env.NODE_ENV === "production") {
  console.warn("STRIPE_SECRET_KEY is not set; Stripe features will fail at runtime.");
}

const stripe = new Stripe(secret ?? "sk_test_placeholder", {
  typescript: true
});

export default stripe;
