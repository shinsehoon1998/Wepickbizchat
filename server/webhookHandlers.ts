import { getStripeSync } from './stripeClient';
import { storage } from './storage';

const processedSessions = new Set<string>();

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string, uuid: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'This usually means express.json() parsed the body before reaching this handler. ' +
        'FIX: Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature, uuid);
    
    const event = JSON.parse(payload.toString());
    
    if (event.type === 'checkout.session.completed') {
      const session = event.data?.object;
      const sessionId = session?.id;
      
      if (!sessionId || processedSessions.has(sessionId)) {
        console.log(`Session ${sessionId} already processed (in-memory cache), skipping`);
        return;
      }
      
      if (session?.metadata?.type === 'balance_charge' && session?.payment_status === 'paid') {
        const userId = session.metadata.userId;
        const amount = session.amount_total || parseInt(session.metadata.amount || '0');
        
        if (userId && amount > 0) {
          try {
            const result = await storage.creditBalanceAtomically(userId, amount, sessionId);
            
            if (result.success) {
              processedSessions.add(sessionId);
              console.log(`Balance credited atomically: User ${userId} received ${amount} KRW (session ${sessionId})`);
            } else if (result.alreadyProcessed) {
              processedSessions.add(sessionId);
              console.log(`Session ${sessionId} already processed (database check), skipping`);
            } else {
              console.error(`Failed to credit balance: ${result.error}`);
            }
          } catch (error) {
            console.error('Error processing balance credit:', error);
          }
        }
      }
    }
  }
}
