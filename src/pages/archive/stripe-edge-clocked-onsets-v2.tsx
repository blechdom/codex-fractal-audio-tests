import Head from "next/head";
import Link from "next/link";
import dynamic from "next/dynamic";

const StripeEdgeClockedOnsets = dynamic(
  () =>
    import("@/components/experiments/StripeEdgeClockedOnsetsV2").then(
      (m) => m.StripeEdgeClockedOnsetsV2
    ),
  { ssr: false }
);

export default function StripeEdgeClockedOnsetsV2Page() {
  return (
    <>
      <Head>
        <title>{`Stripe / Edge Clocked Onsets V2 - Mandelbrot Codex`}</title>
      </Head>
      <div className="page-narrow">
        <Link href="/" className="back-link">
          ← mandelbrot codex
        </Link>
        <div
          style={{
            border: "1px solid #2a2a2a",
            borderRadius: 8,
            padding: "0.7rem 0.85rem",
            marginBottom: "0.8rem",
            background: "#111",
            color: "#999",
            fontSize: "0.78rem",
            lineHeight: 1.45,
          }}
        >
          V2 is the clearer baseline version. Advanced infinite-layer controls live in V3.
        </div>
        <StripeEdgeClockedOnsets />
      </div>
    </>
  );
}
