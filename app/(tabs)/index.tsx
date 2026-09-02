import { Feather, Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BangingDrawer } from '@/components/BangingDrawer';
import { FilterDropdown } from '@/components/FilterDropdown';
import { PandaPlannerSheet, type PlannerMode } from '@/components/PandaPlannerSheet';
import { PandaWordmark } from '@/components/PandaWordmark';
import { SuggestionRow } from '@/components/SuggestionRow';
import { getPandaTimeEmoji, getPandaTimeLabel, getPandaTimeMode } from '@/constants/panda-time';
import { useSavedVenues } from '@/context/saved-venues';
import { venues } from '@/data/venues';
import { useColors } from '@/hooks/useColors';

type TopCategory =
  | 'All'
  | 'Indian'
  | 'Italian'
  | 'Chinese'
  | 'Spanish'
  | 'French'
  | 'British'
  | 'Japanese'
  | 'Mexican'
  | 'Turkish'
  | 'American'
  | 'Meat'
  | 'Bar'
  | 'Lebanese'
  | 'Thai'
  | 'Chicken'
  | 'Pizza'
  | 'Burgers'
  | 'Dessert'
  | 'Coffee'
  | 'Breakfast'
  | 'Lunch'
  | 'Brunch'
  | 'Bottomless'
  | 'Pubs'
  | 'Dinner'
  | 'Drinks'
  | 'Sports'
  | 'Live Music'
  | 'Nightlife';

const categories: Array<{
  label: TopCategory;
  emoji: string;
  terms: string[];
}> = [
  { label: 'All', emoji: '✨', terms: [] },
  { label: 'Indian', emoji: '🍛', terms: ['indian'] },
  { label: 'Italian', emoji: '🍝', terms: ['italian'] },
  { label: 'Chinese', emoji: '🥡', terms: ['chinese'] },
  { label: 'Spanish', emoji: '🥘', terms: ['spanish', 'iberian', 'tapas'] },
  { label: 'French', emoji: '🥐', terms: ['french'] },
  { label: 'British', emoji: '🫖', terms: ['british', 'english'] },
  { label: 'Japanese', emoji: '🍣', terms: ['japanese', 'sushi'] },
  { label: 'Mexican', emoji: '🌮', terms: ['mexican'] },
  { label: 'Turkish', emoji: '🍢', terms: ['turkish'] },
  { label: 'Pubs', emoji: '🍺', terms: ['pub', 'gastropub'] },
  { label: 'American', emoji: '🍔', terms: ['american', 'burger', 'diner'] },
  { label: 'Meat', emoji: '🥩', terms: ['meat', 'steak', 'steakhouse', 'grill', 'bbq', 'barbecue', 'roast', 'churrasco'] },
  { label: 'Bar', emoji: '🍹', terms: ['bar', 'cocktail', 'pub', 'wine', 'drinks', 'nightlife'] },
  { label: 'Lebanese', emoji: '🍕', terms: ['lebanese', 'middle eastern'] },
  { label: 'Thai', emoji: '🍜', terms: ['thai'] },
  { label: 'Chicken', emoji: '🍗', terms: ['chicken'] },
  { label: 'Pizza', emoji: '🍕', terms: ['pizza'] },
  { label: 'Burgers', emoji: '🍔', terms: ['burger'] },
  { label: 'Dessert', emoji: '🍰', terms: ['dessert', 'cake', 'sweet'] },
  { label: 'Coffee', emoji: '☕', terms: ['coffee', 'cafe', 'café'] },
  { label: 'Breakfast', emoji: '🍳', terms: ['breakfast'] },
  { label: 'Lunch', emoji: '🥗', terms: ['lunch'] },
  { label: 'Brunch', emoji: '🥐', terms: ['brunch'] },
  { label: 'Bottomless', emoji: '🍾', terms: ['bottomless'] },
  { label: 'Dinner', emoji: '🍽️', terms: ['dinner', 'restaurant'] },
  { label: 'Drinks', emoji: '🍸', terms: ['drink', 'bar', 'cocktail', 'wine'] },
  { label: 'Sports', emoji: '⚽', terms: ['sport', 'football'] },
  { label: 'Live Music', emoji: '🎵', terms: ['music', 'dj', 'live'] },
  { label: 'Nightlife', emoji: '🌙', terms: ['nightlife', 'club', 'late night'] },
];

