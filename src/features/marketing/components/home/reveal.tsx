import type { Locale } from "@/i18n/config";
import { ScrubWords } from "@/features/motion/Scrub";
import { ScrollScene } from "@/scenes/ScrollScene";
import { marketingMessages } from "../../messages";
import { sceneStill, type MarketingScene } from "../../scenes";
import { StillFrame } from "../still-frame";

// Scene II: the box. The question is the one word-by-word reveal on the site,
// paced by the box turning. On the hold the two teams come in from opposite
// sides and the rope between them pulls taut, level, while the lid stays shut.
export function Reveal({ lang, scene }: { lang: Locale; scene: MarketingScene | null }) {
  const t = marketingMessages(lang).reveal;
  const copy = (
    <div className="mk-reveal">
      <div className="mk-reveal__top">
        <ScrubWords as="h2" id="reveal-title" text={t.question} source="progress" from={0.12} to={0.7} className="mk-reveal__question" />
      </div>
      <div className="mk-reveal__bottom">
        <div className="mk-tug" role="img" aria-label={`${t.teams[0]}, ${t.teams[1]}: ${t.meter}`}>
          <span className="mk-tug__team" data-side="start" aria-hidden="true">
            {t.teams[0]}
          </span>
          <span className="mk-tug__rope" aria-hidden="true">
            <span className="mk-tug__pull" data-side="start" />
            <span className="mk-tug__pull" data-side="end" />
          </span>
          <span className="mk-tug__team" data-side="end" aria-hidden="true">
            {t.teams[1]}
          </span>
        </div>
        <p className="mk-reveal__lead">{t.lead}</p>
        <p className="mk-reveal__sealed">{t.sealed}</p>
      </div>
    </div>
  );

  if (!scene) {
    return (
      <StillFrame id="reveal" still={sceneStill("reveal.box")} alt={t.alt} aria-labelledby="reveal-title">
        {copy}
      </StillFrame>
    );
  }
  return (
    <ScrollScene id="reveal" className="mk-scene" source={scene.source} manifest={scene.manifest} alt={t.alt} scrollVh={180} holdVh={50}>
      {copy}
    </ScrollScene>
  );
}
