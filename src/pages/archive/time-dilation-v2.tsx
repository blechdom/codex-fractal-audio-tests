import Head from "next/head";
import Link from "next/link";
import dynamic from "next/dynamic";

const TimeDilationDemoV2 = dynamic(
  () =>
    import("@/components/experiments/TimeDilationDemoV2").then(
      (m) => m.TimeDilationDemoV2
    ),
  { ssr: false }
);

export default function TimeDilationV2Page() {
  return (
    <>
      <Head>
        <title>{`Time Dilation V2 - Mandelbrot Codex`}</title>
      </Head>
      <div className="page-narrow">
        <Link href="/" className="back-link">
          ← mandelbrot codex
        </Link>
        <TimeDilationDemoV2 />
      </div>
    </>
  );
}
