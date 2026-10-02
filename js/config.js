// Firebase web config — paste it from Firebase console → Project settings → Your apps → Web app.
// While projectId is empty the tracker runs in "this device only" mode (saved in the browser).
export const firebaseConfig = {
  apiKey: 'AIzaSyC5KzhT8R7x9mVtzl4AkrJyrzAEfZ9X1PQ',
  authDomain: 'my-tracker-36bb7.firebaseapp.com',
  projectId: 'my-tracker-36bb7',
  storageBucket: 'my-tracker-36bb7.firebasestorage.app',
  messagingSenderId: '586961414987',
  appId: '1:586961414987:web:179a9efa90ecceb60096ce',
};

// Instagram account the nightly job fetches, and the day consistency tracking starts from.
export const INSTA = {
  username: 'sagarpatro604',
  trackingStart: '2026-08-01',
};
