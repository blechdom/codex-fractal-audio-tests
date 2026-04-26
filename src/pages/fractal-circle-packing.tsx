import Head from "next/head";
import Link from "next/link";
import dynamic from "next/dynamic";

const FractalCirclePackingDemo = dynamic(
  () =>
    import("@/components/experiments/FractalCirclePackingDemo").then(
      (m) => m.FractalCirclePackingDemo
    ),
  { ssr: false }
);

export default function FractalCirclePackingPage() {
  return (
    <>
      <Head>
        <title>{`Fractal Circle Packing - Mandelbrot Codex`}</title>
      </Head>
      <div className="page-narrow">
        <Link href="/" className="back-link">
          ← mandelbrot codex
        </Link>
        <FractalCirclePackingDemo />
      </div>
    </>
  );
}
