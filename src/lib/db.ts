import { db } from './firebase';
import { collection, doc, getDocs, setDoc, deleteDoc, updateDoc, writeBatch } from 'firebase/firestore';

export const dbService = {
  async getAccountingPositions(userId: string) {
    const querySnapshot = await getDocs(collection(db, `users_data/${userId}/accountingPositions`));
    const positions: any[] = [];
    querySnapshot.forEach((doc) => {
      positions.push(doc.data());
    });
    return positions;
  },

  async setAccountingPosition(userId: string, position: any) {
    const posRef = doc(db, `users_data/${userId}/accountingPositions`, position.id);
    await setDoc(posRef, position);
  },

  async deleteAccountingPosition(userId: string, positionId: string) {
    const posRef = doc(db, `users_data/${userId}/accountingPositions`, positionId);
    await deleteDoc(posRef);
  },
  
  async syncAllPositions(userId: string, positions: any[]) {
    // Basic sync: just overwrite the positions in Firestore based on the current local state.
    // In a real app, you would want to merge them or use timestamps.
    const batch = writeBatch(db);
    positions.forEach(pos => {
      const posRef = doc(db, `users_data/${userId}/accountingPositions`, pos.id);
      batch.set(posRef, pos);
    });
    await batch.commit();
  },

  async addInvoice(userId: string, positionId: string, invoice: any) {
    const invRef = doc(collection(db, `users_data/${userId}/accountingPositions/${positionId}/invoices`), invoice.id);
    await setDoc(invRef, invoice);
  },

  async deleteInvoice(userId: string, positionId: string, invoiceId: string) {
    const invRef = doc(db, `users_data/${userId}/accountingPositions/${positionId}/invoices`, invoiceId);
    await deleteDoc(invRef);
  },

  async addF24Entry(userId: string, positionId: string, entry: any) {
    const entRef = doc(collection(db, `users_data/${userId}/accountingPositions/${positionId}/f24Entries`), entry.id);
    await setDoc(entRef, entry);
  }
};

