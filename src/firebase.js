// src/firebase.js

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
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
export const db = getFirestore(app);
export const auth = getAuth(app);
export const functions = getFunctions(app);
