import Head from "next/head";
import Link from "next/link";
import dynamic from "next/dynamic";

const StripeEdgeClockedOnsetsClock = dynamic(
  () =>
    import("@/components/experiments/StripeEdgeClockedOnsetsClock").then(
      (m) => m.StripeEdgeClockedOnsetsClock
    ),
  { ssr: false }
);

export default function StripeEdgeClockedOnsetsV4Page() {
  return (
    <>
      <Head>
        <title>{`Stripe / Edge Clocked Onsets V4 - Mandelbrot Codex`}</title>
      </Head>
      <div className="page-narrow">
        <Link href="/" className="back-link">
          ← mandelbrot codex
        </Link>
        <StripeEdgeClockedOnsetsClock />
      </div>
    </>
  );
}

