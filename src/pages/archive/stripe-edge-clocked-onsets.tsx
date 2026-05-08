import Head from "next/head";
import Link from "next/link";
import dynamic from "next/dynamic";

const StripeEdgeClockedOnsets = dynamic(
  () =>
    import("@/components/experiments/StripeEdgeClockedOnsets").then(
      (m) => m.StripeEdgeClockedOnsets
    ),
  { ssr: false }
);

export default function StripeEdgeClockedOnsetsPage() {
  return (
    <>
      <Head>
        <title>{`Stripe / Edge Clocked Onsets - Mandelbrot Codex`}</title>
      </Head>
      <div className="page-narrow">
        <Link href="/" className="back-link">
          ← mandelbrot codex
        </Link>
        <StripeEdgeClockedOnsets />
      </div>
    </>
  );
}
