import Head from "next/head";
import Link from "next/link";
import dynamic from "next/dynamic";

const StripeEdgeClockedOnsetsV3 = dynamic(
  () =>
    import("@/components/experiments/StripeEdgeClockedOnsetsV2").then(
      (m) => m.StripeEdgeClockedOnsetsV3
    ),
  { ssr: false }
);

export default function StripeEdgeClockedOnsetsV3Page() {
  return (
    <>
      <Head>
        <title>{`Stripe / Edge Clocked Onsets V3 - Mandelbrot Codex`}</title>
      </Head>
      <div className="page-narrow">
        <Link href="/" className="back-link">
          ← mandelbrot codex
        </Link>
        <StripeEdgeClockedOnsetsV3 />
      </div>
    </>
  );
}
