import Head from "next/head";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { GetStaticPaths, GetStaticProps, InferGetStaticPropsType } from "next";
import {
  STRATEGIES,
  type StrategySlug,
} from "@/lib/mandelbrot-sonification";

const MandelbrotSonificationDemo = dynamic(
  () =>
    import("@/components/experiments/MandelbrotSonificationDemo").then(
      (m) => m.MandelbrotSonificationDemo
    ),
  { ssr: false }
);

interface Props {
  slug: StrategySlug;
}

export const getStaticPaths: GetStaticPaths = async () => {
  return {
    paths: STRATEGIES.map((s) => ({ params: { slug: s.slug } })),
    fallback: false,
  };
};

export const getStaticProps: GetStaticProps<Props> = async (ctx) => {
  const slug = ctx.params?.slug;
  if (typeof slug !== "string") {
    return { notFound: true };
  }
  const exists = STRATEGIES.some((s) => s.slug === slug);
  if (!exists) {
    return { notFound: true };
  }
  return { props: { slug: slug as StrategySlug } };
};

export default function DemoPage({
  slug,
}: InferGetStaticPropsType<typeof getStaticProps>) {
  const strategy = STRATEGIES.find((s) => s.slug === slug);
  if (!strategy) return null;

  return (
    <>
      <Head>
        <title>{strategy.title} — Mandelbrot Codex</title>
        <meta name="description" content={strategy.description} />
      </Head>
      <div className="page-narrow">
        <Link href="/" className="back-link">
          ← mandelbrot codex
        </Link>
        <MandelbrotSonificationDemo slug={slug} />
      </div>
    </>
  );
}
