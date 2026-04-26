import Head from "next/head";
import Link from "next/link";
import dynamic from "next/dynamic";

const TimeDilationDemoV3 = dynamic(
  () =>
    import("@/components/experiments/TimeDilationDemoV2").then(
      (m) => m.TimeDilationDemoV3
    ),
  { ssr: false }
);

export default function TimeDilationV3Page() {
  return (
    <>
      <Head>
        <title>{`Time Dilation V3 - Mandelbrot Codex`}</title>
      </Head>
      <div className="page-narrow">
        <Link href="/" className="back-link">
          ← mandelbrot codex
        </Link>
        <TimeDilationDemoV3 />
      </div>
    </>
  );
}
