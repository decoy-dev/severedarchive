import type { MediaKind } from '../data/archive'

/**
 * The glyph the explorer draws where the index number used to be.
 *
 * Inline SVG rather than a font glyph or an image: it inherits `currentColor`,
 * so it picks up the accent on hover/selection with the rest of the tile and
 * needs no second rule, and it costs no request. Drawn on a 16-unit grid with a
 * 1.5 stroke so it sits at the weight of Share Tech Mono beside it rather than
 * reading as an icon pasted into a text UI.
 *
 * `aria-hidden`: the name beside it already says `.MP4`, so announcing "video"
 * here would be the same fact twice.
 */
export default function MediaKindIcon({ kind }: { kind: MediaKind }) {
  return (
    <svg
      className="kind-icon"
      viewBox="0 0 16 16"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {kind === 'photo' ? (
        <>
          <rect x="1.5" y="2.5" width="13" height="11" />
          {/* horizon + sun: the still-image convention, legible at 13px */}
          <path d="M1.5 10.5 L5.5 7 L9 10" />
          <path d="M8.5 11.5 L11 9.5 L14.5 12.5" />
          <circle cx="11" cy="5.5" r="1.25" />
        </>
      ) : (
        <>
          {/* Cine camera: body, lens cone, and the two feed reels on top. The
              reels are what make it read as a movie camera rather than as a
              generic video box at 13px — they are the silhouette everyone
              recognises, so they get the top third to themselves. */}
          <rect x="1.5" y="6.5" width="9.5" height="7" rx="0.5" />
          <path d="M11 9 L14.5 6.75 L14.5 13.25 L11 11 Z" />
          <circle cx="4.25" cy="3.75" r="2.25" />
          <circle cx="9" cy="4.25" r="1.75" />
        </>
      )}
    </svg>
  )
}
