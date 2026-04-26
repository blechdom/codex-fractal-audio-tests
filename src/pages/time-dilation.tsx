import Head from "next/head";
import Link from "next/link";
import dynamic from "next/dynamic";

const TimeDilationDemo = dynamic(
  () => import("@/components/experiments/TimeDilationDemo").then((m) => m.TimeDilationDemo),
  { ssr: false }
);

export default function TimeDilationPage() {
  return (
    <>
      <Head>
        <title>{`Time Dilation - Mandelbrot Codex`}</title>
      </Head>
      <div className="page-narrow">
        <Link href="/" className="back-link">
          ← mandelbrot codex
        </Link>
        <TimeDilationDemo />
      </div>
    </>
  );
}
