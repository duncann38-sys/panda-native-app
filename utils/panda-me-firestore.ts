import { getApps } from 'firebase/app';
import {
  arrayRemove,
  deleteDoc,
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type QuerySnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import type { Venue } from '@/data/venues';

export type PandaHomeAddress = {
  label: string;
  formattedAddress: string;
  lat: number;
  lng: number;
};
export type PandaMeProfile = {
  uid: string;
  name: string;
  handle: string;
  handleLower: string;
  avatar: string | null;
  displayNameLower: string;
  discoverable: boolean;
};
export type PandaFriend = {
  uid: string;
  name: string;
  handle: string;
  avatar: string | null;
  since?: unknown;
};
export type PandaFriendRequest = {
  id: string;
  fromUid: string;
  fromName: string;
  fromHandle: string;
  fromAvatar: string | null;
  toUid: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt?: unknown;
};
export type PandaTable = {
  id: string;
  hostUid: string;
  venuePlaceId?: string | null;
  venueName: string;
  venuePhoto?: string | null;
  neighborhood: string;
  venueAddress?: string;
  venueLat?: number | null;
  venueLng?: number | null;
  dateTime: unknown;
  partySize: number;
  notes?: string;
  status: 'upcoming' | 'completed' | 'cancelled';
  source: 'opentable' | 'manual';
  promotionId?: string | null;
  guestUids: string[];
  createdAt?: unknown;
};
export type PandaGuest = {
  uid: string;
  name: string;
  handle: string;
  avatar: string | null;
  status: 'going' | 'invited' | 'declined';
  invitedAt?: unknown;
  respondedAt?: unknown;
};
export type PandaThread = {
  id: string;
  title?: string;
  participantUids: string[];
  participantProfiles?: PandaFriend[];
  lastMessage?: { type?: string; text?: string; venueName?: string; bookingId?: string };
  unreadBy?: string[];
  updatedAt?: unknown;
};
export type PandaSharedVenue = {
  placeId: string;
  name: string;
  category: string;
  neighborhood: string;
  fullAddress?: string;
  latitude?: number;
  longitude?: number;
  photoUri?: string;
  photoAttribution?: string;
  mapsUri?: string;
  website?: string;
  phone?: string;
  rating?: string;
  price?: string;
  openNow?: boolean;
  source?: 'google_places' | 'openstreetmap';
};
export type PandaMessage = {
  id: string;
  senderUid: string;
  type: 'text' | 'venue' | 'table_invite';
  text?: string;
  venue?: PandaSharedVenue;
  bookingId?: string;
  createdAt?: unknown;
};
export type PandaPromotion = {
  id: string;
  title: string;
  description?: string;
  venueName?: string;
  active?: boolean;
  priority?: number;
  imageUrl?: string;
  terms?: string;
};

export function getPandaMeDb() {
  const app = getApps().find((candidate) => candidate.name === 'panda-native-auth');
  if (!app) throw new Error('Sign in to Panda before opening Panda Me.');
  return getFirestore(app);
}

function cleanHandle(value: string, uid: string) {
  const base =
    value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 18) || 'panda';
  return base + '-' + uid.slice(0, 4).toLowerCase();
}

export async function ensurePandaMeProfile(
  uid: string,
  displayName: string,
): Promise<PandaMeProfile> {
  const db = getPandaMeDb();
  const userRef = doc(db, 'users', uid);
  const publicRef = doc(db, 'panda_profiles', uid);
  const [userSnapshot, publicSnapshot] = await Promise.all([getDoc(userRef), getDoc(publicRef)]);
  const oldPublic = publicSnapshot.exists() ? publicSnapshot.data() : {};
  const name = String(
    oldPublic.name ||
      (userSnapshot.exists() && userSnapshot.data().name) ||
      displayName ||
      'Panda member',
  ).trim();
  const handle = String(oldPublic.handle || cleanHandle(name, uid));
  const profile: PandaMeProfile = {
    uid,
    name,
    handle,
    handleLower: handle.toLowerCase(),
    avatar: typeof oldPublic.avatar === 'string' ? oldPublic.avatar : null,
    displayNameLower: name.toLowerCase(),
    discoverable: oldPublic.discoverable !== false,
  };
  const batch = writeBatch(db);
  const oldUser = userSnapshot.exists() ? userSnapshot.data() : {};
  const userNeedsProfile = !userSnapshot.exists() || !oldUser.handle || !oldUser.name;
  const publicNeedsProfile =
    !publicSnapshot.exists() ||
    !oldPublic.handleLower ||
    typeof oldPublic.discoverable !== 'boolean';
  if (userNeedsProfile)
    batch.set(userRef, { name, handle, updatedAt: serverTimestamp() }, { merge: true });
  if (publicNeedsProfile)
    batch.set(
      publicRef,
      {
        ...profile,
        updatedAt: serverTimestamp(),
        createdAt: oldPublic.createdAt || serverTimestamp(),
      },
      { merge: true },
    );
  if (userNeedsProfile || publicNeedsProfile) await batch.commit();
  return profile;
}

