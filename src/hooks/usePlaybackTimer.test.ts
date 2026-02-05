import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePlaybackTimer } from './usePlaybackTimer'

interface TestProps {
  enabled: boolean
  watch: number
}

describe('usePlaybackTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('ticks repeatedly while playing and enabled', () => {
    let watch = 0
    let rerenderFn: (props: TestProps) => void = () => {}

    const onTick = vi.fn(() => {
      watch += 1
      rerenderFn({ enabled: true, watch })
    })

    const { result, rerender } = renderHook(
      ({ enabled, watch }: TestProps) =>
        usePlaybackTimer({
          enabled,
          watch,
          getDurationMs: () => 50,
          onTick,
        }),
      { initialProps: { enabled: true, watch } }
    )

    rerenderFn = rerender

    act(() => {
      result.current.play()
    })

    act(() => {
      vi.advanceTimersByTime(50)
    })

    expect(onTick).toHaveBeenCalledTimes(1)

    act(() => {
      vi.advanceTimersByTime(50)
    })

    expect(onTick).toHaveBeenCalledTimes(2)
  })

  it('stops emitting ticks after pause', () => {
    let watch = 0
    let rerenderFn: (props: TestProps) => void = () => {}

    const onTick = vi.fn(() => {
      watch += 1
      rerenderFn({ enabled: true, watch })
    })

    const { result, rerender } = renderHook(
      ({ enabled, watch }: TestProps) =>
        usePlaybackTimer({
          enabled,
          watch,
          getDurationMs: () => 50,
          onTick,
        }),
      { initialProps: { enabled: true, watch } }
    )

    rerenderFn = rerender

    act(() => {
      result.current.play()
    })

    act(() => {
      vi.advanceTimersByTime(50)
    })

    expect(onTick).toHaveBeenCalledTimes(1)

    act(() => {
      result.current.pause()
    })

    act(() => {
      vi.advanceTimersByTime(200)
    })

    expect(onTick).toHaveBeenCalledTimes(1)
  })
})
