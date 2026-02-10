

import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';
import 'firebase/compat/storage';

// Your web app's Firebase configuration
export const firebaseConfig = {
  apiKey: "AIzaSyDoZogEDkVR__NC8XDcSlG1QyR_LtulrJg",
  authDomain: "order-accuracy-ce844.firebaseapp.com",
  projectId: "order-accuracy-ce844",
  storageBucket: "order-accuracy-ce844.firebasestorage.app",
  messagingSenderId: "937707312616",
  appId: "1:937707312616:web:7a43b01af87dfd4602005d"
};

// Initialize Firebase
// Check if already initialized to avoid hot reload errors
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const app = firebase.app();
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

export { firebase, app, auth, db, storage };