export async function savePandaHome(uid: string, homeAddress: PandaHomeAddress) {
  await setDoc(
    doc(getPandaMeDb(), 'users', uid),
    { homeAddress, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

export function subscribePandaProfile(
  uid: string,
  callback: (profile: Record<string, unknown> | null) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(getPandaMeDb(), 'users', uid),
    (snapshot) => callback(snapshot.exists() ? snapshot.data() : null),
    onError,
  );
}

export async function searchPandaProfiles(
  searchText: string,
  currentUid: string,
): Promise<PandaMeProfile[]> {
  const needle = searchText.trim().replace(/^@/, '').toLowerCase();
  if (needle.length < 2) return [];
  const profiles = collection(getPandaMeDb(), 'panda_profiles');
  const handleQuery = query(
    profiles,
    where('discoverable', '==', true),
    where('handleLower', '>=', needle),
    where('handleLower', '<=', needle + '\uf8ff'),
    limit(12),
  );
  const nameQuery = query(
    profiles,
    where('discoverable', '==', true),
    where('displayNameLower', '>=', needle),
    where('displayNameLower', '<=', needle + '\uf8ff'),
    limit(12),
  );
  const [handles, names] = await Promise.all([getDocs(handleQuery), getDocs(nameQuery)]);
  const map = new Map<string, PandaMeProfile>();
  for (const item of [...handles.docs, ...names.docs]) {
    if (item.id === currentUid) continue;
    const data = item.data();
    if (data.discoverable !== false)
      map.set(item.id, {
        uid: item.id,
        name: String(data.name || 'Panda member'),
        handle: String(data.handle || ''),
        handleLower: String(data.handleLower || ''),
        avatar: typeof data.avatar === 'string' ? data.avatar : null,
        displayNameLower: String(data.displayNameLower || ''),
        discoverable: true,
      });
  }
  return [...map.values()].slice(0, 12);
}

export async function sendPandaFriendRequest(from: PandaMeProfile, to: PandaMeProfile) {
  if (from.uid === to.uid) throw new Error('You cannot add yourself.');
  const db = getPandaMeDb();
  const existing = await getDocs(
    query(
      collection(db, 'friend_requests'),
      where('fromUid', '==', from.uid),
      where('toUid', '==', to.uid),
      where('status', '==', 'pending'),
      limit(1),
    ),
  );
  if (!existing.empty) throw new Error('A request is already waiting for them.');
  await setDoc(doc(collection(db, 'friend_requests')), {
    fromUid: from.uid,
    fromName: from.name,
    fromHandle: from.handle,
    fromAvatar: from.avatar,
    toUid: to.uid,
    status: 'pending',
    createdAt: serverTimestamp(),
  });
}

export function subscribeIncomingPandaRequests(
  uid: string,
  callback: (items: PandaFriendRequest[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const requests = query(
    collection(getPandaMeDb(), 'friend_requests'),
    where('toUid', '==', uid),
    where('status', '==', 'pending'),
    orderBy('createdAt', 'desc'),
    limit(20),
  );
  return onSnapshot(
    requests,
    (snapshot) =>
      callback(
        snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as PandaFriendRequest),
      ),
    onError,
  );
}

export async function respondToPandaRequest(
  requestItem: PandaFriendRequest,
  recipient: PandaMeProfile,
  decision: 'accepted' | 'declined',
) {
  const db = getPandaMeDb();
  const requestRef = doc(db, 'friend_requests', requestItem.id);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(requestRef);
    if (
      !snapshot.exists() ||
      snapshot.data().toUid !== recipient.uid ||
      snapshot.data().status !== 'pending'
    )
      throw new Error('This request is no longer waiting.');
    transaction.update(requestRef, { status: decision, respondedAt: serverTimestamp() });
    if (decision === 'accepted') {
      const sender: PandaFriend = {
        uid: requestItem.fromUid,
        name: requestItem.fromName,
        handle: requestItem.fromHandle,
        avatar: requestItem.fromAvatar,
      };
      const receiver: PandaFriend = {
        uid: recipient.uid,
        name: recipient.name,
        handle: recipient.handle,
        avatar: recipient.avatar,
      };
      transaction.set(doc(db, 'users', recipient.uid, 'friends', sender.uid), {
        ...sender,
        requestId: requestItem.id,
        since: serverTimestamp(),
      });
      transaction.set(doc(db, 'users', sender.uid, 'friends', recipient.uid), {
        ...receiver,
        requestId: requestItem.id,
        since: serverTimestamp(),
      });
    }
  });
}

export function subscribePandaFriends(
  uid: string,
  callback: (items: PandaFriend[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const friendsQuery = query(
    collection(getPandaMeDb(), 'users', uid, 'friends'),
    orderBy('since', 'desc'),
    limit(40),
  );
  return onSnapshot(
    friendsQuery,
    (snapshot) =>
      callback(snapshot.docs.map((item) => ({ uid: item.id, ...item.data() }) as PandaFriend)),
    onError,
  );
}

export function subscribePandaBookings(
  uid: string,
  callback: (items: PandaTable[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const db = getPandaMeDb();
  const itemsById = new Map<string, PandaTable>();
  const guestSubscriptions = new Map<string, Unsubscribe>();
  const emit = () =>
    callback([...itemsById.values()].sort((a, b) => toDate(a.dateTime) - toDate(b.dateTime)));
  const hostQuery = query(
    collection(db, 'bookings'),
    where('hostUid', '==', uid),
    orderBy('dateTime', 'asc'),
    limit(40),
  );
  const guestQuery = query(collectionGroup(db, 'guests'), where('uid', '==', uid), limit(50));
  const hostSubscription = onSnapshot(
    hostQuery,
    (snapshot) => {
      for (const item of snapshot.docs)
        itemsById.set(item.id, { id: item.id, ...item.data() } as PandaTable);
      emit();
    },
    onError,
  );
  const guestIndexSubscription = onSnapshot(
    guestQuery,
    (snapshot) => {
      const currentIds = new Set(
        snapshot.docs
          .map((item) => item.ref.parent.parent?.id)
          .filter((id): id is string => Boolean(id)),
      );
      for (const [bookingId, unsubscribe] of guestSubscriptions) {
        if (!currentIds.has(bookingId)) {
          unsubscribe();
          guestSubscriptions.delete(bookingId);
          itemsById.delete(bookingId);
        }
      }
      for (const bookingId of currentIds) {
        if (guestSubscriptions.has(bookingId)) continue;
        const unsubscribe = onSnapshot(
          doc(db, 'bookings', bookingId),
          (bookingSnapshot) => {
            if (bookingSnapshot.exists())
              itemsById.set(bookingId, { id: bookingId, ...bookingSnapshot.data() } as PandaTable);
            else itemsById.delete(bookingId);
            emit();
          },
          onError,
        );
        guestSubscriptions.set(bookingId, unsubscribe);
      }
      emit();
    },
    onError,
  );
  return () => {
    hostSubscription();
    guestIndexSubscription();
    for (const unsubscribe of guestSubscriptions.values()) unsubscribe();
  };
}

function toDate(value: unknown): number {
  if (value instanceof Timestamp) return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') return Date.parse(value) || 0;
  return 0;
}

export async function createPandaTable(input: {
  host: PandaMeProfile;
  venueName: string;
  neighborhood: string;
  venueAddress?: string;
  venueLat?: number;
  venueLng?: number;
  dateTime: Date;
  partySize: number;
  notes?: string;
  guests: PandaFriend[];
}): Promise<{ bookingId: string; failedGroupChat: boolean }> {
  const db = getPandaMeDb();
  const bookingRef = doc(collection(db, 'bookings'));
  const requestedPartySize = Math.max(2, Math.min(12, input.partySize));
  if (input.guests.length + 1 > requestedPartySize) {
    throw new Error('The invited guests cannot exceed the party size.');
  }
  if (input.guests.length > 9) {
    throw new Error('A shared table chat can include up to nine friends.');
  }
  const guests = input.guests;
  const guestUids = [input.host.uid, ...guests.map((friend) => friend.uid)];
  const batch = writeBatch(db);
  batch.set(bookingRef, {
    hostUid: input.host.uid,
    venuePlaceId: null,
    venueName: input.venueName.trim(),
    venuePhoto: null,
    neighborhood: input.neighborhood.trim(),
    venueAddress: input.venueAddress?.trim() || '',
    venueLat: input.venueLat ?? null,
    venueLng: input.venueLng ?? null,
    dateTime: Timestamp.fromDate(input.dateTime),
    partySize: requestedPartySize,
    notes: input.notes?.trim() || '',
    status: 'upcoming',
    source: 'manual',
    promotionId: null,
    guestUids,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'bookings', bookingRef.id, 'guests', input.host.uid), {
    uid: input.host.uid,
    name: input.host.name,
    handle: input.host.handle,
    avatar: input.host.avatar,
    status: 'going',
    invitedAt: serverTimestamp(),
    respondedAt: serverTimestamp(),
  });
  for (const friend of guests) {
    batch.set(doc(db, 'bookings', bookingRef.id, 'guests', friend.uid), {
      uid: friend.uid,
      name: friend.name,
      handle: friend.handle,
      avatar: friend.avatar,
      status: 'invited',
      invitedAt: serverTimestamp(),
    });
  }
  await batch.commit();

  let failedGroupChat = false;
  if (guests.length > 0) {
    const thread: PandaThread = {
      id: doc(collection(db, 'threads')).id,
      title: 'Table at ' + input.venueName.trim(),
      participantUids: guestUids,
      participantProfiles: [input.host, ...guests],
    };
    try {
      await sendPandaMessage(
        thread,
        input.host.uid,
        input.host.name + ' invited everyone to a table at ' + input.venueName.trim(),
        'table_invite',
        undefined,
        bookingRef.id,
      );
    } catch {
      failedGroupChat = true;
    }
  }

  return { bookingId: bookingRef.id, failedGroupChat };
}

export async function updatePandaTable(
  bookingId: string,
  updates: {
    venueName?: string;
    neighborhood?: string;
    venueAddress?: string;
    venueLat?: number | null;
    venueLng?: number | null;
    dateTime?: Date;
    partySize?: number;
    notes?: string;
    status?: 'upcoming' | 'completed' | 'cancelled';
  },
) {
  const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (updates.venueName !== undefined) payload.venueName = updates.venueName.trim();
  if (updates.neighborhood !== undefined) payload.neighborhood = updates.neighborhood.trim();
  if (updates.venueAddress !== undefined) payload.venueAddress = updates.venueAddress.trim();
  if (updates.venueLat !== undefined) payload.venueLat = updates.venueLat;
  if (updates.venueLng !== undefined) payload.venueLng = updates.venueLng;
  if (updates.dateTime !== undefined) payload.dateTime = Timestamp.fromDate(updates.dateTime);
  if (updates.partySize !== undefined)
    payload.partySize = Math.max(2, Math.min(12, updates.partySize));
  if (updates.notes !== undefined) payload.notes = updates.notes.trim();
  if (updates.status !== undefined) payload.status = updates.status;
  await updateDoc(doc(getPandaMeDb(), 'bookings', bookingId), payload);
}

export async function cancelPandaTable(bookingId: string) {
  await updatePandaTable(bookingId, { status: 'cancelled' });
}

export async function respondToPandaInvite(
  bookingId: string,
  uid: string,
  status: 'going' | 'declined',
) {
  await updateDoc(doc(getPandaMeDb(), 'bookings', bookingId, 'guests', uid), {
    status,
    respondedAt: serverTimestamp(),
  });
}

export function subscribePandaGuestStatuses(
  uid: string,
  callback: (statuses: Record<string, string>) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const guestQuery = query(
    collectionGroup(getPandaMeDb(), 'guests'),
    where('uid', '==', uid),
    limit(50),
  );
  return onSnapshot(
    guestQuery,
    (snapshot) => {
      const statuses: Record<string, string> = {};
      for (const item of snapshot.docs) {
        const bookingId = item.ref.parent.parent?.id;
        if (bookingId) statuses[bookingId] = String(item.data().status || 'invited');
      }
      callback(statuses);
    },
    onError,
  );
}

export function subscribePandaThreads(
  uid: string,
  callback: (items: PandaThread[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const threadsQuery = query(
    collection(getPandaMeDb(), 'threads'),
    where('participantUids', 'array-contains', uid),
    orderBy('updatedAt', 'desc'),
    limit(30),
  );
  return onSnapshot(
    threadsQuery,
    (snapshot) =>
      callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as PandaThread)),
    onError,
  );
}

export function subscribePandaMessages(
  threadId: string,
  callback: (items: PandaMessage[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const messagesQuery = query(
    collection(getPandaMeDb(), 'threads', threadId, 'messages'),
    orderBy('createdAt', 'asc'),
    limit(100),
  );
  return onSnapshot(
    messagesQuery,
    (snapshot) =>
      callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as PandaMessage)),
    onError,
  );
}

export async function sendPandaMessage(
  thread: PandaThread,
  senderUid: string,
  text: string,
  type: 'text' | 'venue' | 'table_invite' = 'text',
  venue?: PandaSharedVenue,
  bookingId?: string,
) {
  const db = getPandaMeDb();
  const threadRef = doc(db, 'threads', thread.id);
  const messageRef = doc(collection(db, 'threads', thread.id, 'messages'));
  const unreadBy = thread.participantUids.filter((uid) => uid !== senderUid);
  const batch = writeBatch(db);
  batch.set(
    threadRef,
    {
      participantUids: thread.participantUids,
      participantProfiles: thread.participantProfiles || [],
      ...(thread.title ? { title: thread.title } : {}),
      lastMessage: { type, text, venueName: venue?.name, bookingId },
      unreadBy,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  batch.set(messageRef, {
    senderUid,
    type,
    text: text.trim(),
    ...(venue ? { venue } : {}),
    ...(bookingId ? { bookingId } : {}),
    createdAt: serverTimestamp(),
  });
  await batch.commit();
}

export async function markPandaThreadRead(threadId: string, uid: string) {
  await updateDoc(doc(getPandaMeDb(), 'threads', threadId), {
    unreadBy: arrayRemove(uid),
    updatedAt: serverTimestamp(),
  });
}

export type PandaCirclePulseItem = {
  id: string;
  friendUid: string;
  friendName: string;
  friendHandle: string;
  placeName: string;
  category: string;
  neighborhood: string;
  photoUri?: string | null;
  savedAt?: unknown;
};

export function subscribePandaCirclePulse(
  friends: PandaFriend[],
  callback: (items: PandaCirclePulseItem[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const db = getPandaMeDb();
  const byFriend = new Map<string, PandaCirclePulseItem[]>();
  const emit = () => {
    const fresh = [...byFriend.values()]
      .flat()
      .filter((item) => {
        const timestamp = item.savedAt as { toMillis?: () => number } | undefined;
        return !timestamp?.toMillis || Date.now() - timestamp.toMillis() < 30 * 24 * 60 * 60 * 1000;
      })
      .sort((a, b) => {
        const aTime = (a.savedAt as { toMillis?: () => number } | undefined)?.toMillis?.() || 0;
        const bTime = (b.savedAt as { toMillis?: () => number } | undefined)?.toMillis?.() || 0;
        return bTime - aTime;
      })
      .slice(0, 12);
    callback(fresh);
  };
  const subscriptions = friends.slice(0, 12).map((friend) =>
    onSnapshot(
      query(
        collection(db, 'users', friend.uid, 'saved_venues'),
        orderBy('savedAt', 'desc'),
        limit(3),
      ),
      (snapshot) => {
        byFriend.set(
          friend.uid,
          snapshot.docs.map((item) => ({
            id: friend.uid + ':' + item.id,
            friendUid: friend.uid,
            friendName: friend.name,
            friendHandle: friend.handle,
            placeName: String(item.data().name || 'A saved place'),
            category: String(item.data().category || 'Place'),
            neighborhood: String(item.data().neighborhood || ''),
            photoUri: typeof item.data().photoUri === 'string' ? item.data().photoUri : null,
            savedAt: item.data().savedAt,
          })),
        );
        emit();
      },
      onError,
    ),
  );
  emit();
  return () => subscriptions.forEach((unsubscribe) => unsubscribe());
}

export function subscribePandaPromotions(
  callback: (items: PandaPromotion[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const offers = query(
    collection(getPandaMeDb(), 'promotions'),
    where('active', '==', true),
    orderBy('priority', 'desc'),
    limit(12),
  );
  return onSnapshot(
    offers,
    (snapshot) =>
      callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as PandaPromotion)),
    onError,
  );
}

export function subscribePandaSavedPlaces(
  uid: string,
  callback: (items: Array<{ id: string; [key: string]: unknown }>) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const saved = query(
    collection(getPandaMeDb(), 'users', uid, 'saved_venues'),
    orderBy('savedAt', 'desc'),
    limit(30),
  );
  return onSnapshot(
    saved,
    (snapshot) => callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
    onError,
  );
}

export async function savePandaPlace(
  uid: string,
  venue: Venue,
  status: 'want-to-try' | 'visited' = 'want-to-try',
) {
  await setDoc(
    doc(getPandaMeDb(), 'users', uid, 'saved_venues', venue.id),
    {
      placeId: venue.id,
      name: venue.name,
      category: venue.category,
      neighborhood: venue.neighborhood,
      formattedAddress: venue.fullAddress,
      latitude: venue.latitude ?? null,
      longitude: venue.longitude ?? null,
      photoUri: venue.primaryPhotoPath ?? venue.photoUris?.[0]?.uri ?? null,
      status,
      savedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function unsavePandaPlace(uid: string, placeId: string) {
  const db = getPandaMeDb();
  await deleteDoc(doc(db, 'users', uid, 'saved_venues', placeId));
}

export async function setPandaPromotionForTable(bookingId: string, promotionId: string) {
  await updateDoc(doc(getPandaMeDb(), 'bookings', bookingId), {
    promotionId,
    updatedAt: serverTimestamp(),
  });
}

export function subscribePandaUnread(
  uid: string,
  callback: (unread: boolean) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const db = getPandaMeDb();
  let incoming = false;
  let invite = false;
  let threadsUnread = false;
  const emit = () => callback(incoming || invite || threadsUnread);
  const a = onSnapshot(
    query(
      collection(db, 'friend_requests'),
      where('toUid', '==', uid),
      where('status', '==', 'pending'),
      limit(1),
    ),
    (s) => {
      incoming = !s.empty;
      emit();
    },
    onError,
  );
  const b = onSnapshot(
    query(
      collectionGroup(db, 'guests'),
      where('uid', '==', uid),
      where('status', '==', 'invited'),
      limit(1),
    ),
    (s) => {
      invite = !s.empty;
      emit();
    },
    onError,
  );
  const c = onSnapshot(
    query(
      collection(db, 'threads'),
      where('participantUids', 'array-contains', uid),
      orderBy('updatedAt', 'desc'),
      limit(30),
    ),
    (s) => {
      threadsUnread = s.docs.some(
        (item) => Array.isArray(item.data().unreadBy) && item.data().unreadBy.includes(uid),
      );
      emit();
    },
    onError,
  );
  return () => {
    a();
    b();
    c();
  };
}

export function snapshotItems<T extends DocumentData>(snapshot: QuerySnapshot<T>) {
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}
