import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { arrayUnion, collection, doc, getDoc, getDocs, limit, query, serverTimestamp, setDoc, updateDoc, where, writeBatch, Timestamp } from 'firebase/firestore';

test('Panda Me rules protect profile data and allow only accepted-friend features', async () => {
  const env = await initializeTestEnvironment({
    projectId: 'demo-panda-me-pr6',
    firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') },
  });
  try {
    await env.clearFirestore();
    const alice = env.authenticatedContext('alice').firestore();
    const bob = env.authenticatedContext('bob').firestore();
    const mallory = env.authenticatedContext('mallory').firestore();

    const profile = (uid, name) => ({
      uid, name, handle: name.toLowerCase() + '-1234',
      handleLower: name.toLowerCase() + '-1234', avatar: null,
      displayNameLower: name.toLowerCase(), discoverable: true,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    await assertSucceeds(setDoc(doc(alice, 'users', 'alice'), { name: 'Alice', handle: 'alice-1234', updatedAt: serverTimestamp() }));
    await assertSucceeds(setDoc(doc(bob, 'users', 'bob'), { name: 'Bob', handle: 'bob-1234', updatedAt: serverTimestamp() }));
    await assertSucceeds(setDoc(doc(alice, 'panda_profiles', 'alice'), profile('alice', 'Alice')));
    await assertSucceeds(setDoc(doc(bob, 'panda_profiles', 'bob'), profile('bob', 'Bob')));
    const handleSearch = await assertSucceeds(getDocs(query(
      collection(alice, 'panda_profiles'),
      where('discoverable', '==', true),
      where('handleLower', '>=', 'bo'),
      where('handleLower', '<=', 'bo\uf8ff'),
      limit(12),
    )));
    assert.ok(handleSearch.docs.some(profileDoc => profileDoc.id === 'bob'));
    const nameSearch = await assertSucceeds(getDocs(query(
      collection(alice, 'panda_profiles'),
      where('discoverable', '==', true),
      where('displayNameLower', '>=', 'bo'),
      where('displayNameLower', '<=', 'bo\uf8ff'),
      limit(12),
    )));
    assert.ok(nameSearch.docs.some(profileDoc => profileDoc.id === 'bob'));

    await assertSucceeds(setDoc(doc(alice, 'users', 'alice'), {
      homeAddress: { label: 'Home', formattedAddress: '1 Test Street', lat: 51.5, lng: -0.1 },
      updatedAt: serverTimestamp(),
    }, { merge: true }));
    await assertFails(getDoc(doc(bob, 'users', 'alice')));
    await assertSucceeds(getDoc(doc(alice, 'users', 'alice')));

    const requestRef = doc(collection(alice, 'friend_requests'));
    await assertSucceeds(setDoc(requestRef, {
      fromUid: 'alice', fromName: 'Alice', fromHandle: 'alice-1234', fromAvatar: null,
      toUid: 'bob', status: 'pending', createdAt: serverTimestamp(),
    }));
    await assertFails(getDoc(doc(mallory, 'friend_requests', requestRef.id)));

    const bobRequestRef = doc(bob, 'friend_requests', requestRef.id);
    const accept = writeBatch(bob);
    accept.update(bobRequestRef, { status: 'accepted', respondedAt: serverTimestamp() });
    accept.set(doc(bob, 'users', 'alice', 'friends', 'bob'), {
      uid: 'bob', name: 'Bob', handle: 'bob-1234', avatar: null,
      requestId: requestRef.id, since: serverTimestamp(),
    });
    accept.set(doc(bob, 'users', 'bob', 'friends', 'alice'), {
      uid: 'alice', name: 'Alice', handle: 'alice-1234', avatar: null,
      requestId: requestRef.id, since: serverTimestamp(),
    });
    await assertSucceeds(accept.commit());

    const venueRef = doc(alice, 'users', 'alice', 'saved_venues', 'place-1');
    await assertSucceeds(setDoc(venueRef, {
      placeId: 'place-1', name: 'Panda Bistro', category: 'Restaurant', neighborhood: 'Soho',
      formattedAddress: '1 Test Street', latitude: 51.5, longitude: -0.1, photoUri: null,
      status: 'want-to-try', savedAt: serverTimestamp(), updatedAt: serverTimestamp(),
      venueData: { id: 'place-1', name: 'Panda Bistro', category: 'Restaurant', neighborhood: 'Soho' },
    }));
    await assertFails(getDoc(doc(bob, 'users', 'alice', 'saved_venues', 'place-1')));
    await assertSucceeds(getDoc(doc(alice, 'users', 'alice', 'saved_venues', 'place-1')));
    await assertFails(getDoc(doc(mallory, 'users', 'alice', 'saved_venues', 'place-1')));

    const thread = doc(alice, 'threads', 'table-chat');
    const group = writeBatch(alice);
    group.set(thread, {
      participantUids: ['alice', 'bob'],
      participantProfiles: [{ uid: 'alice', name: 'Alice', handle: 'alice-1234', avatar: null }, { uid: 'bob', name: 'Bob', handle: 'bob-1234', avatar: null }],
      title: 'Table at Panda Bistro', createdAt: serverTimestamp(),
      lastMessage: { type: 'table_invite', text: 'Alice invited everyone.' },
      unreadBy: ['bob'], updatedAt: serverTimestamp(),
    });
    group.set(doc(alice, 'threads', 'table-chat', 'messages', 'invite'), {
      senderUid: 'alice', type: 'table_invite', text: 'Alice invited everyone to dinner.',
      bookingId: 'plan-1', createdAt: serverTimestamp(),
    });
    await assertSucceeds(group.commit());
    await assertSucceeds(getDoc(doc(bob, 'threads', 'table-chat')));
    await assertSucceeds(getDoc(doc(bob, 'threads', 'table-chat', 'messages', 'invite')));
    await assertFails(getDoc(doc(mallory, 'threads', 'table-chat')));
    await assertSucceeds(updateDoc(doc(bob, 'threads', 'table-chat', 'messages', 'invite'), {
      deletedForUids: arrayUnion('bob'),
    }));
    await assertSucceeds(getDoc(doc(alice, 'threads', 'table-chat', 'messages', 'invite')));
    await assertSucceeds(updateDoc(doc(alice, 'threads', 'table-chat', 'messages', 'invite'), {
      deletedForUids: arrayUnion('alice'),
    }));
    await assertFails(updateDoc(doc(mallory, 'threads', 'table-chat', 'messages', 'invite'), {
      deletedForUids: arrayUnion('mallory'),
    }));

    const badThread = writeBatch(mallory);
    badThread.set(doc(mallory, 'threads', 'forged'), {
      participantUids: ['mallory', 'bob'], participantProfiles: [], updatedAt: serverTimestamp(), unreadBy: [],
    });
    await assertFails(badThread.commit());

    const booking = doc(alice, 'bookings', 'plan-1');
    const plan = writeBatch(alice);
    plan.set(booking, {
      hostUid: 'alice', venuePlaceId: null, venueName: 'Panda Bistro', venuePhoto: null,
      neighborhood: 'Soho', venueAddress: '', venueLat: null, venueLng: null,
      dateTime: Timestamp.fromDate(new Date(Date.now() + 86_400_000)), partySize: 4,
      notes: '', status: 'upcoming', source: 'manual', promotionId: null,
      guestUids: ['alice', 'bob'], createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    plan.set(doc(alice, 'bookings', 'plan-1', 'guests', 'alice'), {
      uid: 'alice', name: 'Alice', handle: 'alice-1234', avatar: null,
      status: 'going', invitedAt: serverTimestamp(), respondedAt: serverTimestamp(),
    });
    plan.set(doc(alice, 'bookings', 'plan-1', 'guests', 'bob'), {
      uid: 'bob', name: 'Bob', handle: 'bob-1234', avatar: null,
      status: 'invited', invitedAt: serverTimestamp(),
    });
    await assertSucceeds(plan.commit());
    await assertSucceeds(getDoc(doc(bob, 'bookings', 'plan-1')));
    await assertFails(getDoc(doc(mallory, 'bookings', 'plan-1')));
    await assertSucceeds(updateDoc(doc(bob, 'bookings', 'plan-1', 'guests', 'bob'), {
      status: 'going', respondedAt: serverTimestamp(),
    }));
    await assertFails(updateDoc(booking, { partySize: 3.5, updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(booking, { partySize: 3, updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(booking, { status: 'cancelled', updatedAt: serverTimestamp() }));
  } finally {
    await env.cleanup();
  }
});
