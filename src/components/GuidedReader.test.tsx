import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import type { GuidedLine } from '../types';
import { GuidedLineComponent } from './GuidedReader';
import type { GuidedLineProps } from './GuidedReader';

function renderLine(line: GuidedLine, overrides: Partial<GuidedLineProps> = {}) {
  return render(
    <GuidedLineComponent
      line={line}
      lineIndex={0}
      isActiveLine
      isPlaying={false}
      isFutureLine={false}
      showPacer
      wpm={300}
      guidedPacerStyle="sweep"
      {...overrides}
    />
  );
}

describe('GuidedLineComponent', () => {
  it('centers sweep start for heading lines', () => {
    const headingText = 'Centered heading';
    const { container } = renderLine({ text: headingText, type: 'heading' });
    const sweep = container.querySelector('.guided-sweep') as HTMLSpanElement | null;
    expect(sweep).not.toBeNull();
    expect(sweep?.style.left).toBe(`calc(50% - ${headingText.length / 2}ch)`);
  });

  it('keeps sweep start at left edge for body lines', () => {
    const { container } = renderLine({ text: 'body line', type: 'body' });
    const sweep = container.querySelector('.guided-sweep') as HTMLSpanElement | null;
    expect(sweep).not.toBeNull();
    expect(sweep?.style.left).toBe('0px');
  });
});
