import Head from "next/head";
import Link from "next/link";
import dynamic from "next/dynamic";

const EdgeDetectionSonificationLabClock = dynamic(
  () =>
    import("@/components/experiments/EdgeDetectionSonificationLabClock").then(
      (m) => m.EdgeDetectionSonificationLabClock
    ),
  { ssr: false }
);

export default function EdgeDetectionSonificationV2ClockPage() {
  return (
    <>
      <Head>
        <title>{`Edge Detection Sonification V2 Clock - Mandelbrot Codex`}</title>
      </Head>
      <div className="page-narrow">
        <Link href="/" className="back-link">
          ← mandelbrot codex
        </Link>
        <EdgeDetectionSonificationLabClock />
      </div>
    </>
  );
}

