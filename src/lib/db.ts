import { db } from './firebase';
import { collection, doc, getDocs, setDoc, deleteDoc, updateDoc, writeBatch } from 'firebase/firestore';

export const dbService = {
  async setAccountingPosition(userId: string, position: any) {
    const posRef = doc(db, `users/${userId}/accountingPositions`, position.id);
    await setDoc(posRef, position);
  },
  
  async addInvoice(userId: string, positionId: string, invoice: any) {
    const invRef = doc(collection(db, `users/${userId}/accountingPositions/${positionId}/invoices`), invoice.id);
    await setDoc(invRef, invoice);
  },

  async deleteInvoice(userId: string, positionId: string, invoiceId: string) {
    const invRef = doc(db, `users/${userId}/accountingPositions/${positionId}/invoices`, invoiceId);
    await deleteDoc(invRef);
  },

  async addF24Entry(userId: string, positionId: string, entry: any) {
    const entRef = doc(collection(db, `users/${userId}/accountingPositions/${positionId}/f24Entries`), entry.id);
    await setDoc(entRef, entry);
  }
};
