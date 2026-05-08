import Head from "next/head";
import Link from "next/link";
import dynamic from "next/dynamic";

const EdgeDetectionSonificationLab = dynamic(
  () =>
    import("@/components/experiments/EdgeDetectionSonificationLab").then(
      (m) => m.EdgeDetectionSonificationLab
    ),
  { ssr: false }
);

export default function EdgeDetectionSonificationPage() {
  return (
    <>
      <Head>
        <title>{`Edge Detection Sonification - Mandelbrot Codex`}</title>
      </Head>
      <div className="page-narrow">
        <Link href="/" className="back-link">
          ← mandelbrot codex
        </Link>
        <EdgeDetectionSonificationLab />
      </div>
    </>
  );
}
