import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { brand } from "@/config/brand";
import type { Locale } from "@/i18n/config";

const STILL = "/media/drafts/wedding.doors/last";

// Sign-in, sign-up and claim: the form on night at the start side, the last
// frame of the doors scene on the other. Phones get a short band of the same
// still above the form.
export function AuthShell({
  lang,
  title,
  lead,
  languageSwitch,
  children,
}: {
  lang: Locale;
  title: string;
  lead?: string;
  languageSwitch: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="theme-night flex min-h-dvh flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <div className="relative h-36 overflow-hidden sm:h-48 lg:order-2 lg:h-auto">
        <picture>
          <source srcSet={`${STILL}.avif`} type="image/avif" />
          {/* Decorative: the doors of the opening scene, already open. */}
          <img
            src={`${STILL}.webp`}
            alt=""
            width={1920}
            height={1080}
            fetchPriority="high"
            className="absolute inset-0 size-full object-cover object-[50%_40%] lg:object-[50%_55%]"
          />
        </picture>
        {/* Joins the band to the form on phones, so the edge reads as dusk rather than a cut. */}
        <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-12 bg-linear-to-t from-night to-transparent lg:hidden" />
      </div>

      <main className="flex flex-1 flex-col px-5 pb-10 sm:px-10 lg:order-1 lg:px-14 lg:py-10 xl:px-20">
        <div className="flex min-h-14 items-center justify-between gap-3 lg:min-h-11">
          <Link href={`/${lang}` as Route} className="flex min-h-11 items-center font-display text-2xl font-bold text-bone">
            {brand.name[lang]}
          </Link>
          {languageSwitch}
        </div>
        <div className="flex flex-1 flex-col pt-4 lg:justify-center lg:pt-0">
          <div className="w-full max-w-sm">
            <h1 className="font-display text-3xl font-bold leading-tight text-bone sm:text-4xl">{title}</h1>
            {lead ? <p className="mt-3 text-[1.0625rem] text-ash">{lead}</p> : null}
            <div className="mt-8">{children}</div>
          </div>
        </div>
      </main>
    </div>
  );
}

export const authSwitchClass =
  "inline-flex min-h-11 items-center rounded-control px-3 text-sm font-medium text-ash transition-colors duration-150 hover:bg-bone/10 hover:text-bone";