const categoryPriority: Record<'morning' | 'midday' | 'evening' | 'late', TopCategory[]> = {
  morning: ['Breakfast', 'Brunch', 'Coffee', 'Lunch', 'Meat', 'Bar'],
  midday: ['Lunch', 'Brunch', 'Bottomless', 'Coffee', 'Dinner', 'Meat', 'Bar'],
  evening: ['Dinner', 'Meat', 'Pubs', 'Bar', 'Drinks', 'Sports', 'Live Music', 'Nightlife'],
  late: ['Nightlife', 'Pubs', 'Bar', 'Drinks', 'Sports', 'Live Music'],
};

export default function DiscoverScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { openPlanner, plannerIds, plannerLocation, plannerPrice } = useLocalSearchParams<{
    openPlanner?: string;
    plannerIds?: string;
    plannerLocation?: string;
    plannerPrice?: string;
  }>();
  const plannerMode =
    openPlanner === 'morning' || openPlanner === 'lunch' || openPlanner === 'night' ? openPlanner : undefined;
  const currentTimeMode = getPandaTimeMode();
  const { isSaved, toggleSaved } = useSavedVenues();
  const [category, setCategory] = useState<TopCategory>('All');
  const [priceFilter, setPriceFilter] = useState<'Any price' | '£' | '££' | '£££'>('Any price');
  const [sortBy, setSortBy] = useState<'Nearest' | 'Top rated'>('Nearest');
  const [openFilter, setOpenFilter] = useState<'price' | 'sort' | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const orderedCategories = useMemo(() => {
    const hour = new Date().getHours();
    const timeKey = hour < 11 ? 'morning' : hour < 16 ? 'midday' : hour < 23 ? 'evening' : 'late';
    const priority = categoryPriority[timeKey];
    const rank = (label: TopCategory) => {
      const position = priority.indexOf(label);
      return position === -1 ? Number.MAX_SAFE_INTEGER : position;
    };
    return [
      categories[0],
      ...categories
        .slice(1)
        .sort((first, second) => rank(first.label) - rank(second.label)),
    ];
  }, []);

  const filteredVenues = useMemo(() => {
    const selectedCategory = categories.find((item) => item.label === category);
    const result = venues.filter((venue) => {
      const searchable = `${venue.name} ${venue.neighborhood} ${venue.category} ${venue.type} ${venue.feature} ${venue.description}`.toLowerCase();
      const matchesCategory =
        category === 'All' || selectedCategory?.terms.some((term) => searchable.includes(term)) === true;
      const matchesPrice = priceFilter === 'Any price' || venue.price === priceFilter;
      return matchesCategory && matchesPrice;
    });
    return result.sort((a, b) =>
      sortBy === 'Nearest'
        ? a.distanceMeters - b.distanceMeters
        : Number.parseFloat(b.rating) - Number.parseFloat(a.rating),
    );
  }, [category, priceFilter, sortBy]);

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 550);
  };

  const submitSearch = () => {
    const query = searchQuery.trim();
    if (!query) return;
    router.push({ pathname: '/ai', params: { prompt: query } });
  };

  const topPadding = Platform.OS === 'web' ? 78 : insets.top + 14;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.fixedHeader, { backgroundColor: colors.ivory, paddingTop: topPadding }]}>
        <BambooBackdrop colors={colors} />
        <View style={styles.headerRow}>
          <PandaWordmark width={150} height={40} />
          <Pressable
            testID="time-planner-shortcut"
            accessibilityLabel={`Plan my ${currentTimeMode}`}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/', params: { openPlanner: currentTimeMode } })}
            style={({ pressed }) => [
              styles.modePill,
              { backgroundColor: colors.honeySoft, borderColor: colors.goldLine },
              pressed && styles.pressed,
            ]}
          >
            <View style={[styles.modeDot, { backgroundColor: colors.honey }]} />
            <Text style={[styles.modeText, { color: colors.honeyInk }]}>
              {getPandaTimeEmoji(currentTimeMode)} Plan my {getPandaTimeLabel(currentTimeMode)}
            </Text>
          </Pressable>
        </View>
        <View style={[styles.search, { backgroundColor: colors.card }]}>
          <Feather name="search" size={19} color={colors.green700} />
          <TextInput
            testID="venue-search"
            accessibilityLabel="Search places, cuisines, or a spot by name"
            returnKeyType="search"
            onChangeText={setSearchQuery}
            onSubmitEditing={submitSearch}
            placeholder="Search places, cuisines, a spot by name"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.searchInput, { color: colors.foreground }]}
            value={searchQuery}
          />
          <Pressable
            testID="venue-search-submit"
            accessibilityLabel="Search with Panda AI"
            accessibilityRole="button"
            disabled={!searchQuery.trim()}
            onPress={submitSearch}
            style={({ pressed }) => [styles.searchSubmit, pressed && styles.pressed]}
          >
            <Feather
              name="arrow-up-right"
              size={17}
              color={searchQuery.trim() ? colors.green700 : colors.border}
            />
          </Pressable>
        </View>
        <View style={styles.topCategoriesHeader}>
          <View style={[styles.sectionAccent, { backgroundColor: colors.green600 }]} />
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Top categories</Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categories}
          decelerationRate="fast"
        >
          {orderedCategories.map((item) => {
            const active = item.label === category;
              const greenTints = [colors.secondary, colors.mint100, colors.openBackground, colors.muted] as const;
              const tintIndex = orderedCategories.findIndex((categoryItem) => categoryItem.label === item.label);
              const inactiveTint = greenTints[tintIndex % greenTints.length];
            return (
              <Pressable
                key={item.label}
                testID={`category-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setCategory(item.label)}
                style={({ pressed }) => [styles.categoryItem, pressed && styles.pressed]}
              >
                <View
                  style={[
                    styles.categoryIcon,
                    {
                      backgroundColor: active ? colors.honeySoft : inactiveTint,
                      borderColor: active ? colors.goldLine : colors.border,
                    },
                  ]}
                >
                  <Text style={styles.categoryEmoji}>{item.emoji}</Text>
                </View>
                <Text
                  numberOfLines={1}
                  style={[styles.categoryLabel, { color: active ? colors.honeyInk : colors.mutedForeground }]}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      <FlatList
        style={styles.feed}
        data={filteredVenues}
        keyExtractor={(item) => item.id}
        numColumns={1}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.green700}
            colors={[colors.green700]}
          />
        }
        contentContainerStyle={styles.feedContent}
        ListHeaderComponent={
          <View style={styles.suggestionsHeader}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <View style={[styles.sectionAccent, { backgroundColor: colors.green600 }]} />
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                  {category === 'All' ? 'Suggestions' : category}
                </Text>
              </View>
              <View style={styles.filterRow}>
                <FilterDropdown
                  testID="price-filter"
                  label="price"
                  value={priceFilter}
                  options={['Any price', '£', '££', '£££']}
                  open={openFilter === 'price'}
                  onToggle={() => setOpenFilter((current) => (current === 'price' ? null : 'price'))}
                  onChange={(value) => {
                    setPriceFilter(value as typeof priceFilter);
                    setOpenFilter(null);
                  }}
                />
                <FilterDropdown
                  testID="sort-filter"
                  label="sort"
                  value={sortBy}
                  options={['Nearest', 'Top rated']}
                  open={openFilter === 'sort'}
                  onToggle={() => setOpenFilter((current) => (current === 'sort' ? null : 'sort'))}
                  onChange={(value) => {
                    setSortBy(value as typeof sortBy);
                    setOpenFilter(null);
                  }}
                />
              </View>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.listItem}>
            <SuggestionRow
              venue={item}
              saved={isSaved(item.id)}
              onToggleSaved={() => toggleSaved(item)}
              onPress={() => router.push(`/venue/${item.id}`)}
            />
          </View>
        )}
        ListEmptyComponent={
          <View style={[styles.empty, { backgroundColor: colors.card }]}>
            <Ionicons name="search-outline" size={28} color={colors.green700} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No places found</Text>
            <Text style={[styles.emptyBody, { color: colors.mutedForeground }]}>
              Try a different area, category, or search term.
            </Text>
          </View>
        }
      />
      <BangingDrawer
        venues={venues}
        isSaved={isSaved}
        onToggleSaved={toggleSaved}
        onPress={(venue) => router.push(`/venue/${venue.id}`)}
      />
      <PandaPlannerSheet
        initialLocation={plannerLocation}
        initialMode={plannerMode}
        initialPlanIds={typeof plannerIds === 'string' ? plannerIds : undefined}
        initialPrice={plannerPrice}
        onOpenMap={(plan, mode: PlannerMode, context) =>
          router.push({
            pathname: '/map',
            params: {
              plannerIds: plan.map((venue) => venue.id).join(','),
              plannerMode: mode,
              plannerVenues: JSON.stringify(plan),
              plannerLocation: context.location,
              plannerPrice: context.price,
            },
          })
        }
        onOpenDirections={(venue, context) =>
          router.push({
            pathname: '/map',
            params: {
              directionsVenueId: venue.id,
              plannerIds: context.plan.map((item) => item.id).join(','),
              plannerVenues: JSON.stringify(context.plan),
              plannerMode: context.mode,
              plannerPrice: context.price,
              plannerLocation: context.location,
            },
          })
        }
        onOpenVenue={(venue, context) =>
          router.push({
            pathname: '/venue/[id]',
            params: {
              id: venue.id,
              fromPlanner: '1',
              plannerIds: context.plan.map((item) => item.id).join(','),
              plannerVenues: JSON.stringify(context.plan),
              plannerMode: context.mode,
              plannerPrice: context.price,
              plannerLocation: context.location,
            },
          })
        }
        openRequest={openPlanner}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  fixedHeader: {
    flexShrink: 0,
    overflow: 'hidden',
    paddingHorizontal: 18,
    paddingBottom: 2,
    position: 'relative',
  },
  content: {
    paddingHorizontal: 18,
  },
  feed: {
    flex: 1,
  },
  feedContent: {
    paddingHorizontal: 18,
    paddingBottom: 410,
  },
  suggestionsHeader: {
    zIndex: 10,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modePill: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  modeDot: {
    borderRadius: 999,
    height: 7,
    width: 7,
  },
  modeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
  },
  search: {
    alignItems: 'center',
    borderRadius: 18,
    elevation: 4,
    flexDirection: 'row',
    gap: 10,
    marginTop: 15,
    paddingHorizontal: 15,
    shadowColor: '#062E22',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    minHeight: 50,
    paddingVertical: 0,
  },
  searchSubmit: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
    width: 28,
  },
  categories: {
    alignItems: 'flex-start',
    gap: 8,
    paddingBottom: 17,
    paddingHorizontal: 2,
    paddingTop: 9,
  },
  topCategoriesHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  categoryItem: {
    alignItems: 'center',
    gap: 5,
    width: 64,
  },
  categoryIcon: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    elevation: 2,
    height: 49,
    justifyContent: 'center',
    shadowColor: '#062E22',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    width: 49,
  },
  categoryEmoji: {
    fontSize: 23,
    lineHeight: 29,
  },
  categoryLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
    width: '100%',
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 11,
    marginTop: 5,
  },
  sectionTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  sectionAccent: {
    borderRadius: 999,
    height: 21,
    width: 4,
  },
  sectionTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.35,
  },
  sectionSubtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    marginTop: 3,
  },
  countPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  countText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 6,
  },
  filterPill: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 3,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  filterText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
  },
  listItem: {
    marginBottom: 0,
    width: '100%',
  },
  listItemLeft: {
    paddingRight: 0,
  },
  listItemRight: {
    paddingLeft: 0,
  },
  empty: {
    alignItems: 'center',
    borderRadius: 22,
    justifyContent: 'center',
    minHeight: 180,
    padding: 24,
  },
  emptyTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 17,
    marginTop: 9,
  },
  emptyBody: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    marginTop: 6,
    textAlign: 'center',
  },
  aiFab: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 2,
    bottom: 92,
    elevation: 7,
    height: 58,
    justifyContent: 'center',
    position: 'absolute',
    right: 18,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    width: 58,
  },
  aiFabLabel: {
    borderRadius: 999,
    bottom: -7,
    paddingHorizontal: 7,
    paddingVertical: 3,
    position: 'absolute',
    right: -8,
  },
  aiFabLabelText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 9,
  },
  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.98 }],
  },
});

function BambooBackdrop({ colors }: { colors: ReturnType<typeof useColors> }) {
  return (
    <Svg
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      viewBox="0 0 402 290"
    >
      <Path
        d="M-34 190 C 36 153, 16 93, 76 45 C 110 18, 136 9, 169 -7"
        fill="none"
        opacity={0.16}
        stroke={colors.mint300}
        strokeLinecap="round"
        strokeWidth={15}
      />
      <Path
        d="M-18 264 C 52 222, 62 174, 98 126 C 122 93, 154 73, 191 50"
        fill="none"
        opacity={0.12}
        stroke={colors.mint300}
        strokeLinecap="round"
        strokeWidth={10}
      />
      <Path
        d="M302 4 C 340 30, 364 71, 386 128 C 398 160, 414 186, 440 208"
        fill="none"
        opacity={0.11}
        stroke={colors.secondary}
        strokeLinecap="round"
        strokeWidth={14}
      />
      <Path
        d="M62 75 C 25 40, 24 7, 36 -20 C 71 -11, 91 18, 62 75Z"
        fill={colors.mint100}
        opacity={0.5}
      />
      <Path
        d="M116 118 C 82 91, 80 61, 92 33 C 122 42, 140 68, 116 118Z"
        fill={colors.secondary}
        opacity={0.6}
      />
      <Path
        d="M324 82 C 350 43, 379 35, 407 42 C 397 74, 370 94, 324 82Z"
        fill={colors.mint100}
        opacity={0.64}
      />
      <Path
        d="M294 192 C 322 150, 352 141, 385 151 C 374 185, 345 204, 294 192Z"
        fill={colors.secondary}
        opacity={0.56}
      />
    </Svg>
  );
}
