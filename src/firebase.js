// src/firebase.js — No OTP, Firestore only

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCa73KxNkMgmxOVPdczrCeP8LWCVrI7xWs",
  authDomain: "attendsync-66e55.firebaseapp.com",
  projectId: "attendsync-66e55",
  storageBucket: "attendsync-66e55.firebasestorage.app",
  messagingSenderId: "569924889706",
  appId: "1:569924889706:web:9ce46e690ad424e5cfae13",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);