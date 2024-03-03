import { firestore } from "../firebaseConfig";

import {
  collection,
  doc,
  getDoc,
  increment,
  runTransaction,
  setDoc,
  getDocs,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { uploadImageAsync } from "./storage";
import { Listing, ListingId, User, UserId } from "../types";

/**
 * Retrieves a document from Firestore.
 * @param {string} path - The path to the document in Firestore.
 * @returns {Promise<any>} - The document data or null if not found.
 */
const getDocument = async (path: string): Promise<any> => {
  const documentRef = doc(firestore, path);
  const documentSnapshot = await getDoc(documentRef);
  if (documentSnapshot.exists()) {
    return documentSnapshot.data();
  } else {
    console.log("No such document!");
    return null;
  }
};

/**
 * Sets or updates a document in Firestore.
 * @param {string} path - The path to the document in Firestore.
 * @param {Object} data - The data to set or update in the document.
 * @param {boolean} merge - Whether to merge the data with the existing document.
 * @returns {Promise<void>}
 */
const setDocument = async (
  path: string,
  data: Object,
  merge: boolean = true
): Promise<void> => {
  const documentRef = doc(firestore, path);
  await setDoc(documentRef, data, { merge: true });
};

/**
 * Uploads listing data to Firestore database.
 * @param {ListingId} listingId - The unique identifier for the listing.
 * @param {UserId} sellerId - The unique identifier for the seller.
 * @param {string} title - The title of the listing.
 * @param {number} price - The price of the listing.
 * @param {Date} datePosted - The date the listing was posted.
 * @param {string} description - The description of the listing.
 * @param {string[]} categories - The categories of the listing.
 * @param {boolean} isListingActive - The status of the listing.
 * @param {string[]} allInteractions - All interactions related to the listing.
 * @param {string} [imagePath] - The path of the image associated with the listing.
 * @returns {Promise<void>}
 */
const uploadListing = async ({
  sellerId,
  title,
  price,
  image,
  datePosted,
  description,
  categories,
  isListingActive,
}: {
  sellerId: UserId;
  title: string;
  price: number;
  datePosted: Date;
  image: string | null;
  description: string;
  categories: string[];
  isListingActive: boolean;
}): Promise<void> => {
  await runTransaction(firestore, async (transaction) => {
    const collectionRef = collection(firestore, "listings");
    const documentRef = doc(collectionRef);
    let uploadUrl = null;

    if (image) {
      uploadUrl = await uploadImageAsync(image, documentRef.id);
    }

    // First, read all necessary documents
    const categoryRefs = categories.map((category) =>
      doc(firestore, "categories", category)
    );
    const categoryDocs = await Promise.all(
      categoryRefs.map((categoryRef) => transaction.get(categoryRef))
    );

    // Then, proceed with writes
    const listingData = {
      listingId: documentRef.id,
      sellerId: sellerId,
      title: title,
      price: price,
      datePosted: datePosted,
      description: description,
      categories: categories,
      isListingActive: isListingActive,
      ...(uploadUrl && { imagePath: uploadUrl }),
    } as Listing;

    transaction.set(documentRef, listingData);

    categoryDocs.forEach((categoryDoc, index) => {
      const categoryRef = categoryRefs[index];
      if (categoryDoc.exists()) {
        transaction.update(categoryRef, { countActiveListings: increment(1) });
      } else {
        transaction.set(categoryRef, { countActiveListings: 1 });
      }
    });
  });
};

const getUserProfile = async (userId: UserId): Promise<User | null> => {
  try {
    const userRef = doc(firestore, "users", userId);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      return userSnap.data() as User;
    } else {
      console.log("No such user!");
      return null;
    }
  } catch (error) {
    console.error("Error fetching user:", error);
    return null;
  }
};

/**
 * Retrieves all listings from Firestore.
 * @returns {Promise<Listing[]>} - An array of all listing documents.
 */
const getAllListings = async (
  id: UserId
): Promise<{ [id: ListingId]: Listing }> => {
  const listingsRef = query(
    collection(firestore, "listings"),
    where("sellerId", "!=", id)
  );
  const querySnapshot = await getDocs(listingsRef);
  return querySnapshot.docs.reduce(
    (acc, doc) => ({
      ...acc,
      [doc.id]: doc.data(),
    }),
    {}
  ) as { [id: string]: Listing };
};
const createPostListingListener = ({
  userId,
  setListings,
}: {
  userId: UserId;
  setListings: (listings: { [id: ListingId]: Listing } | null) => void;
}): (() => void) => {
  const q = query(
    collection(firestore, "listings"),
    where("sellerId", "!=", userId)
  );
  const unsubscribe = onSnapshot(q, (querySnapshot) => {
    const newListings = querySnapshot.docs.reduce(
      (acc, doc) => ({
        ...acc,
        [doc.id]: doc.data(),
      }),
      {}
    ) as { [id: string]: Listing };
    setListings(newListings); // Assuming you want to do something with newListings here
  });
  return unsubscribe;
};
export {
  getDocument,
  setDocument,
  uploadListing,
  getAllListings,
  getUserProfile,
  createPostListingListener,
};
