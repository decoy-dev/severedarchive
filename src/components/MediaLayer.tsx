import { createContext, useContext, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { posterSrc, thumbSrc } from '../data/archive'
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
 * Deliberately uniform for now: every hosted file gets the thumb encode,
 * muted, looping, regardless of where it lands. Tier-aware source selection
 * (full-res + audio for the focused window / mobile primary), the degrade
 * overlay, and the reparent FLIP animation are Slice C's job — this only has
 * to not crash and to make a registered slot show something real.
 */
export function MediaLayer({ controller }: { controller: MediaController }) {
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  return (
    <>
      {snapshot.fileIds.map((id) =>
        createPortal(
          <video
            key={id}
            muted
            loop
            playsInline
            autoPlay
            poster={posterSrc(id)}
            src={snapshot.wanted[id] ? thumbSrc(id) : undefined}
          />,
          controller.acquire(id),
          id,
        ),
      )}
    </>
  )
}
