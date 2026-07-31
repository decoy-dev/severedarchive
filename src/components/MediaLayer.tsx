import { createContext, useContext, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { fullSrc, posterSrc, thumbSrc } from '../data/archive'
import type { MediaController } from '../lib/mediaController'

/**
 * Where the app's single `mediaController` instance (created by `Desktop`,
 * per the ownership contract) becomes reachable from anything nested inside
 * Desktop's `children` — the explorer's preview slot, in particular.
 *
 * Deliberately a separate context from `DesktopContext`: the explorer must not
 * know windows exist (the selection contract forbids it importing
 * `DesktopContext`), so it gets a narrower one whose only job is "here is the
 * controller".
 */
const MediaContext = createContext<MediaController | null>(null)
export const MediaControllerProvider = MediaContext.Provider

export function useMediaController(): MediaController | null {
  return useContext(MediaContext)
}

/**
 * The declarative half of the media node lifecycle (ownership contract §2.2):
 * one portal per file that has ever been acquired, rendered into a host
 * `mediaController` owns and React never does. `src` follows `wanted` exactly —
 * this module never decides placement, only whether a node that already has a
 * home gets fed a source. It must never be second-guessed by an imperative
 * write, per the controller's own declarative contract.
 *
 * Two things it deliberately does NOT render, both for the same reason:
 *
 * - **`muted`**, and **`volume`**. They are the controller's per-file record,
 *   written as properties. Rendering them here as well recreates the `src`
 *   desync in a quieter attribute: React's prop record would keep claiming
 *   `true`, diff equal against a later render, and never write again — leaving
 *   an element the controller unmuted stuck silent, or the reverse.
 * - **placement**. This layer never decides where a node lives, only what a node
 *   that already has a home is fed.
 *
 * `src` follows `wanted` and `tier` exactly, and is never second-guessed by an
 * imperative write. A released file renders `src={undefined}`, not a stale URL.
 */
export function MediaLayer({ controller }: { controller: MediaController }) {
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  return (
    <>
      {snapshot.fileIds.map((id) =>
        createPortal(
          <video
            key={id}
            loop
            playsInline
            autoPlay
            ref={(el) => controller.attachVideo(id, el)}
            // A tier swap resets the element to paused at time zero. This is
            // where the controller lands the playhead back and re-judges
            // playback — the director's own resync idiom.
            onLoadedData={() => controller.resync(id)}
            poster={posterSrc(id)}
            src={
              snapshot.wanted[id]
                ? (snapshot.tier[id] === 'full' ? fullSrc(id) : thumbSrc(id))
                : undefined
            }
          />,
          controller.acquire(id),
          id,
        ),
      )}
    </>
  )
}
