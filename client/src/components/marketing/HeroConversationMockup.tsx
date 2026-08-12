import {
  HERO_AVIF_SRCSET,
  HERO_IMAGE_HEIGHT,
  HERO_IMAGE_PNG,
  HERO_IMAGE_SIZES,
  HERO_IMAGE_WIDTH,
  HERO_WEBP_SRCSET,
} from "@shared/homepageHeroImage";

/** Above-the-fold hero mock — eager, high priority, explicit dimensions. */
export function HeroConversationMockup({ alt }: { alt: string }) {
  return (
    <div className="wcs-hero-image-column w-full md:order-2">
      <div className="wcs-hero-image-slot">
        <picture>
          <source type="image/avif" srcSet={HERO_AVIF_SRCSET} sizes={HERO_IMAGE_SIZES} />
          <source type="image/webp" srcSet={HERO_WEBP_SRCSET} sizes={HERO_IMAGE_SIZES} />
          <img
            className="wcs-hero-image"
            src={HERO_IMAGE_PNG}
            alt={alt}
            width={HERO_IMAGE_WIDTH}
            height={HERO_IMAGE_HEIGHT}
            sizes={HERO_IMAGE_SIZES}
            loading="eager"
            decoding="async"
            fetchPriority="high"
          />
        </picture>
      </div>
    </div>
  );
}
