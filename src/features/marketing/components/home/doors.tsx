import Link from "next/link";
import type { Locale } from "@/i18n/config";
import { ScrollScene } from "@/scenes/ScrollScene";
import { marketingMessages } from "../../messages";
import { sceneStill, type MarketingScene } from "../../scenes";
import { demoLinks } from "../../demo";
import { localHref } from "../../site";
import { StillFrame } from "../still-frame";

// Scene I: the walk up the garden path to the doors. Two short lines pass over
// the approach; on the hold the headline opens out of the lit gap between the
// doors, set on the lower door panels, with the actions on the step below.
// The actions do not scrub: they switch on at the start of the hold with a
// short fade, so they are never half-visible while they can be pressed.
export function Doors({ lang, scene }: { lang: Locale; scene: MarketingScene | null }) {
  const t = marketingMessages(lang).doors;

  const doorway = (
    <div className="mk-doorway">
      <div className="mk-doorway__scrim" aria-hidden="true" />
      <h1 className="mk-doorway__title">{t.title}</h1>
      <p className="mk-doorway__lead">{t.lead}</p>
    </div>
  );
  const action = (
    <div className="mk-doors__action">
      <Link href={localHref(lang, "/signup")} className="mk-btn mk-btn--large">
        {t.cta}
      </Link>
      {/* A real published invitation, not a mock-up: the strongest proof on the page. */}
      <a href={demoLinks.wedding} className="mk-btn mk-btn--large mk-btn--over">
        {t.demo}
      </a>
    </div>
  );

  if (!scene) {
    return (
      <StillFrame still={sceneStill("wedding.doors")} alt={t.alt} overlay={doorway} priority className="mk-doors">
        {action}
      </StillFrame>
    );
  }

  return (
    <ScrollScene
      id="top"
      className="mk-scene mk-doors"
      source={scene.source}
      manifest={scene.manifest}
      alt={t.alt}
      priority
      scrollVh={200}
      holdVh={60}
      frameOverlay={doorway}
    >
      <div className="mk-approach">
        <div className="mk-approach__scrim" aria-hidden="true" />
        {t.approach.map((line, index) => (
          <p key={index} className="mk-approach__line" data-line={index}>
            {line}
          </p>
        ))}
      </div>
      {action}
    </ScrollScene>
  );
}
