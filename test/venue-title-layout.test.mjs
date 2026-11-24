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

test('detail card restores APK 87 typography and spacing', () => {
  assert.equal(style(detail, 'editorialTitle').lineHeight, '39');
  assert.equal(style(detail, 'editorialTitle').fontWeight, "'700'");
  assert.equal(style(detail, 'editorialDescription').fontSize, '19');
  assert.equal(style(detail, 'editorialDescription').lineHeight, '27');
  assert.equal(style(detail, 'editorialAddressIcon').width, '38');
  assert.equal(style(detail, 'editorialAddressIcon').height, '38');
  assert.equal(style(detail, 'editorialAddress').fontSize, '12.5');
  assert.equal(style(detail, 'editorialAction').minHeight, '49');
  assert.equal(style(detail, 'editorialAction').borderRadius, '15');
  assert.match(detail, /venueAddress/);
  assert.match(detail, /venue\.neighborhood/);
  assert.match(detail, /Address unavailable/);
  assert.match(detail, /label=\{travelDistanceLabel\}/);
});

test('transit card restores walk and live states while keeping directions in Panda', () => {
  assert.match(detail, /recommendation\?: 'walk' \| 'transit'/);
  assert.match(detail, /LIVE DEPARTURES/);
  assert.match(detail, /BOARD \{vehicleLabel\.toUpperCase\(\)\}/);
  assert.match(detail, /Start walking in Panda/);
  assert.match(detail, /Get directions in Panda/);
  assert.doesNotMatch(detail, /Start walking in Google Maps/);
  assert.match(detail, /Number\.isFinite\(originStation\.latitude\)/);
});

test('detail card restores promoted and paid premium treatments', () => {
  assert.match(detail, /venue\.premium \|\| venue\.promoted/);
  assert.match(detail, /paidPremiumRule/);
  assert.match(detail, /paidPremiumUnderline/);
});
