// src/firebase.js

import { initializeApp } from "firebase/app";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: "AIzaSyC8UB5pQlgE74uX2UDMaGn408nbLDGCx4o",
  authDomain: "attendsync-66e55.firebaseapp.com",
  projectId: "attendsync-66e55",
  storageBucket: "attendsync-66e55.firebasestorage.app",
  messagingSenderId: "569924889706",
  appId: "1:569924889706:web:9ce46e690ad424e5cfae13",
};

const app = initializeApp(firebaseConfig);

// Offline persistence: attendance submitted with no network is stored
// permanently on the device (not just in temporary memory) and syncs
// automatically the next time the app opens with a connection — even
// after the app was closed or the phone restarted. Previously-viewed
// data (sections, rosters) also becomes available offline.
// persistentMultipleTabManager keeps this working even if the app is
// open in more than one browser tab at once.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});

export const auth = getAuth(app);
export const functions = getFunctions(app);
