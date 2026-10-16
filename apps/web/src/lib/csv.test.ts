import { describe, expect, it } from 'vitest';
import { csvCell } from './csv';

describe('csvCell', () => {
  it('prefixes cells that a spreadsheet would read as formulas', () => {
    expect(csvCell('=HYPERLINK("http://evil")')).toBe(`"'=HYPERLINK(""http://evil"")"`);
    expect(csvCell('+1+1')).toBe("'+1+1");
    expect(csvCell('-2')).toBe("'-2");
    expect(csvCell('  @SUM(A1)')).toBe("'  @SUM(A1)");
    expect(csvCell('\tcalc')).toBe("'\tcalc");
    expect(csvCell('\rnote')).toBe(`"'\rnote"`);
  });

  it('quotes cells with separators and leaves plain text alone', () => {
    expect(csvCell('Design the homepage')).toBe('Design the homepage');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
  });
});
