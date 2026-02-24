import type { ViewState } from './appViewState';

export type EscapeAction = 'none' | 'go-home' | 'close-active-exercise' | 'close-active-comprehension' | 'close-srs-review';

export function planEscapeAction(viewState: ViewState): EscapeAction {
  if (viewState.screen === 'home') {
    return 'none';
  }
  if (viewState.screen === 'active-exercise') {
    return 'close-active-exercise';
  }
  if (viewState.screen === 'active-comprehension') {
    return 'close-active-comprehension';
  }
  if (viewState.screen === 'active-srs-review') {
    return 'close-srs-review';
  }
  return 'go-home';
}
