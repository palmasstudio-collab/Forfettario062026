import { db } from './firebase';
import { collection, doc, getDocs, setDoc, deleteDoc, writeBatch } from 'firebase/firestore';

export const dbService = {
  async getAccountingPositions(userId: string) {
    try {
      const querySnapshot = await getDocs(collection(db, `users_data/${userId}/accountingPositions`));
      const positions: any[] = [];
      querySnapshot.forEach((doc) => {
        positions.push(doc.data());
      });
      return positions;
    } catch (err) {
      console.warn("Firestore positions fetch failed (operating in offline local storage mode):", err);
      return [];
    }
  },

  async setAccountingPosition(userId: string, position: any) {
    try {
      const posRef = doc(db, `users_data/${userId}/accountingPositions`, position.id);
      await setDoc(posRef, position, { merge: true });
    } catch (err) {
      console.warn("Firestore position save failed (operating in offline local storage mode):", err);
    }
  },

  async deleteAccountingPosition(userId: string, positionId: string) {
    try {
      const posRef = doc(db, `users_data/${userId}/accountingPositions`, positionId);
      await deleteDoc(posRef);
    } catch (err) {
      console.warn("Firestore position delete failed (operating in offline local storage mode):", err);
    }
  },
  
  async syncAllPositions(userId: string, positions: any[]) {
    try {
      const batch = writeBatch(db);
      positions.forEach(pos => {
        const posRef = doc(db, `users_data/${userId}/accountingPositions`, pos.id);
        batch.set(posRef, pos, { merge: true });
      });
      await batch.commit();
    } catch (err) {
      console.warn("Firestore syncAllPositions failed (operating in offline local storage mode):", err);
    }
  },

  async addInvoice(userId: string, positionId: string, invoice: any) {
    try {
      const invRef = doc(collection(db, `users_data/${userId}/accountingPositions/${positionId}/invoices`), invoice.id);
      await setDoc(invRef, invoice, { merge: true });
    } catch (err) {
      console.warn("Firestore addInvoice failed (operating in offline local storage mode):", err);
    }
  },

  async deleteInvoice(userId: string, positionId: string, invoiceId: string) {
    try {
      const invRef = doc(db, `users_data/${userId}/accountingPositions/${positionId}/invoices`, invoiceId);
      await deleteDoc(invRef);
    } catch (err) {
      console.warn("Firestore deleteInvoice failed (operating in offline local storage mode):", err);
    }
  },

  async addF24Entry(userId: string, positionId: string, entry: any) {
    try {
      const entRef = doc(collection(db, `users_data/${userId}/accountingPositions/${positionId}/f24Entries`), entry.id);
      await setDoc(entRef, entry, { merge: true });
    } catch (err) {
      console.warn("Firestore addF24Entry failed (operating in offline local storage mode):", err);
    }
  }
};
