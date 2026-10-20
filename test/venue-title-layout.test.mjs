import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const detail = readFileSync(new URL('../app/venue/[id].tsx', import.meta.url), 'utf8');
const discovery = readFileSync(new URL('../components/DiscoverVenueCard.tsx', import.meta.url), 'utf8');
const banging = readFileSync(new URL('../components/VenueCard.tsx', import.meta.url), 'utf8');
const style = (source, name) => {
  const file = ts.createSourceFile('screen.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let body;
  const visit = node => {
    if (ts.isCallExpression(node) && node.expression.getText(file) === 'StyleSheet.create') {
      const entry = node.arguments[0]?.properties?.find(property => property.name?.getText(file) === name);
      if (entry && ts.isObjectLiteralExpression(entry.initializer)) {
        body = Object.fromEntries(entry.initializer.properties.map(property =>
          [property.name.getText(file), property.initializer.getText(file)]));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  assert.ok(body, `${name} style exists`);
  return body;
};

test('venue heading keeps its intrinsic height above the metadata chips', () => {
  const title = style(detail, 'venueTitle');
  assert.equal(title.flex, undefined);
  assert.equal(title.flexShrink, '0');
  assert.equal(title.includeFontPadding, 'true');
  for (const name of ['editorialHeading', 'pinnedHeader']) {
    assert.equal(style(detail, name).height, undefined);
    assert.equal(style(detail, name).maxHeight, undefined);
    assert.equal(style(detail, name).overflow, undefined);
  }
  const titleNode = detail.match(/<Text[^>]+styles\.editorialTitle[^>]*>\{venue\.name\}<\/Text>/)?.[0];
  assert.ok(titleNode);
  assert.match(titleNode, /fontFamily: fonts\.bold/);
  assert.doesNotMatch(titleNode, /numberOfLines|adjustsFontSizeToFit/);
  assert.ok(detail.indexOf(titleNode) < detail.indexOf('<View style={styles.chips}>'));
});

test('Discover uses bold venue names with two lines rather than a thin one-line serif', () => {
  assert.match(discovery, /<Text numberOfLines=\{2\}[^>]+styles\.name[^>]+fontFamily: fonts\.bold[^>]*>\{venue\.name\}/);
  assert.equal(style(discovery, 'name').fontWeight, "'700'");
  assert.equal(style(discovery, 'copy').height, undefined);
  assert.equal(style(discovery, 'copy').maxHeight, undefined);
});

test('Banging venue names are bold without changing unrelated card presentations', () => {
  assert.equal(style(banging, 'editorialName').fontFamily, "'Inter_700Bold'");
  assert.match(banging, /editorial && styles\.editorialName/);
});
